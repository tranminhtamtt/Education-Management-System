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

// UC10.1: Admin gửi thông báo (toàn trường, theo khóa học, lớp học hoặc cá nhân)
const handleSendNotification = async (req, res) => {
  try {
    const { title, message, type, classId, courseId, userId } = req.body;

    if (!title || !message) {
      return errorResponse(res, 'Tiêu đề và nội dung thông báo là bắt buộc', 400);
    }

    if (userId) {
      // Gửi riêng cho một người dùng cụ thể
      await Notification.create({
        userId: parseInt(userId),
        title,
        message,
        type: type || 'SYSTEM'
      });
    } else if (classId) {
      // Gửi riêng cho sinh viên trong lớp học phần
      const enrollments = await Enrollment.find({ classId: parseInt(classId), status: 'ACTIVE' }).select('studentId');
      const studentIds = [...new Set(enrollments.map(e => e.studentId))];

      if (studentIds.length > 0) {
        await Notification.insertMany(studentIds.map(uid => ({
          userId: uid,
          title,
          message,
          type: type || 'SYSTEM'
        })));
      }
    } else if (courseId) {
      // Gửi cho toàn bộ học viên theo khóa học (FPT hoặc Chứng chỉ CCNA/IELTS)
      const classes = await Class.find({ courseId: parseInt(courseId) }).select('id');
      const classIds = classes.map(c => c.id);
      const enrollments = await Enrollment.find({ classId: { $in: classIds }, status: 'ACTIVE' }).select('studentId');
      const studentIds = [...new Set(enrollments.map(e => e.studentId))];

      if (studentIds.length > 0) {
        await Notification.insertMany(studentIds.map(uid => ({
          userId: uid,
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
};

router.post('/notifications', authenticateJWT, authorizeRoles('ADMIN'), handleSendNotification);
router.post('/notifications/broadcast', authenticateJWT, authorizeRoles('ADMIN'), handleSendNotification);

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

// UC11.1: Học viên nộp đơn online (Nghỉ phép, Phúc khảo, Xác nhận SV)
router.post('/requests', authenticateJWT, authorizeRoles('STUDENT'), upload.single('attachment'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const { requestType, classId, reason, sessionDate } = req.body;

    if (!requestType || !reason) {
      return errorResponse(res, 'Loại đơn và Lý do là bắt buộc', 400);
    }

    const attachmentUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const created = await StudentRequest.create({
      studentId,
      classId: classId ? parseInt(classId) : null,
      requestType, // 'ABSENCE', 'REMARK', 'CONFIRMATION'
      sessionDate: sessionDate ? new Date(sessionDate) : null,
      reason: reason.trim(),
      attachmentUrl,
      status: 'PENDING'
    });
    const request = await StudentRequest.findOne({ id: created.id }).populate({ path: 'student', select: 'fullName code' });

    return successResponse(res, plain(request), 'Nộp đơn học vụ thành công', 201);
  } catch (error) {
    console.error('Error submitting student request:', error);
    if (error.name === 'ValidationError') return errorResponse(res, 'Loại đơn không hợp lệ', 400);
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
      title: `Kết quả xét duyệt đơn: ${request.requestType}`,
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

// UC12.1: Admin Dashboard KPI & Biểu đồ (4 KPI tổng, thống kê khóa học FPT vs. Chứng chỉ CCNA/IELTS)
router.get('/analytics/admin-overview', authenticateJWT, authorizeRoles('ADMIN'), async (req, res) => {
  try {
    const [
      totalStudents,
      totalTeachers,
      totalCourses,
      activeClasses,
      tuitionAggregate,
      gradesStats,
      pendingRequestsCount,
      fptCoursesCount,
      certificateCoursesCount,
      recordedCoursesCount,
      liveCoursesCount,
      totalEnrollments,
      completedEnrollments
    ] = await Promise.all([
      User.countDocuments({ role: 'STUDENT', status: 'ACTIVE' }),
      User.countDocuments({ role: 'TEACHER', status: 'ACTIVE' }),
      Course.countDocuments({ status: 'ACTIVE' }),
      Class.countDocuments({ status: { $in: ['UPCOMING', 'ONGOING'] } }),
      TuitionInvoice.aggregate([{ $group: { _id: null, amount: { $sum: '$amount' }, paidAmount: { $sum: '$paidAmount' } } }]),
      Grade.aggregate([{ $match: { totalScore: { $ne: null } } }, { $group: { _id: '$isPassed', n: { $sum: 1 } } }]),
      StudentRequest.countDocuments({ status: 'PENDING' }),
      Course.countDocuments({ category: 'FPT_SUBJECT' }),
      Course.countDocuments({ category: 'CERTIFICATE' }),
      Course.countDocuments({ deliveryMode: 'RECORDED' }),
      Course.countDocuments({ deliveryMode: 'LIVE_ONLINE' }),
      Enrollment.countDocuments(),
      Enrollment.countDocuments({ $or: [{ progressPercent: 100 }, { status: 'COMPLETED' }] })
    ]);

    // Thống kê số lượng ghi danh theo nhóm FPT vs Chứng chỉ
    const [fptCourseIds, certCourseIds] = await Promise.all([
      Course.find({ category: 'FPT_SUBJECT' }).distinct('id'),
      Course.find({ category: 'CERTIFICATE' }).distinct('id')
    ]);

    const [fptClassIds, certClassIds] = await Promise.all([
      Class.find({ courseId: { $in: fptCourseIds } }).distinct('id'),
      Class.find({ courseId: { $in: certCourseIds } }).distinct('id')
    ]);

    const [fptEnrollments, certificateEnrollments] = await Promise.all([
      Enrollment.countDocuments({ classId: { $in: fptClassIds } }),
      Enrollment.countDocuments({ classId: { $in: certClassIds } })
    ]);

    const totalAmount = Number(tuitionAggregate[0]?.amount || 0);
    const paidAmount = Number(tuitionAggregate[0]?.paidAmount || 0);
    const debtAmount = Math.max(0, totalAmount - paidAmount);

    const passedCount = gradesStats.find(g => g._id === true)?.n || 0;
    const failedCount = gradesStats.find(g => g._id === false)?.n || 0;

    const completionRate = totalEnrollments > 0
      ? parseFloat(((completedEnrollments / totalEnrollments) * 100).toFixed(1))
      : (passedCount + failedCount > 0 ? parseFloat(((passedCount / (passedCount + failedCount)) * 100).toFixed(1)) : 0);

    return successResponse(
      res,
      {
        kpi: {
          totalStudents,
          totalTeachers,
          totalCourses: totalCourses || (fptCoursesCount + certificateCoursesCount),
          activeClasses,
          pendingRequestsCount,
          totalRevenue: paidAmount,
          completionRate
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
        ],
        courseStats: {
          fptCoursesCount,
          certificateCoursesCount,
          recordedCoursesCount,
          liveCoursesCount,
          fptEnrollments,
          certificateEnrollments
        },
        courseCategoryComparison: [
          { name: 'Khóa học FPT', courses: fptCoursesCount, students: fptEnrollments, color: '#F26F21' },
          { name: 'Chứng chỉ (CCNA/IELTS)', courses: certificateCoursesCount, students: certificateEnrollments, color: '#722ED1' }
        ],
        deliveryModeComparison: [
          { name: 'Video tự học (RECORDED)', value: recordedCoursesCount, color: '#1677FF' },
          { name: 'Học trực tuyến (LIVE_ONLINE)', value: liveCoursesCount, color: '#52C41A' }
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
