/**
 * ==========================================================================
 * CỤM KẾ TOÁN / HỌC PHÍ (Người 3 - ACCOUNTANT)
 * --------------------------------------------------------------------------
 * UC9.1   Ghi nhận & tra cứu công nợ học phí (hóa đơn tự tạo ở UC4.2)
 * UC9.2   Cập nhật trạng thái thanh toán UNPAID -> PARTIAL -> PAID (DF34, DF35)
 * UC9.3   Xuất mã VietQR (DF32, DF33) & In phiếu thu / biên lai (DF35)
 * UC9.4*  Học viên kiểm tra công nợ cá nhân (DF30)
 * UC10.2  Trigger 3: Thông báo nhắc nợ học phí loại TUITION (DF08b)
 * UC11.1b* Thống kê doanh thu đã thu vs còn nợ theo tháng (DF12b)
 * ==========================================================================
 */
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const prisma = require('../../config/prisma');
const { generateVietQRData } = require('../../utils/vietqrGenerator');
const { numberToVietnameseWords } = require('../../utils/numberToWords');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

const FINANCE_ROLES = ['ACCOUNTANT', 'ADMIN'];
const PAYMENT_METHODS = ['CASH', 'BANK_TRANSFER', 'VIETQR'];

const INVOICE_INCLUDE = {
  student: { select: { id: true, code: true, fullName: true, email: true, phone: true } },
  enrollment: {
    include: {
      class: { include: { course: true } }
    }
  },
  payments: {
    orderBy: { paidAt: 'asc' },
    include: { collectedBy: { select: { code: true, fullName: true } } }
  }
};

const startOfToday = () => {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
};

const formatVnd = (n) => `${Number(n).toLocaleString('vi-VN')} đ`;

const mapPayment = (p) => ({
  id: p.id,
  receiptNo: p.receiptNo,
  amount: Number(p.amount),
  method: p.method,
  note: p.note,
  paidAt: p.paidAt,
  collectedBy: p.collectedBy ? `${p.collectedBy.fullName} (${p.collectedBy.code})` : null
});

const mapInvoice = (inv) => {
  const amount = Number(inv.amount);
  const paidAmount = Number(inv.paidAmount);
  const remainingAmount = Math.max(0, amount - paidAmount);
  return {
    id: inv.id,
    student: inv.student,
    enrollmentId: inv.enrollmentId,
    classId: inv.enrollment.class.id,
    classCode: inv.enrollment.class.classCode,
    semester: inv.enrollment.class.semester,
    courseCode: inv.enrollment.class.course.courseCode,
    courseName: inv.enrollment.class.course.name,
    amount,
    paidAmount,
    remainingAmount,
    status: inv.status,
    dueDate: inv.dueDate,
    paidAt: inv.paidAt,
    createdAt: inv.createdAt,
    isOverdue: inv.status !== 'PAID' && new Date(inv.dueDate) < startOfToday(),
    payments: (inv.payments || []).map(mapPayment)
  };
};

// Kiểm tra quyền xem hóa đơn: Kế toán/Admin xem tất cả, Học viên chỉ xem của mình
const canViewInvoice = (user, invoice) =>
  FINANCE_ROLES.includes(user.role) || (user.role === 'STUDENT' && invoice.studentId === user.id);

