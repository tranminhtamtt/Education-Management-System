const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const {
  Notification, Enrollment, StudentRequest, Attendance, User, Course, Class, TuitionInvoice, Grade, Assignment, Submission
} = require('../../models');
const upload = require('../../config/upload');
const { syncAttendanceAndGrades } = require('../../utils/gradeHelper');
const { plain } = require('../../utils/query');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

// ==========================================
// 1. NOTIFICATIONS MANAGEMENT (UC10.1 - UC10.3)
// ==========================================

// UC10.1 & UC10.3: Lấy danh sách thông báo của người dùng
router.get('/notifications', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    const notifications = (await Notification.find({
      $or: [
        { userId: null }, // Thông báo toàn trường
        { userId }        // Thông báo cá nhân
      ]
    })
      .sort({ createdAt: -1, id: -1 })
      .limit(50)).map(plain);

    const unreadCount = notifications.filter(n => !n.isRead).length;

    return successResponse(
      res,
      {
        unreadCount,
        notifications
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
      const enrollments = await Enrollment.find({ classId: parseInt(classId), status: 'ACTIVE' }).select('studentId');

      if (enrollments.length > 0) {
        await Notification.insertMany(enrollments.map(e => ({
          userId: e.studentId,
          title,
          message,
          type: type || 'SYSTEM'
        })));
      }
    } else {
      // Broadcast toàn trường (userId = null)
      await Notification.create({
        userId: null,
        title,
        message,
        type: type || 'SYSTEM'
      });
    }

    return successResponse(res, null, 'Phát hành thông báo thành công', 201);
  } catch (error) {
    console.error('Error broadcasting notification:', error);
    return errorResponse(res, 'Lỗi gửi thông báo', 500);
  }
});

// Đánh dấu tất cả là đã đọc (đăng ký trước /:id/read)
router.patch('/notifications/read-all', authenticateJWT, async (req, res) => {
  try {
    const userId = req.user.id;

    await Notification.updateMany(
      { $or: [{ userId: null }, { userId }], isRead: false },
      { $set: { isRead: true } }
    );

    return successResponse(res, null, 'Đã đánh dấu đọc tất cả thông báo');
  } catch (error) {
    console.error('Error marking all notifications read:', error);
    return errorResponse(res, 'Lỗi cập nhật thông báo', 500);
  }
});

// UC10.3: Đánh dấu 1 thông báo là đã đọc
router.patch('/notifications/:id/read', authenticateJWT, async (req, res) => {
  try {
    const id = parseInt(req.params.id);

    const result = await Notification.updateOne(
      { id, $or: [{ userId: null }, { userId: req.user.id }] },
      { $set: { isRead: true } }
    );
    if (!result.matchedCount) return errorResponse(res, 'Không tìm thấy thông báo', 404);

    return successResponse(res, null, 'Đã đánh dấu đọc thông báo');
  } catch (error) {
    console.error('Error marking notification read:', error);
    return errorResponse(res, 'Lỗi cập nhật thông báo', 500);
  }
});

// ==========================================
// 2. ONLINE APPLICATIONS / REQUESTS (UC11.1 - UC11.2)
// ==========================================

// Loại đơn học viên được gửi tới trung tâm (REMARK – phúc khảo – không còn áp dụng, chỉ đọc dữ liệu cũ).
const REQUEST_TYPES = {
  ABSENCE: { label: 'Xin nghỉ buổi học Live', needsClass: true },
  CLASS_TRANSFER: { label: 'Xin chuyển lớp / đổi lịch học Live', needsClass: true },
  DEFERRAL: { label: 'Xin bảo lưu khóa học', needsClass: true },
  REFUND: { label: 'Xin hủy khóa & hoàn học phí', needsClass: true, allowPending: true },
  PAYMENT_ISSUE: { label: 'Đã chuyển khoản nhưng khóa học chưa mở', allowPending: true },
  CONFIRMATION: { label: 'Xin giấy xác nhận học viên / chứng nhận hoàn thành', },
  FEEDBACK: { label: 'Góp ý / khiếu nại về khóa học, giảng viên' }
};
const requestLabel = type => REQUEST_TYPES[type]?.label || (type === 'REMARK' ? 'Phúc khảo điểm (cũ)' : type);

