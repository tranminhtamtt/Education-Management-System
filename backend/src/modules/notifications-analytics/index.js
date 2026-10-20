const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const prisma = require('../../config/prisma');
const upload = require('../../config/upload');
const { syncAttendanceAndGrades } = require('../../utils/gradeHelper');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

// ==========================================
// 1. NOTIFICATIONS MANAGEMENT (UC10.1 - UC10.3)
// ==========================================

// UC10.1 & UC10.3: Lấy danh sách thông báo của người dùng
router.get('/notifications', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    const notifications = await prisma.notification.findMany({
      where: {
        OR: [
          { userId: null }, // Thông báo toàn trường
          { userId }        // Thông báo cá nhân
        ]
      },
      orderBy: { createdAt: 'desc' },
      take: 50
    });

    const unreadCount = notifications.filter(n => !n.isRead && n.userId === userId).length;

    // Bản ghi toàn trường cũ (userId = null) không có is_read riêng cho từng người
    // -> hiển thị như đã đọc để tránh nút "Đánh dấu đã đọc" không có tác dụng
    const data = notifications.map(n => (n.userId === null ? { ...n, isRead: true, isGlobal: true } : n));

    return successResponse(
      res,
      {
        unreadCount,
        notifications: data
      },
      'Lấy danh sách thông báo thành công'
    );
  } catch (error) {
    console.error('Error fetching notifications:', error);
    return errorResponse(res, 'Lỗi lấy thông báo', 500);
  }
});

// UC10.1: Admin gửi thông báo broadcast
router.post('/notifications/broadcast', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const { title, message, type, classId } = req.body;

    if (!title || !message) {
      return errorResponse(res, 'Tiêu đề và nội dung thông báo là bắt buộc', 400);
    }

    if (classId) {
      // Gửi riêng cho sinh viên trong lớp học phần
      const enrollments = await prisma.enrollment.findMany({
        where: { classId: parseInt(classId), status: 'ACTIVE' },
        select: { studentId: true }
      });

      if (enrollments.length > 0) {
        await prisma.notification.createMany({
          data: enrollments.map(e => ({
            userId: e.studentId,
            title,
            message,
            type: type || 'SYSTEM'
          }))
        });
      }
    } else {
      // Broadcast toàn trường: tạo 1 bản ghi cho từng người dùng đang hoạt động
      // để mỗi người có trạng thái is_read riêng (UC10.3)
      const users = await prisma.user.findMany({
        where: { status: 'ACTIVE' },
        select: { id: true }
      });

      if (users.length > 0) {
        await prisma.notification.createMany({
          data: users.map(u => ({
            userId: u.id,
            title,
            message,
            type: type || 'SYSTEM'
          }))
        });
      }
    }

    return successResponse(res, null, 'Phát hành thông báo thành công', 201);
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    return errorResponse(res, 'Lỗi gửi thông báo', 500);
  }
});

// UC10.3: Đánh dấu 1 thông báo là đã đọc (chỉ thông báo của chính mình)
router.patch('/notifications/:id/read', authenticateJWT, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const result = await prisma.notification.updateMany({
      where: { id, userId: req.user.id },
      data: { isRead: true }
    });

    if (result.count === 0) {
      return errorResponse(res, 'Không tìm thấy thông báo cá nhân này', 404);
    }

    return successResponse(res, null, 'Đã đánh dấu đọc thông báo');
  } catch (error) {
    console.error('Error marking notification read:', error);
    return errorResponse(res, 'Lỗi cập nhật thông báo', 500);
  }
});

// Đánh dấu tất cả là đã đọc
router.patch('/notifications/read-all', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    await prisma.notification.updateMany({
      where: {
        userId,
        isRead: false
      },
      data: { isRead: true }
    });

    return successResponse(res, null, 'Đã đánh dấu đọc tất cả thông báo');
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    return errorResponse(res, 'Lỗi cập nhật thông báo', 500);
  }
});

// ==========================================
// 2. ONLINE APPLICATIONS / REQUESTS (UC11.1 - UC11.2)
// ==========================================