// ==========================================
// UC9.1 / UC9.4*: Danh sách hóa đơn & công nợ
// ==========================================
router.get(
  '/tuition-invoices',
  authenticateJWT,
  authorizeRoles('ACCOUNTANT', 'ADMIN', 'STUDENT'),
  async (req, res) => {
    try {
      const { role, id: userId } = req.user;
      const { status, studentId, classId, semester, search, overdue } = req.query;

      const where = {};
      if (role === 'STUDENT') {
        where.studentId = userId;
      } else if (studentId) {
        where.studentId = parseInt(studentId);
      }

      if (status) {
        // Hỗ trợ lọc nhiều trạng thái: ?status=UNPAID,PARTIAL
        const statuses = String(status).split(',').filter(Boolean);
        where.status = statuses.length > 1 ? { in: statuses } : statuses[0];
      }

      if (classId || semester) {
        where.enrollment = {
          class: {
            ...(classId ? { id: parseInt(classId) } : {}),
            ...(semester ? { semester } : {})
          }
        };
      }

      if (search && role !== 'STUDENT') {
        const q = String(search).trim();
        where.OR = [
          { student: { code: { contains: q } } },
          { student: { fullName: { contains: q } } },
          { student: { email: { contains: q } } },
          { enrollment: { class: { classCode: { contains: q } } } },
          { enrollment: { class: { course: { courseCode: { contains: q } } } } }
        ];
      }

      if (overdue === 'true') {
        where.status = { not: 'PAID' };
        where.dueDate = { lt: startOfToday() };
      }

      const invoices = await prisma.tuitionInvoice.findMany({
        where,
        include: INVOICE_INCLUDE,
        orderBy: [{ dueDate: 'asc' }, { id: 'desc' }]
      });

      const data = invoices.map(mapInvoice);

      const summary = data.reduce(
        (acc, inv) => {
          acc.totalAmount += inv.amount;
          acc.paidAmount += inv.paidAmount;
          acc.remainingAmount += inv.remainingAmount;
          acc[inv.status] += 1;
          if (inv.isOverdue) acc.overdueCount += 1;
          return acc;
        },
        { totalAmount: 0, paidAmount: 0, remainingAmount: 0, UNPAID: 0, PARTIAL: 0, PAID: 0, overdueCount: 0 }
      );

      return successResponse(res, { summary, invoices: data }, 'Lấy danh sách hóa đơn thành công');
    } catch (error) {
      console.error('Error fetching tuition invoices:', error);
      return errorResponse(res, 'Lỗi lấy hóa đơn học phí', 500);
    }
  }
);

// Chi tiết 1 hóa đơn kèm lịch sử các đợt thu
router.get('/tuition-invoices/:id', authenticateJWT, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const invoice = await prisma.tuitionInvoice.findUnique({ where: { id }, include: INVOICE_INCLUDE });

    if (!invoice) return errorResponse(res, 'Không tìm thấy hóa đơn học phí', 404);
    if (!canViewInvoice(req.user, invoice)) {
      return errorResponse(res, 'Bạn không có quyền xem hóa đơn này', 403);
    }

    return successResponse(res, mapInvoice(invoice), 'Lấy chi tiết hóa đơn thành công');
  } catch (error) {
    console.error('Error fetching invoice detail:', error);
    return errorResponse(res, 'Lỗi lấy chi tiết hóa đơn', 500);
  }
});

