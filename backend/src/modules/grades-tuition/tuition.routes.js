/**
 * ==========================================================================
 * CỤM KẾ TOÁN / HỌC PHÍ (Người 3 - ACCOUNTANT)
 * --------------------------------------------------------------------------
 * UC9.1   Tra cứu công nợ học phí (hóa đơn tự tạo khi ghi danh UC4.2)
 * Payment writes are owned by accountant/payment.service.js (SePay webhook).
 * UC-PAY.1: Payment Order + dynamic VietQR, confirmed receipts only.
 * UC9.4*  Học viên kiểm tra công nợ cá nhân (DF30)
 * UC9.6 / UC10.2 Trigger 3: Thông báo nhắc nợ học phí loại TUITION (DF08b)
 * UC9.7 / UC11.1b* Thống kê doanh thu đã thu vs còn nợ theo tháng (DF12b)
 * ==========================================================================
 */
const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const { TuitionInvoice, TuitionPayment } = require('../../models');
const { plain } = require('../../utils/query');
const { numberToVietnameseWords } = require('../../utils/numberToWords');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

const FINANCE_ROLES = ['ACCOUNTANT', 'ADMIN'];
const STUDENT_SELECT = 'id code fullName email phone';

const INVOICE_POPULATE = [
  { path: 'student', select: STUDENT_SELECT },
  { path: 'enrollment', populate: { path: 'class', populate: 'course' } },
  { path: 'payments', populate: { path: 'collectedBy', select: 'code fullName' } }
];

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
  transactionId: p.transactionId ?? null,
  collectedBy: p.collectedBy ? `${p.collectedBy.fullName} (${p.collectedBy.code})` : null
});