// UC11.1: Học viên nộp đơn online (Nghỉ phép, Phúc khảo, Xác nhận SV)
router.post('/requests', authenticateJWT, authorizeRoles('STUDENT'), upload.single('attachment'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { requestType, classId, reason, sessionDate } = req.body;

    if (!requestType || !reason) {
      return errorResponse(res, 'Loại đơn và Lý do là bắt buộc', 400);
    }

    const attachmentUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const request = await prisma.studentRequest.create({
      data: {
        studentId,
        classId: classId ? parseInt(classId) : null,
        requestType, // 'ABSENCE', 'REMARK', 'CONFIRMATION'
        sessionDate: sessionDate ? new Date(sessionDate) : null,
        reason: reason.trim(),
        attachmentUrl,
        status: 'PENDING'
      },
      include: {
        student: { select: { fullName: true, code: true } }
      }
    });

    return successResponse(res, request, 'Nộp đơn học vụ thành công', 201);
  } catch (error) {
    console.error('Error submitting student request:', error);
    return errorResponse(res, 'Lỗi nộp đơn học vụ', 500);
  }
});

// UC11.2: Lấy danh sách đơn từ (Admin xem tất cả, Student xem đơn của mình)
router.get('/requests', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;
    const role = req.user.role;
    const { status, type } = req.query;

    const where = {
      ...(role === 'STUDENT' ? { studentId: userId } : {}),
      ...(status ? { status } : {}),
      ...(type ? { requestType: type } : {})
    };

    const requests = await prisma.studentRequest.findMany({
      where,
      include: {
        student: { select: { id: true, code: true, fullName: true, email: true, phone: true } },
        class: {
          include: { course: true }
        }
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(
      res,
      requests.map(r => ({
        id: r.id,
        student: r.student,
        classInfo: r.class ? `${r.class.classCode} - ${r.class.course.name}` : null,
        classId: r.classId,
        requestType: r.requestType,
        sessionDate: r.sessionDate,
        reason: r.reason,
        attachmentUrl: r.attachmentUrl,
        status: r.status,
        adminResponse: r.adminResponse,
        createdAt: r.createdAt
      })),
      'Lấy danh sách đơn học vụ thành công'
    );
  } catch (error) {
    console.error('Error fetching student requests:', error);
    return errorResponse(res, 'Lỗi lấy danh sách đơn từ', 500);
  }
});

// UC11.2: Admin phê duyệt đơn học vụ & Tự động đồng bộ sang điểm danh
router.patch('/requests/:id/review', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { status, adminResponse } = req.body;

    if (!['APPROVED', 'REJECTED'].includes(status)) {
      return errorResponse(res, 'Trạng thái xét duyệt phải là APPROVED hoặc REJECTED', 400);
    }

    const request = await prisma.studentRequest.findUnique({
      where: { id },
      include: {
        student: true,
        class: true
      }
    });

    if (!request) {
      return errorResponse(res, 'Không tìm thấy đơn học vụ', 404);
    }

    // Cập nhật trạng thái đơn
    const updated = await prisma.studentRequest.update({
      where: { id },
      data: {
        status,
        adminResponse: adminResponse || null
      }
    });

    // TRIGGER TỰ ĐỘNG THEO ĐẶC TẢ EMS:
    // Nếu đơn xin nghỉ phép (ABSENCE) được phê duyệt và có classId, tự động tạo/cập nhật điểm danh ngày nghỉ đó thành ABSENT_EXCUSED
    if (status === 'APPROVED' && request.requestType === 'ABSENCE' && request.classId) {
      const targetDate = request.sessionDate ? new Date(request.sessionDate) : new Date();
      targetDate.setHours(0, 0, 0, 0);

      await prisma.attendance.upsert({
        where: {
          classId_studentId_sessionDate: {
            classId: request.classId,
            studentId: request.studentId,
            sessionDate: targetDate
          }
        },
        update: {
          status: 'ABSENT_EXCUSED',
          note: `Nghỉ có phép (Duyệt đơn #${id})`
        },
        create: {
          classId: request.classId,
          studentId: request.studentId,
          sessionDate: targetDate,
          status: 'ABSENT_EXCUSED',
          note: `Nghỉ có phép (Duyệt đơn #${id})`
        }
      });

      // ĐỒNG BỘ LẠI TỶ LỆ VẮNG & CỜ CẤM THI (Tự động gỡ cấm thi nếu tỷ lệ vắng giảm xuống dưới 20%)
      await syncAttendanceAndGrades(prisma, request.classId, request.studentId);
    }

    // Gửi thông báo đến sinh viên
    await prisma.notification.create({
      data: {
        userId: request.studentId,
        title: `Kết quả xét duyệt đơn: ${request.requestType}`,
        message: `Đơn của bạn đã được ${status === 'APPROVED' ? 'CHẤP THUẬN' : 'TỪ CHỐI'}. Phản hồi: ${adminResponse || 'Không có ghi chú thêm'}`,
        type: 'REQUEST'
      }
    });

    return successResponse(res, updated, 'Xét duyệt đơn học vụ thành công');
  } catch (error) {
    console.error('Error reviewing request:', error);
    return errorResponse(res, 'Lỗi xét duyệt đơn học vụ', 500);
  }
});