// ==========================================
// UC9.2: Ghi nhận thanh toán (cộng dồn paid_amount, UNPAID -> PARTIAL -> PAID)
// ==========================================
router.patch('/tuition-invoices/:id/pay', authenticateJWT, authorizeRoles('ACCOUNTANT'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { amountPaid, method = 'BANK_TRANSFER', note } = req.body;

    const payment = Math.round(Number(amountPaid));
    if (!Number.isFinite(payment) || payment <= 0) {
      return errorResponse(res, 'Số tiền thanh toán phải lớn hơn 0', 400);
    }
    if (!PAYMENT_METHODS.includes(method)) {
      return errorResponse(res, 'Hình thức thanh toán không hợp lệ', 400);
    }

    const result = await prisma.$transaction(async (tx) => {
      const invoice = await tx.tuitionInvoice.findUnique({
        where: { id },
        include: { student: true, enrollment: { include: { class: { include: { course: true } } } } }
      });

      if (!invoice) {
        const err = new Error('Không tìm thấy hóa đơn học phí');
        err.status = 404;
        throw err;
      }

      const totalAmount = Number(invoice.amount);
      const currentPaid = Number(invoice.paidAmount);
      const remaining = totalAmount - currentPaid;

      // Luồng ngoại lệ: Hóa đơn đã PAID -> khóa không cho thu thêm
      if (invoice.status === 'PAID' || remaining <= 0) {
        const err = new Error('Hóa đơn đã thanh toán đủ (PAID), không thể thu thêm');
        err.status = 400;
        throw err;
      }

      // Luồng ngoại lệ: paid_amount mới vượt quá amount
      if (payment > remaining) {
        const err = new Error(
          `Số tiền thu (${formatVnd(payment)}) vượt quá số tiền còn nợ (${formatVnd(remaining)})`
        );
        err.status = 400;
        throw err;
      }

      const newPaidAmount = currentPaid + payment;
      const newStatus = newPaidAmount >= totalAmount ? 'PAID' : 'PARTIAL';
      const now = new Date();

      // Khóa lạc quan: chỉ cập nhật khi paid_amount chưa bị người khác thay đổi
      // (chống thu trùng khi 2 kế toán bấm cùng lúc trên cùng 1 hóa đơn)
      const locked = await tx.tuitionInvoice.updateMany({
        where: { id, paidAmount: invoice.paidAmount, status: { not: 'PAID' } },
        data: { paidAmount: newPaidAmount, status: newStatus, paidAt: newStatus === 'PAID' ? now : null }
      });
      if (locked.count !== 1) throw Object.assign(new Error('Hóa đơn vừa được cập nhật bởi người khác, vui lòng tải lại'), { status: 409 });
      const updated = await tx.tuitionInvoice.findUnique({ where: { id } });

      // Tạo phiếu thu cho đợt này. Số phiếu: PT-YYYYMM-<id 5 chữ số>
      const tempNo = `TMP-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const created = await tx.tuitionPayment.create({
        data: {
          invoiceId: id,
          receiptNo: tempNo,
          amount: payment,
          method,
          note: note ? String(note).slice(0, 255) : null,
          collectedById: req.user.id,
          paidAt: now
        }
      });
      const ym = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}`;
      const receipt = await tx.tuitionPayment.update({
        where: { id: created.id },
        data: { receiptNo: `PT-${ym}-${String(created.id).padStart(5, '0')}` }
      });

      const courseCode = invoice.enrollment.class.course.courseCode;
      const remainingAfter = totalAmount - newPaidAmount;

      // Thông báo TUITION cho học viên (DF29)
      await tx.notification.create({
        data: {
          userId: invoice.studentId,
          title: newStatus === 'PAID' ? `Hoàn tất học phí môn ${courseCode}` : `Đã ghi nhận đóng học phí môn ${courseCode}`,
          message:
            `Phòng Kế toán đã ghi nhận khoản thanh toán ${formatVnd(payment)} (Phiếu thu ${receipt.receiptNo}) ` +
            `cho hóa đơn #${id}. ` +
            (newStatus === 'PAID' ? 'Bạn đã hoàn thành học phí môn này.' : `Số tiền còn nợ: ${formatVnd(remainingAfter)}.`),
          type: 'TUITION'
        }
      });

      return { invoice: updated, receipt, previousStatus: invoice.status, remainingAfter };
    });

    return successResponse(
      res,
      {
        invoiceId: id,
        status: result.invoice.status,
        previousStatus: result.previousStatus,
        paidAmount: Number(result.invoice.paidAmount),
        remainingAmount: result.remainingAfter,
        receipt: mapPayment(result.receipt)
      },
      `Ghi nhận thanh toán thành công. Trạng thái: ${result.previousStatus} → ${result.invoice.status}`
    );
  } catch (error) {
    if (error.status) return errorResponse(res, error.message, error.status);
    console.error('Error paying tuition invoice:', error);
    return errorResponse(res, 'Lỗi ghi nhận thanh toán', 500);
  }
});

