const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const prisma = require('../../config/prisma');
const upload = require('../../config/upload');
const { syncAttendanceAndGrades } = require('../../utils/gradeHelper');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

// ==========================================
// 1. ATTENDANCE MANAGEMENT (UC6.1 - UC6.2)
// ==========================================

// UC6.1: Lấy danh sách điểm danh lớp theo ngày học
router.get('/classes/:id/attendances', authenticateJWT, async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const targetDate = new Date(dateStr);

    // Lấy danh sách học viên trong lớp
    const enrollments = await prisma.enrollment.findMany({
      where: { classId, status: 'ACTIVE' },
      include: {
        student: {
          select: { id: true, code: true, fullName: true, email: true, avatar: true }
        }
      },
      orderBy: { student: { code: 'asc' } }
    });

    // Lấy các bản ghi điểm danh đã lưu trong ngày đó
    const attendances = await prisma.attendance.findMany({
      where: {
        classId,
        sessionDate: targetDate
      }
    });

    const attendanceMap = new Map();
    attendances.forEach(a => attendanceMap.set(a.studentId, a));

    // Ghép dữ liệu cho từng sinh viên: nếu chưa điểm danh thì mặc định PRESENT
    const result = enrollments.map(e => {
      const record = attendanceMap.get(e.studentId);
      return {
        studentId: e.student.id,
        code: e.student.code,
        fullName: e.student.fullName,
        email: e.student.email,
        avatar: e.student.avatar,
        status: record ? record.status : 'PRESENT',
        note: record ? record.note : '',
        attendanceId: record ? record.id : null
      };
    });

    return successResponse(
      res,
      {
        classId,
        sessionDate: dateStr,
        students: result
      },
      'Lấy danh sách điểm danh thành công'
    );
  } catch (error) {
    console.error('Error getting class attendances:', error);
    return errorResponse(res, 'Lỗi lấy danh sách điểm danh', 500);
  }
});

// UC6.1 & UC6.2: Lưu dữ liệu điểm danh cả lớp trong một buổi học & Cập nhật cấm thi
router.post('/classes/:id/attendances', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const { sessionDate, records } = req.body;

    if (!sessionDate || !Array.isArray(records)) {
      return errorResponse(res, 'Dữ liệu điểm danh không hợp lệ (cần sessionDate và mảng records)', 400);
    }

    const date = new Date(sessionDate);

    // Lưu từng bản ghi điểm danh (upsert theo UNIQUE classId, studentId, sessionDate)
    await prisma.$transaction(async (tx) => {
      for (const rec of records) {
        const studentId = parseInt(rec.studentId);
        const status = rec.status || 'PRESENT';
        const note = rec.note || null;

        await tx.attendance.upsert({
          where: {
            classId_studentId_sessionDate: {
              classId,
              studentId,
              sessionDate: date
            }
          },
          update: { status, note },
          create: {
            classId,
            studentId,
            sessionDate: date,
            status,
            note
          }
        });

        // ĐỒNG BỘ CỜ CẤM THI (IS_BANNED), XÉT QUA MÔN VÀ GỢI Ý ĐIỂM CHUYÊN CẦN
        await syncAttendanceAndGrades(tx, classId, studentId);
      }
    });

    return successResponse(res, null, 'Lưu bảng điểm danh buổi học thành công (Đã tự động đồng bộ cờ cấm thi và điểm chuyên cần)');
  } catch (error) {
    console.error('Error saving attendances:', error);
    return errorResponse(res, 'Lỗi lưu điểm danh buổi học', 500);
  }
});