const mapInvoice = (inv) => {
  const amount = Number(inv.amount);
  const paidAmount = Number(inv.paidAmount);
  const remainingAmount = Math.max(0, amount - paidAmount);
  const cls = inv.enrollment?.class;
  return {
    id: inv.id,
    student: inv.student || null,
    classId: cls?.id ?? null,
    classCode: cls?.classCode,
    semester: cls?.semester,
    courseCode: cls?.course?.courseCode,
    courseName: cls?.course?.name,
    amount,
    paidAmount,
    remainingAmount,
    status: inv.status,
    dueDate: inv.dueDate,
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
      const { status, classId, search, overdue, semester } = req.query;
      if (status && String(status).split(',').some(s => !['UNPAID', 'PARTIAL', 'PAID'].includes(s))) return errorResponse(res, 'Trạng thái hóa đơn không hợp lệ', 400);
      if (classId && (!Number.isSafeInteger(Number(classId)) || Number(classId) <= 0)) return errorResponse(res, 'Mã lớp không hợp lệ', 400);

      const where = {};
      if (role === 'STUDENT') {
        where.studentId = userId;
      }

      if (status) {
        // Hỗ trợ lọc nhiều trạng thái: ?status=UNPAID,PARTIAL
        const statuses = String(status).split(',').filter(Boolean);
        where.status = statuses.length > 1 ? { $in: statuses } : statuses[0];
      }

      if (overdue === 'true') {
        where.status = { $ne: 'PAID' };
        where.dueDate = { $lt: startOfToday() };
      }

      let data = (await TuitionInvoice.find(where).sort({ dueDate: 1, id: -1 }).populate(INVOICE_POPULATE))
        .map(d => mapInvoice(plain(d)));

      // Bộ lọc theo quan hệ (lớp, học kỳ, tìm kiếm sinh viên/lớp/môn)
      if (classId) data = data.filter(inv => inv.classId === Number(classId));
      if (semester) data = data.filter(inv => inv.semester === String(semester));
      if (search && role !== 'STUDENT') {
        const q = String(search).trim().toLowerCase();
        data = data.filter(inv => [inv.student?.code, inv.student?.fullName, inv.student?.email, inv.classCode, inv.courseCode]
          .some(v => String(v || '').toLowerCase().includes(q)));
      }

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

// UC9.1: Chi tiết hóa đơn (kèm phiếu thu, lệnh thanh toán, giao dịch ngân hàng)
router.get('/tuition-invoices/:id(\\d+)', authenticateJWT, authorizeRoles('ACCOUNTANT', 'ADMIN', 'STUDENT'), async (req, res) => {
  try {
    const doc = await TuitionInvoice.findOne({ id: parseInt(req.params.id) }).populate([...INVOICE_POPULATE, 'orders', 'transactions']);
    if (!doc) return errorResponse(res, 'Không tìm thấy hóa đơn', 404);
    if (!canViewInvoice(req.user, doc)) return errorResponse(res, 'Bạn không có quyền xem hóa đơn này', 403);
    const inv = plain(doc);
    return successResponse(res, {
      ...mapInvoice(inv),
      orders: (inv.orders || []).map(o => ({ id: o.id, code: o.code, amount: o.amount, createdAt: o.createdAt })),
      transactions: (inv.transactions || []).map(t => ({ id: t.id, providerId: t.providerId, reference: t.reference, amount: t.amount, appliedAmount: t.appliedAmount, status: t.status, occurredAt: t.occurredAt }))
    }, 'Lấy chi tiết hóa đơn thành công');
  } catch (error) {
    console.error('Error fetching invoice detail:', error);
    return errorResponse(res, 'Lỗi lấy chi tiết hóa đơn', 500);
  }
});

// ==========================================
// Confirmed payment receipts. Manual collection endpoint was removed.
// ==========================================
router.get('/tuition-payments/:id/receipt', authenticateJWT, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const paymentDoc = await TuitionPayment.findOne({ id }).populate([
      { path: 'collectedBy', select: 'code fullName' },
      { path: 'invoice', populate: INVOICE_POPULATE }
    ]);

    if (!paymentDoc || !paymentDoc.invoice) return errorResponse(res, 'Không tìm thấy phiếu thu', 404);
    if (!canViewInvoice(req.user, paymentDoc.invoice)) {
      return errorResponse(res, 'Bạn không có quyền xem phiếu thu này', 403);
    }
    const payment = plain(paymentDoc);

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
// UC-PAY.1 (tương thích giao diện Student cũ): tạo Payment Order + VietQR theo số tiền còn nợ
// ==========================================
router.get('/tuition-invoices/:id/vietqr', authenticateJWT, async (req, res) => {
  try {
    const data = await require('../accountant/payment.service').createOrder(Number(req.params.id), req.user);
    return successResponse(res, data);
  } catch (e) {
    if (!e.status) console.error('Error creating payment order:', e);
    return errorResponse(res, e.status ? e.message : 'Lỗi tạo lệnh thanh toán', e.status || 500);
  }
});

// ==========================================
// UC9.6 / UC10.2 Trigger 3: Gửi nhắc nợ học phí (không gửi cho hóa đơn PAID)
// ==========================================
router.post('/tuition-invoices/reminders', authenticateJWT, authorizeRoles('ACCOUNTANT'), (req, res) =>
  errorResponse(res, 'Chức năng nhắc học phí đã ngừng trong MVP', 410)
);

// ==========================================
// UC9.7 / UC11.1b*: Thống kê doanh thu học phí theo tháng (DF12b)
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
      TuitionInvoice.find({}).populate([
        { path: 'student', select: STUDENT_SELECT },
        { path: 'enrollment', populate: { path: 'class', populate: 'course' } }
      ]).then(list => list.map(plain)),
      TuitionPayment.find({ paidAt: { $gte: yearStart, $lt: yearEnd } }).select('amount paidAt'),
      TuitionPayment.find({}).sort({ paidAt: -1, id: -1 }).limit(8).populate([
        { path: 'collectedBy', select: 'code fullName' },
        { path: 'invoice', populate: [{ path: 'student', select: 'code fullName' }, { path: 'enrollment', populate: { path: 'class', populate: 'course' } }] }
      ]).then(list => list.map(plain))
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
    }
    // KPI "đã thu tháng này" luôn tính theo tháng hiện tại, độc lập với năm đang xem
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const monthAgg = await TuitionPayment.aggregate([{ $match: { paidAt: { $gte: monthStart } } }, { $group: { _id: null, sum: { $sum: '$amount' } } }]);
    kpi.collectedThisMonth = Number(monthAgg[0]?.sum || 0);

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
      const c = inv.enrollment?.class?.course;
      if (!c) continue;
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
          student: inv.student || null,
          classCode: inv.enrollment?.class?.classCode,
          courseCode: inv.enrollment?.class?.course?.courseCode,
          courseName: inv.enrollment?.class?.course?.name,
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
        recentPayments: recentPayments.filter(p => p.invoice).map((p) => ({
          ...mapPayment(p),
          invoiceId: p.invoiceId,
          studentCode: p.invoice.student?.code,
          studentName: p.invoice.student?.fullName,
          courseCode: p.invoice.enrollment?.class?.course?.courseCode
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