// ==========================================
// UC9.3: Dữ liệu phiếu thu / biên lai để in trên trình duyệt (DF35)
// ==========================================
router.get('/tuition-payments/:id/receipt', authenticateJWT, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const payment = await prisma.tuitionPayment.findUnique({
      where: { id },
      include: {
        collectedBy: { select: { code: true, fullName: true } },
        invoice: { include: INVOICE_INCLUDE }
      }
    });

    if (!payment) return errorResponse(res, 'Không tìm thấy phiếu thu', 404);
    if (!canViewInvoice(req.user, payment.invoice)) {
      return errorResponse(res, 'Bạn không có quyền xem phiếu thu này', 403);
    }

    const invoice = mapInvoice(payment.invoice);
    // Số dư trước/sau tại thời điểm thu của đợt này
    const paidBefore = invoice.payments
      .filter((p) => new Date(p.paidAt) < new Date(payment.paidAt) || (String(p.paidAt) === String(payment.paidAt) && p.id < payment.id))
      .reduce((s, p) => s + p.amount, 0);
    const amount = Number(payment.amount);
    const installment = invoice.payments.findIndex((p) => p.id === payment.id) + 1;

    return successResponse(
      res,
      {
        organization: {
          name: process.env.ORG_NAME || 'TRƯỜNG ĐẠI HỌC FPT - EMS',
          address: process.env.ORG_ADDRESS || 'Khu CNC Hòa Lạc, Km29 Đại lộ Thăng Long, Hà Nội',
          phone: process.env.ORG_PHONE || '024 7300 5588'
        },
        receiptNo: payment.receiptNo,
        paidAt: payment.paidAt,
        method: payment.method,
        note: payment.note,
        installment,
        amount,
        amountInWords: numberToVietnameseWords(amount),
        collectedBy: payment.collectedBy ? `${payment.collectedBy.fullName} (${payment.collectedBy.code})` : null,
        student: invoice.student,
        invoice: {
          id: invoice.id,
          classCode: invoice.classCode,
          courseCode: invoice.courseCode,
          courseName: invoice.courseName,
          semester: invoice.semester,
          amount: invoice.amount,
          paidBefore,
          paidAfter: paidBefore + amount,
          remainingAfter: Math.max(0, invoice.amount - paidBefore - amount),
          currentStatus: invoice.status
        }
      },
      'Lấy dữ liệu phiếu thu thành công'
    );
  } catch (error) {
    console.error('Error fetching receipt:', error);
    return errorResponse(res, 'Lỗi lấy phiếu thu', 500);
  }
});

// ==========================================
// UC9.3: Xuất mã VietQR theo số tiền còn nợ (DF32 -> DF33)
// ==========================================
router.get('/tuition-invoices/:id/vietqr', authenticateJWT, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const invoice = await prisma.tuitionInvoice.findUnique({
      where: { id },
      include: {
        student: true,
        enrollment: { include: { class: { include: { course: true } } } }
      }
    });

    if (!invoice) return errorResponse(res, 'Không tìm thấy hóa đơn học phí', 404);
    if (!canViewInvoice(req.user, invoice)) {
      return errorResponse(res, 'Bạn không có quyền xem hóa đơn này', 403);
    }

    const remaining = Number(invoice.amount) - Number(invoice.paidAmount);
    if (remaining <= 0 || invoice.status === 'PAID') {
      return errorResponse(res, 'Hóa đơn đã thanh toán đủ, không cần tạo mã VietQR', 400);
    }

    const qrData = generateVietQRData({
      amount: remaining,
      studentCode: invoice.student.code,
      courseCode: invoice.enrollment.class.course.courseCode,
      classCode: invoice.enrollment.class.classCode,
      invoiceId: invoice.id
    });

    return successResponse(
      res,
      {
        ...qrData,
        studentName: invoice.student.fullName,
        courseName: invoice.enrollment.class.course.name,
        totalAmount: Number(invoice.amount),
        paidAmount: Number(invoice.paidAmount),
        status: invoice.status
      },
      'Tạo mã thanh toán VietQR thành công'
    );
  } catch (error) {
    console.error('Error generating VietQR:', error);
    return errorResponse(res, 'Lỗi tạo mã VietQR', 500);
  }
});