// ==========================================
// 3. REPORT & ANALYTICS (UC12.1 - UC12.2)
// ==========================================

// UC12.1: Admin Dashboard KPI & Biểu đồ
router.get('/analytics/admin-overview', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const [
      totalStudents,
      totalTeachers,
      totalCourses,
      activeClasses,
      tuitionAggregate,
      gradesStats,
      pendingRequestsCount
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT', status: 'ACTIVE' } }),
      prisma.user.count({ where: { role: 'TEACHER', status: 'ACTIVE' } }),
      prisma.course.count(),
      prisma.class.count({ where: { status: 'ONGOING' } }),
      prisma.tuitionInvoice.aggregate({
        _sum: {
          amount: true,
          paidAmount: true
        }
      }),
      prisma.grade.groupBy({
        by: ['isPassed'],
        where: { totalScore: { not: null } },
        _count: { id: true }
      }),
      prisma.studentRequest.count({ where: { status: 'PENDING' } })
    ]);

    const totalAmount = Number(tuitionAggregate._sum.amount || 0);
    const paidAmount = Number(tuitionAggregate._sum.paidAmount || 0);
    const debtAmount = Math.max(0, totalAmount - paidAmount);

    const passedCount = gradesStats.find(g => g.isPassed)?._count.id || 0;
    const failedCount = gradesStats.find(g => !g.isPassed)?._count.id || 0;

    return successResponse(
      res,
      {
        kpi: {
          totalStudents,
          totalTeachers,
          totalCourses,
          activeClasses,
          pendingRequestsCount
        },
        financial: {
          totalAmount,
          paidAmount,
          debtAmount,
          paidRate: totalAmount > 0 ? parseFloat(((paidAmount / totalAmount) * 100).toFixed(1)) : 0
        },
        academicPerformance: [
          { name: 'Đạt (Passed)', value: passedCount, color: '#52c41a' },
          { name: 'Chưa đạt (Failed)', value: failedCount, color: '#ff4d4f' }
        ]
      },
      'Lấy số liệu KPI tổng quan Admin thành công'
    );
  } catch (error) {
    console.error('Error fetching admin overview:', error);
    return errorResponse(res, 'Lỗi lấy báo cáo tổng quan', 500);
  }
});

// UC12.2: Student Dashboard Overview
router.get('/analytics/student-overview', authenticateJWT, authorizeRoles('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;

    // 1. Lớp học đang tham gia
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId, status: 'ACTIVE' },
      include: {
        class: {
          include: {
            course: true,
            schedules: true
          }
        },
        grade: true
      }
    });

    const classIds = enrollments.map(e => e.classId);

    // 2. Bài tập sắp đến hạn (trong 7 ngày tới)
    const now = new Date();
    const upcomingDeadlines = await prisma.assignment.findMany({
      where: {
        classId: { in: classIds },
        dueDate: { gte: now }
      },
      include: {
        class: { include: { course: true } },
        submissions: { where: { studentId } }
      },
      orderBy: { dueDate: 'asc' },
      take: 5
    });

    // 3. GPA tích lũy
    const completedGrades = enrollments.map(e => e.grade).filter(g => g && g.totalScore !== null);
    const gpa = completedGrades.length > 0
      ? (completedGrades.reduce((sum, g) => sum + Number(g.totalScore), 0) / completedGrades.length).toFixed(2)
      : '0.00';

    return successResponse(
      res,
      {
        enrolledClassesCount: enrollments.length,
        gpa: parseFloat(gpa),
        passedCourses: completedGrades.filter(g => g.isPassed).length,
        upcomingDeadlines: upcomingDeadlines.map(a => ({
          id: a.id,
          title: a.title,
          courseName: a.class.course.name,
          dueDate: a.dueDate,
          isSubmitted: a.submissions.length > 0
        }))
      },
      'Lấy dashboard học viên thành công'
    );
  } catch (error) {
    console.error('Error fetching student overview:', error);
    return errorResponse(res, 'Lỗi lấy dữ liệu cá nhân', 500);
  }
});

module.exports = router;