// UC6.2: Thống kê tỷ lệ chuyên cần cả kỳ của lớp, gắn cờ cấm thi
router.get('/classes/:id/attendance-summary', authenticateJWT, async (req, res) => {
  try {
    const classId = parseInt(req.params.id);

    const classInfo = await prisma.class.findUnique({
      where: { id: classId },
      include: {
        course: true,
        enrollments: {
          where: { status: 'ACTIVE' },
          include: {
            student: { select: { id: true, code: true, fullName: true, email: true } }
          }
        }
      }
    });

    if (!classInfo) {
      return errorResponse(res, 'Không tìm thấy lớp học', 404);
    }

    const totalSessions = classInfo.course.totalSessions || 30;

    // Lấy toàn bộ bản ghi điểm danh của lớp
    const allAttendances = await prisma.attendance.findMany({
      where: { classId }
    });

    const summary = classInfo.enrollments.map(e => {
      const studentRecords = allAttendances.filter(a => a.studentId === e.student.id);
      const present = studentRecords.filter(a => a.status === 'PRESENT').length;
      const absentExcused = studentRecords.filter(a => a.status === 'ABSENT_EXCUSED').length;
      const absentUnexcused = studentRecords.filter(a => a.status === 'ABSENT_UNEXCUSED').length;
      const late = studentRecords.filter(a => a.status === 'LATE').length;

      const absentRate = parseFloat(((absentUnexcused / totalSessions) * 100).toFixed(1));
      const isBanned = absentRate >= 20.0;

      // Màu cảnh báo FAP: <=10% green, <=20% yellow/orange, >20% red
      let warningLevel = 'SAFE';
      if (absentRate >= 20.0) warningLevel = 'BANNED';
      else if (absentRate > 10.0) warningLevel = 'WARNING';

      return {
        studentId: e.student.id,
        code: e.student.code,
        fullName: e.student.fullName,
        totalSessions,
        present,
        absentExcused,
        absentUnexcused,
        late,
        absentRate,
        warningLevel,
        isBanned
      };
    });

    return successResponse(res, summary, 'Lấy tổng hợp chuyên cần thành công');
  } catch (error) {
    console.error('Error getting attendance summary:', error);
    return errorResponse(res, 'Lỗi lấy tổng hợp chuyên cần', 500);
  }
});

// Báo cáo chuyên cần cá nhân của học viên
router.get('/attendances/my-report', authenticateJWT, async (req, res) => {
  try {
    const studentId = req.user.id;
    const enrollments = await prisma.enrollment.findMany({
      where: { studentId, status: 'ACTIVE' },
      include: {
        class: {
          include: {
            course: true,
            attendances: { where: { studentId } }
          }
        }
      }
    });

    const report = enrollments.map(e => {
      const records = e.class.attendances;
      const totalSessions = e.class.course.totalSessions || 30;
      const present = records.filter(r => r.status === 'PRESENT').length;
      const absentExcused = records.filter(r => r.status === 'ABSENT_EXCUSED').length;
      const absentUnexcused = records.filter(r => r.status === 'ABSENT_UNEXCUSED').length;
      const late = records.filter(r => r.status === 'LATE').length;
      const absentRate = parseFloat(((absentUnexcused / totalSessions) * 100).toFixed(1));
      const isBanned = absentRate >= 20.0;

      return {
        classId: e.class.id,
        classCode: e.class.classCode,
        courseCode: e.class.course.courseCode,
        courseName: e.class.course.name,
        totalSessions,
        recordedSessions: records.length,
        present,
        absentExcused,
        absentUnexcused,
        late,
        absentRate,
        isBanned
      };
    });

    return successResponse(res, report, 'Lấy báo cáo chuyên cần thành công');
  } catch (error) {
    console.error('Error getting my-report:', error);
    return errorResponse(res, 'Lỗi lấy báo cáo chuyên cần', 500);
  }
});

// ==========================================
// 2. ASSIGNMENTS & SUBMISSIONS (UC7.1 - UC7.3)
// ==========================================

// UC7.1: Lấy danh sách bài tập theo lớp
router.get('/classes/:id/assignments', authenticateJWT, async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const userId = req.user.id;
    const role = req.user.role;

    const assignments = await prisma.assignment.findMany({
      where: { classId },
      include: {
        _count: { select: { submissions: true } },
        submissions: role === 'STUDENT' ? { where: { studentId: userId } } : false
      },
      orderBy: { createdAt: 'desc' }
    });

    return successResponse(
      res,
      assignments.map(a => ({
        id: a.id,
        title: a.title,
        description: a.description,
        fileUrl: a.fileUrl,
        dueDate: a.dueDate,
        createdAt: a.createdAt,
        totalSubmissions: a._count?.submissions || 0,
        mySubmission: role === 'STUDENT' && a.submissions ? a.submissions[0] || null : null
      })),
      'Lấy danh sách bài tập thành công'
    );
  } catch (error) {
    console.error('Error fetching assignments:', error);
    return errorResponse(res, 'Lỗi lấy danh sách bài tập', 500);
  }
});