// ==========================================
// UC10.2 (Trigger 3): Gửi thông báo nhắc đóng học phí loại TUITION (DF08b)
// Body: { invoiceIds?: number[], onlyOverdue?: boolean, note?: string }
// Không truyền invoiceIds -> gửi cho toàn bộ hóa đơn chưa PAID
// ==========================================
router.post('/tuition-invoices/reminders', authenticateJWT, authorizeRoles('ACCOUNTANT'), async (req, res) => {
  try {
    const { invoiceIds, onlyOverdue, note } = req.body || {};

    const where = { status: { not: 'PAID' } };
    if (Array.isArray(invoiceIds) && invoiceIds.length > 0) {
      where.id = { in: invoiceIds.map((x) => parseInt(x)).filter(Number.isFinite) };
    }
    if (onlyOverdue) {
      where.dueDate = { lt: startOfToday() };
    }

    const invoices = await prisma.tuitionInvoice.findMany({
      where,
      include: {
        student: { select: { id: true, code: true, fullName: true } },
        enrollment: { include: { class: { include: { course: true } } } }
      }
    });

    if (invoices.length === 0) {
      return errorResponse(res, 'Không có hóa đơn nào còn nợ phù hợp để gửi nhắc', 400);
    }

    const today = startOfToday();
    const extra = note ? ` Ghi chú: ${String(note).trim()}` : '';

    await prisma.notification.createMany({
      data: invoices.map((inv) => {
        const remaining = Number(inv.amount) - Number(inv.paidAmount);
        const course = inv.enrollment.class.course;
        const due = new Date(inv.dueDate);
        const dueText = due.toLocaleDateString('vi-VN');
        const overdueText = due < today ? ` (ĐÃ QUÁ HẠN từ ${dueText})` : ` trước ngày ${dueText}`;
        return {
          userId: inv.studentId,
          title: `Nhắc đóng học phí môn ${course.courseCode}`,
          message:
            `Học viên ${inv.student.fullName} (${inv.student.code}) còn nợ ${formatVnd(remaining)} học phí ` +
            `môn ${course.name} - lớp ${inv.enrollment.class.classCode}. Vui lòng hoàn tất${overdueText}. ` +
            `Bạn có thể thanh toán bằng mã VietQR tại mục "Học phí & VietQR" với nội dung "${inv.student.code} ${course.courseCode}".${extra}`,
          type: 'TUITION'
        };
      })
    });

    const uniqueStudents = new Set(invoices.map((i) => i.studentId)).size;
    return successResponse(
      res,
      { invoiceCount: invoices.length, studentCount: uniqueStudents },
      `Đã gửi ${invoices.length} thông báo nhắc học phí tới ${uniqueStudents} học viên`,
      201
    );
  } catch (error) {
    console.error('Error sending tuition reminders:', error);
    return errorResponse(res, 'Lỗi gửi thông báo nhắc học phí', 500);
  }
});