// UC11.1: Học viên gửi đơn tới trung tâm
router.post('/requests', authenticateJWT, authorizeRoles('STUDENT'), upload.single('attachment'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { requestType, classId, reason, sessionDate } = req.body;

    if (!requestType || !reason || !String(reason).trim()) {
      return errorResponse(res, 'Loại đơn và Lý do là bắt buộc', 400);
    }
    const rule = REQUEST_TYPES[requestType];
    if (!rule) return errorResponse(res, 'Loại đơn không hợp lệ', 400);
    const classNumber = classId ? parseInt(classId) : null;
    if (rule.needsClass && !classNumber) return errorResponse(res, 'Vui lòng chọn khóa học liên quan', 400);
    if (classNumber) {
      // Chỉ được gửi đơn cho khóa học của chính mình
      const owned = await Enrollment.findOne({ classId: classNumber, studentId, status: { $in: rule.allowPending ? ['ACTIVE', 'PENDING_PAYMENT'] : ['ACTIVE'] } });
      if (!owned) return errorResponse(res, 'Bạn không học khóa / lớp này', 403);
    }
    if (requestType === 'ABSENCE' && !sessionDate) return errorResponse(res, 'Vui lòng chọn ngày buổi học xin nghỉ', 400);

    const attachmentUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const created = await StudentRequest.create({
      studentId,
      classId: classNumber,
      requestType,
      sessionDate: requestType === 'ABSENCE' && sessionDate ? new Date(sessionDate) : null,
      reason: String(reason).trim(),
      attachmentUrl,
      status: 'PENDING'
    });
    const request = await StudentRequest.findOne({ id: created.id }).populate({ path: 'student', select: 'fullName code' });

    return successResponse(res, plain(request), 'Đã gửi đơn tới trung tâm', 201);
  } catch (error) {
    console.error('Error submitting student request:', error);
    if (error.name === 'ValidationError') return errorResponse(res, 'Loại đơn không hợp lệ', 400);
    return errorResponse(res, 'Lỗi gửi đơn', 500);
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
      ...(status ? { status: String(status) } : {}),
      ...(type ? { requestType: String(type) } : {})
    };

    const requests = (await StudentRequest.find(where)
      .sort({ createdAt: -1, id: -1 })
      .populate([
        { path: 'student', select: 'id code fullName email phone' },
        { path: 'class', populate: 'course' }
      ])).map(plain);

    return successResponse(
      res,
      requests.map(r => ({
        id: r.id,
        student: r.student,
        classInfo: r.class ? `${r.class.classCode} - ${r.class.course?.name}` : null,
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

    const request = await StudentRequest.findOne({ id });

    if (!request) {
      return errorResponse(res, 'Không tìm thấy đơn học vụ', 404);
    }

    // Cập nhật trạng thái đơn
    request.status = status;
    request.adminResponse = adminResponse || null;
    const updated = await request.save();

    // TRIGGER TỰ ĐỘNG THEO ĐẶC TẢ EMS:
    // Nếu đơn xin nghỉ phép (ABSENCE) được phê duyệt và có classId, tự động tạo/cập nhật điểm danh ngày nghỉ đó thành ABSENT_EXCUSED
    if (status === 'APPROVED' && request.requestType === 'ABSENCE' && request.classId) {
      const targetDate = request.sessionDate ? new Date(request.sessionDate) : new Date();
      targetDate.setHours(0, 0, 0, 0);

      const note = `Nghỉ có phép (Duyệt đơn #${id})`;
      const existing = await Attendance.findOne({ classId: request.classId, studentId: request.studentId, sessionDate: targetDate });
      if (existing) {
        existing.status = 'ABSENT_EXCUSED';
        existing.note = note;
        await existing.save();
      } else {
        await Attendance.create({ classId: request.classId, studentId: request.studentId, sessionDate: targetDate, status: 'ABSENT_EXCUSED', note });
      }

      // ĐỒNG BỘ LẠI TỶ LỆ VẮNG & CỜ CẤM THI (Tự động gỡ cấm thi nếu tỷ lệ vắng giảm xuống dưới 20%)
      await syncAttendanceAndGrades(null, request.classId, request.studentId);
    }

    // Gửi thông báo đến sinh viên
    await Notification.create({
      userId: request.studentId,
      title: `Kết quả xét duyệt đơn: ${requestLabel(request.requestType)}`,
      message: `Đơn của bạn đã được ${status === 'APPROVED' ? 'CHẤP THUẬN' : 'TỪ CHỐI'}. Phản hồi: ${adminResponse || 'Không có ghi chú thêm'}`,
      type: 'REQUEST'
    });

    return successResponse(res, plain(updated), 'Xét duyệt đơn học vụ thành công');
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
      User.countDocuments({ role: 'STUDENT', status: 'ACTIVE' }),
      User.countDocuments({ role: 'TEACHER', status: 'ACTIVE' }),
      Course.countDocuments(),
      Class.countDocuments({ status: 'ONGOING' }),
      TuitionInvoice.aggregate([{ $group: { _id: null, amount: { $sum: '$amount' }, paidAmount: { $sum: '$paidAmount' } } }]),
      Grade.aggregate([{ $match: { totalScore: { $ne: null } } }, { $group: { _id: '$isPassed', n: { $sum: 1 } } }]),
      StudentRequest.countDocuments({ status: 'PENDING' })
    ]);

    const totalAmount = Number(tuitionAggregate[0]?.amount || 0);
    const paidAmount = Number(tuitionAggregate[0]?.paidAmount || 0);
    const debtAmount = Math.max(0, totalAmount - paidAmount);

    const passedCount = gradesStats.find(g => g._id === true)?.n || 0;
    const failedCount = gradesStats.find(g => g._id === false)?.n || 0;

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
    const enrollments = (await Enrollment.find({ studentId, status: 'ACTIVE' }).populate(['grade', 'class'])).map(plain);

    const ongoingEnrollments = enrollments.filter(e => e.class && e.class.status === 'ONGOING');
    const ongoingClassIds = ongoingEnrollments.map(e => e.classId);

    // 2. Bài tập sắp đến hạn (trong các lớp đang học)
    const now = new Date();
    const upcoming = (await Assignment.find({ classId: { $in: ongoingClassIds }, dueDate: { $gte: now } })
      .sort({ dueDate: 1 })
      .limit(6)
      .populate({ path: 'class', populate: 'course' })).map(plain);
    const submitted = new Set((await Submission.find({ studentId, assignmentId: { $in: upcoming.map(a => a.id) } }).select('assignmentId')).map(s => s.assignmentId));

    // 3. GPA tích lũy
    const completedGrades = enrollments.map(e => e.grade).filter(g => g && g.totalScore !== null);
    const gpa = completedGrades.length > 0
      ? (completedGrades.reduce((sum, g) => sum + Number(g.totalScore), 0) / completedGrades.length).toFixed(2)
      : '0.00';

    return successResponse(
      res,
      {
        enrolledClassesCount: ongoingEnrollments.length,
        gpa: parseFloat(gpa),
        passedCourses: completedGrades.filter(g => g.isPassed).length,
        upcomingDeadlines: upcoming.map(a => ({
          id: a.id,
          title: a.title,
          classCode: a.class?.classCode,
          courseName: a.class?.course?.name,
          dueDate: a.dueDate,
          isSubmitted: submitted.has(a.id)
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