// UC7.1: Giảng viên giao bài tập mới (hỗ trợ upload file đề bài)
router.post('/classes/:id/assignments', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), upload.single('file'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const { title, description, dueDate } = req.body;

    if (!title || !dueDate) {
      return errorResponse(res, 'Tiêu đề và Hạn nộp bài là bắt buộc', 400);
    }

    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const assignment = await prisma.assignment.create({
      data: {
        classId,
        title: title.trim(),
        description: description || '',
        fileUrl,
        dueDate: new Date(dueDate)
      }
    });

    // Tạo thông báo cho toàn bộ học viên trong lớp
    const enrollments = await prisma.enrollment.findMany({
      where: { classId, status: 'ACTIVE' },
      select: { studentId: true }
    });

    if (enrollments.length > 0) {
      await prisma.notification.createMany({
        data: enrollments.map(e => ({
          userId: e.studentId,
          title: `Bài tập mới: ${assignment.title}`,
          message: `Giảng viên vừa giao bài tập mới. Hạn nộp: ${new Date(dueDate).toLocaleString('vi-VN')}`,
          type: 'ASSIGNMENT'
        }))
      });
    }

    return successResponse(res, assignment, 'Giao bài tập thành công', 201);
  } catch (error) {
    console.error('Error creating assignment:', error);
    return errorResponse(res, 'Lỗi khi tạo bài tập', 500);
  }
});

// Chi tiết 1 bài tập kèm danh sách bài nộp
router.get('/assignments/:id', authenticateJWT, async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const role = req.user.role;
    const userId = req.user.id;

    const assignment = await prisma.assignment.findUnique({
      where: { id },
      include: {
        class: {
          include: {
            course: true,
            teacher: { select: { fullName: true } }
          }
        },
        submissions: {
          where: role === 'STUDENT' ? { studentId: userId } : {},
          include: {
            student: { select: { id: true, code: true, fullName: true, email: true } }
          },
          orderBy: { submittedAt: 'desc' }
        }
      }
    });

    if (!assignment) {
      return errorResponse(res, 'Không tìm thấy bài tập', 404);
    }

    return successResponse(res, assignment, 'Lấy chi tiết bài tập thành công');
  } catch (error) {
    console.error('Error getting assignment detail:', error);
    return errorResponse(res, 'Lỗi lấy chi tiết bài tập', 500);
  }
});

// UC7.2: Học viên nộp bài trực tuyến (Upload file)
router.post('/assignments/:id/submissions', authenticateJWT, authorizeRoles('STUDENT'), upload.single('file'), async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id);
    const studentId = req.user.id;

    const assignment = await prisma.assignment.findUnique({
      where: { id: assignmentId }
    });

    if (!assignment) {
      return errorResponse(res, 'Không tìm thấy bài tập', 404);
    }

    if (!req.file) {
      return errorResponse(res, 'Vui lòng chọn file bài làm để nộp', 400);
    }

    const fileUrl = `/uploads/${req.file.filename}`;
    const now = new Date();
    const isLate = now > new Date(assignment.dueDate);
    const submissionStatus = isLate ? 'LATE_SUBMITTED' : 'SUBMITTED';

    // Upsert theo ràng buộc UNIQUE(assignment_id, student_id)
    const submission = await prisma.submission.upsert({
      where: {
        assignmentId_studentId: {
          assignmentId,
          studentId
        }
      },
      update: {
        fileUrl,
        submittedAt: now,
        status: submissionStatus
      },
      create: {
        assignmentId,
        studentId,
        fileUrl,
        submittedAt: now,
        status: submissionStatus
      }
    });

    return successResponse(
      res,
      submission,
      isLate ? 'Nộp bài thành công (Ghi nhận nộp muộn sau hạn LATE_SUBMITTED)' : 'Nộp bài thành công đúng hạn (SUBMITTED)'
    );
  } catch (error) {
    console.error('Error submitting assignment:', error);
    return errorResponse(res, 'Lỗi khi nộp bài tập', 500);
  }
});

// UC7.3: Giảng viên chấm điểm và nhập nhận xét
router.patch('/submissions/:id/grade', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const id = parseInt(req.params.id);
    const { score, teacherFeedback } = req.body;

    const numericScore = parseFloat(score);
    if (isNaN(numericScore) || numericScore < 0 || numericScore > 10) {
      return errorResponse(res, 'Điểm số phải là số từ 0.0 đến 10.0', 400);
    }

    const submission = await prisma.submission.update({
      where: { id },
      data: {
        score: numericScore,
        teacherFeedback: teacherFeedback || null
      },
      include: {
        assignment: true,
        student: { select: { fullName: true } }
      }
    });

    // Gửi thông báo cho sinh viên được chấm
    await prisma.notification.create({
      data: {
        userId: submission.studentId,
        title: `Điểm bài tập: ${submission.assignment.title}`,
        message: `Bạn nhận được ${numericScore}/10 điểm. Lời nhận xét: ${teacherFeedback || 'Không có'}`,
        type: 'GRADE'
      }
    });

    return successResponse(res, submission, 'Chấm điểm bài tập thành công');
  } catch (error) {
    console.error('Error grading submission:', error);
    return errorResponse(res, 'Lỗi chấm điểm bài tập', 500);
  }
});

module.exports = router;