// ==========================================
// UC11.1b*: Thống kê doanh thu học phí theo tháng (DF12b)
// Query: ?year=2026
// ==========================================
router.get('/analytics/tuition-revenue', authenticateJWT, authorizeRoles(...FINANCE_ROLES), async (req, res) => {
  try {
    const year = parseInt(req.query.year) || new Date().getFullYear();
    const yearStart = new Date(year, 0, 1);
    const yearEnd = new Date(year + 1, 0, 1);
    const today = startOfToday();
    const now = new Date();

    const [allInvoices, yearPayments, recentPayments] = await Promise.all([
      prisma.tuitionInvoice.findMany({
        include: {
          student: { select: { id: true, code: true, fullName: true, email: true, phone: true } },
          enrollment: { include: { class: { include: { course: true } } } }
        }
      }),
      prisma.tuitionPayment.findMany({
        where: { paidAt: { gte: yearStart, lt: yearEnd } },
        select: { amount: true, paidAt: true }
      }),
      prisma.tuitionPayment.findMany({
        take: 8,
        orderBy: { paidAt: 'desc' },
        include: {
          collectedBy: { select: { code: true, fullName: true } },
          invoice: {
            include: {
              student: { select: { code: true, fullName: true } },
              enrollment: { include: { class: { include: { course: true } } } }
            }
          }
        }
      })
    ]);

    // ----- KPI tổng -----
    const kpi = {
      totalAmount: 0,
      paidAmount: 0,
      debtAmount: 0,
      paidRate: 0,
      invoiceCount: allInvoices.length,
      unpaidCount: 0,
      partialCount: 0,
      paidCount: 0,
      overdueCount: 0,
      overdueAmount: 0,
      collectedThisMonth: 0,
      debtorCount: 0
    };
    const debtorIds = new Set();

    for (const inv of allInvoices) {
      const amount = Number(inv.amount);
      const paid = Number(inv.paidAmount);
      const remaining = Math.max(0, amount - paid);
      kpi.totalAmount += amount;
      kpi.paidAmount += paid;
      kpi.debtAmount += remaining;
      if (inv.status === 'UNPAID') kpi.unpaidCount += 1;
      if (inv.status === 'PARTIAL') kpi.partialCount += 1;
      if (inv.status === 'PAID') kpi.paidCount += 1;
      if (remaining > 0) debtorIds.add(inv.studentId);
      if (inv.status !== 'PAID' && new Date(inv.dueDate) < today) {
        kpi.overdueCount += 1;
        kpi.overdueAmount += remaining;
      }
    }
    kpi.debtorCount = debtorIds.size;
    kpi.paidRate = kpi.totalAmount > 0 ? parseFloat(((kpi.paidAmount / kpi.totalAmount) * 100).toFixed(1)) : 0;

    // ----- Biểu đồ theo tháng: Đã thu (theo ngày thu từng đợt) vs Còn nợ (theo tháng phát sinh hóa đơn) -----
    const monthly = Array.from({ length: 12 }, (_, i) => ({
      month: i + 1,
      label: `T${i + 1}`,
      collected: 0,
      issued: 0,
      outstanding: 0
    }));

    for (const p of yearPayments) {
      const d = new Date(p.paidAt);
      monthly[d.getMonth()].collected += Number(p.amount);
      if (d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()) {
        kpi.collectedThisMonth += Number(p.amount);
      }
    }

    for (const inv of allInvoices) {
      const d = new Date(inv.createdAt);
      if (d >= yearStart && d < yearEnd) {
        monthly[d.getMonth()].issued += Number(inv.amount);
        monthly[d.getMonth()].outstanding += Math.max(0, Number(inv.amount) - Number(inv.paidAmount));
      }
    }

    // ----- Doanh thu theo môn học -----
    const courseMap = new Map();
    for (const inv of allInvoices) {
      const c = inv.enrollment.class.course;
      const row = courseMap.get(c.id) || { courseCode: c.courseCode, courseName: c.name, total: 0, paid: 0, debt: 0 };
      row.total += Number(inv.amount);
      row.paid += Number(inv.paidAmount);
      row.debt += Math.max(0, Number(inv.amount) - Number(inv.paidAmount));
      courseMap.set(c.id, row);
    }

    // ----- Danh sách công nợ (sắp xếp: quá hạn trước, nợ nhiều trước) -----
    const debtList = allInvoices
      .filter((inv) => inv.status !== 'PAID')
      .map((inv) => {
        const remaining = Math.max(0, Number(inv.amount) - Number(inv.paidAmount));
        const isOverdue = new Date(inv.dueDate) < today;
        return {
          id: inv.id,
          student: inv.student,
          classCode: inv.enrollment.class.classCode,
          courseCode: inv.enrollment.class.course.courseCode,
          courseName: inv.enrollment.class.course.name,
          amount: Number(inv.amount),
          paidAmount: Number(inv.paidAmount),
          remainingAmount: remaining,
          status: inv.status,
          dueDate: inv.dueDate,
          isOverdue,
          overdueDays: isOverdue ? Math.floor((today - new Date(inv.dueDate)) / 86400000) : 0
        };
      })
      .sort((a, b) => Number(b.isOverdue) - Number(a.isOverdue) || b.remainingAmount - a.remainingAmount);

    return successResponse(
      res,
      {
        year,
        kpi,
        monthly,
        statusBreakdown: [
          { status: 'PAID', name: 'Đã hoàn thành', value: kpi.paidCount, color: '#52c41a' },
          { status: 'PARTIAL', name: 'Nợ một phần', value: kpi.partialCount, color: '#faad14' },
          { status: 'UNPAID', name: 'Chưa thanh toán', value: kpi.unpaidCount, color: '#ff4d4f' }
        ],
        byCourse: Array.from(courseMap.values()).sort((a, b) => b.total - a.total),
        debtList,
        recentPayments: recentPayments.map((p) => ({
          ...mapPayment(p),
          invoiceId: p.invoiceId,
          studentCode: p.invoice.student.code,
          studentName: p.invoice.student.fullName,
          courseCode: p.invoice.enrollment.class.course.courseCode
        }))
      },
      'Lấy thống kê doanh thu học phí thành công'
    );
  } catch (error) {
    console.error('Error fetching tuition revenue analytics:', error);
    return errorResponse(res, 'Lỗi lấy thống kê doanh thu học phí', 500);
  }
});

module.exports = router;
