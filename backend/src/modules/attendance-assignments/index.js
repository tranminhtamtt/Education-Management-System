const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const { withTransaction } = require('../../config/db');
const { Enrollment, Attendance, Class, Assignment, Submission, Notification } = require('../../models');
const upload = require('../../config/upload');
const { syncAttendanceAndGrades } = require('../../utils/gradeHelper');
const { plain } = require('../../utils/query');
const { successResponse, errorResponse } = require('../../utils/formatResponse');
const { studyWeek, vietnamToday } = require('../../utils/studyWeek');

const byStudentCode = (a, b) => String(a.student?.code || '').localeCompare(String(b.student?.code || ''));
const teacherOwnsClass = async (classId, user) => {
  const filter = { id: classId };
  if (user.role === 'TEACHER') filter.teacherId = user.id;
  return Class.findOne(filter).select('id');
};
const canAccessClass = async (classId, user) => {
  if (user.role === 'ADMIN') return Boolean(await Class.exists({ id: classId }));
  if (user.role === 'TEACHER') return Boolean(await Class.exists({ id: classId, teacherId: user.id }));
  if (user.role === 'STUDENT') return Boolean(await Enrollment.exists({ classId, studentId: user.id, status: 'ACTIVE' }));
  return false;
};
const requireAssignedClass = async (req, res, next) => {
  try {
    const classId = parseInt(req.params.id);
    if (!await canAccessClass(classId, req.user)) {
      return errorResponse(res, 'Không tìm thấy lớp được phân công', 404);
    }
    return next();
  } catch (error) {
    console.error('Error checking class access:', error);
    return errorResponse(res, 'Lỗi kiểm tra quyền truy cập lớp học', 500);
  }
};

// ==========================================
// 1. ATTENDANCE MANAGEMENT (UC6.1 - UC6.2)
// ==========================================

// UC6.1: Lấy danh sách điểm danh lớp theo ngày học
router.get('/classes/:id/attendances', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    if (!await teacherOwnsClass(classId, req.user)) {
      return errorResponse(res, 'Không tìm thấy lớp được phân công', 404);
    }
    const dateStr = req.query.date || new Date().toISOString().split('T')[0];
    const targetDate = new Date(dateStr);
    if (Number.isNaN(targetDate.getTime())) return errorResponse(res, 'Ngày điểm danh không hợp lệ', 400);

    // Lấy danh sách học viên trong lớp
    const enrollments = (await Enrollment.find({ classId, status: 'ACTIVE' })
      .populate({ path: 'student', select: 'id code fullName email avatar' })).map(plain).sort(byStudentCode);

    // Lấy các bản ghi điểm danh đã lưu trong ngày đó
    const attendances = await Attendance.find({ classId, sessionDate: targetDate });

    const attendanceMap = new Map();
    attendances.forEach(a => attendanceMap.set(a.studentId, a));

    // Ghép dữ liệu cho từng sinh viên: nếu chưa điểm danh thì mặc định PRESENT
    const result = enrollments.filter(e => e.student).map(e => {
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

    if (!await teacherOwnsClass(classId, req.user)) {
      return errorResponse(res, 'Không tìm thấy lớp được phân công', 404);
    }
    if (!sessionDate || !Array.isArray(records)) {
      return errorResponse(res, 'Dữ liệu điểm danh không hợp lệ (cần sessionDate và mảng records)', 400);
    }

    const date = new Date(sessionDate);
    if (Number.isNaN(date.getTime())) return errorResponse(res, 'Ngày điểm danh không hợp lệ', 400);
    const validStatuses = ['PRESENT', 'LATE', 'ABSENT_EXCUSED', 'ABSENT_UNEXCUSED'];
    const studentIds = records.map(record => Number(record.studentId));
    if (studentIds.some(id => !Number.isSafeInteger(id)) || new Set(studentIds).size !== studentIds.length ||
      records.some(record => !validStatuses.includes(record.status || 'PRESENT'))) {
      return errorResponse(res, 'Danh sách hoặc trạng thái điểm danh không hợp lệ', 400);
    }
    const activeEnrollments = await Enrollment.find({
      classId,
      studentId: { $in: studentIds },
      status: 'ACTIVE'
    }).select('studentId');
    if (activeEnrollments.length !== studentIds.length) {
      return errorResponse(res, 'Danh sách có học viên không thuộc lớp hoặc đã ngừng học', 400);
    }

    // Lưu từng bản ghi điểm danh (upsert theo UNIQUE classId, studentId, sessionDate)
    await withTransaction(async session => {
      for (const rec of records) {
        const studentId = parseInt(rec.studentId);
        const status = rec.status || 'PRESENT';
        const note = rec.note || null;

        const existing = await Attendance.findOne({ classId, studentId, sessionDate: date }).session(session);
        if (existing) {
          existing.status = status;
          existing.note = note;
          await existing.save({ session });
        } else {
          await Attendance.create([{ classId, studentId, sessionDate: date, status, note }], { session });
        }

        // ĐỒNG BỘ CỜ CẤM THI (IS_BANNED), XÉT QUA MÔN VÀ GỢI Ý ĐIỂM CHUYÊN CẦN
        await syncAttendanceAndGrades(session, classId, studentId);
      }
    });

    return successResponse(res, null, 'Lưu bảng điểm danh buổi học thành công (Đã tự động đồng bộ cờ cấm thi và điểm chuyên cần)');
  } catch (error) {
    console.error('Error saving attendances:', error);
    return errorResponse(res, 'Lỗi lưu điểm danh buổi học', 500);
  }
});

// UC6.2: Thống kê tỷ lệ chuyên cần cả kỳ của lớp, gắn cờ cấm thi
router.get('/classes/:id/attendance-summary', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    if (!await teacherOwnsClass(classId, req.user)) {
      return errorResponse(res, 'Không tìm thấy lớp được phân công', 404);
    }

    const classDoc = await Class.findOne({ id: classId }).populate(['course', {
      path: 'enrollments',
      match: { status: 'ACTIVE' },
      populate: { path: 'student', select: 'id code fullName email' }
    }]);

    if (!classDoc) {
      return errorResponse(res, 'Không tìm thấy lớp học', 404);
    }
    const classInfo = plain(classDoc);

    const totalSessions = classInfo.course?.totalSessions || 30;

    // Lấy toàn bộ bản ghi điểm danh của lớp
    const allAttendances = await Attendance.find({ classId });

    const summary = classInfo.enrollments.filter(e => e.student).map(e => {
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

// Báo cáo chuyên cần cá nhân của học viên (Kỳ học 2 tuần)
router.get('/attendances/my-report', authenticateJWT, authorizeRoles('STUDENT'), async (req, res) => {
  try {
    const studentId = req.user.id;
    const sessionDate = studyWeek(req.query.weekStart);
    const enrollments = (await Enrollment.find({ studentId, status: 'ACTIVE' })
      .populate([
        'grade',
        { path: 'class', populate: ['course', { path: 'teacher', select: 'fullName' }, 'schedules'] }
      ])).map(plain).filter(e => e.class && e.class.course?.deliveryMode !== 'RECORDED');
    const allRecords = (await Attendance.find({ studentId, classId: { $in: enrollments.map(e => e.classId) } })
      .sort({ sessionDate: 1 })).map(plain);

    const report = enrollments.map(e => {
      const records = allRecords.filter(r => r.classId === e.classId);

      // Xây dựng danh sách đầy đủ buổi học trong 2 tuần (Tuần 1: 02/11 - 08/11, Tuần 2: 09/11 - 15/11)
      const recordByDate = new Map();
      records.forEach(r => {
        const dStr = new Date(r.sessionDate).toISOString().split('T')[0];
        recordByDate.set(dStr, r);
      });

      const schedules = e.class.schedules || [];
      const plannedSessions = [];
      // Tuần 1
      schedules.forEach(s => {
        const dateStr = sessionDate(s.dayOfWeek);
        plannedSessions.push({ week: 1, dateStr, dayOfWeek: s.dayOfWeek, shift: s.shift, room: s.room });
      });
      // Tuần 2
      schedules.forEach(s => {
        const dateStr = sessionDate(s.dayOfWeek, 1);
        plannedSessions.push({ week: 2, dateStr, dayOfWeek: s.dayOfWeek, shift: s.shift, room: s.room });
      });

      // Giữ toàn bộ lịch sử đã điểm danh, kể cả ngoài hai tuần đang xem.
      for (const record of records) {
        const dateStr = new Date(record.sessionDate).toISOString().slice(0, 10);
        if (!plannedSessions.some(s => s.dateStr === dateStr)) plannedSessions.push({ dateStr, week: null, dayOfWeek: new Date(record.sessionDate).getUTCDay() === 0 ? 8 : new Date(record.sessionDate).getUTCDay() + 1 });
      }
      plannedSessions.sort((a, b) => a.dateStr.localeCompare(b.dateStr) || (a.shift || 0) - (b.shift || 0));
      const totalSessions = e.class.course?.totalSessions || plannedSessions.length || 1;
      const present = records.filter(r => r.status === 'PRESENT').length;
      const absentExcused = records.filter(r => r.status === 'ABSENT_EXCUSED').length;
      const absentUnexcused = records.filter(r => r.status === 'ABSENT_UNEXCUSED').length;
      const late = records.filter(r => r.status === 'LATE').length;
      const absentRate = parseFloat(((absentUnexcused / totalSessions) * 100).toFixed(1));
      const isBanned = e.grade?.isBanned || absentRate >= 20.0;

      const sessions = plannedSessions.map((ps, idx) => {
        const rec = recordByDate.get(ps.dateStr);
        return {
          sessionNo: idx + 1,
          week: ps.week,
          sessionDate: ps.dateStr,
          dayOfWeek: ps.dayOfWeek,
          shift: ps.shift,
          room: ps.room,
          status: rec ? rec.status : ps.dateStr > vietnamToday() ? 'UPCOMING' : 'NOT_RECORDED',
          note: rec ? (rec.note || '') : ps.dateStr > vietnamToday() ? 'Chưa đến buổi học' : 'Chưa điểm danh'
        };
      });

      return {
        classId: e.class.id,
        classCode: e.class.classCode,
        semester: e.class.semester,
        teacherName: e.class.teacher?.fullName || 'Chưa phân công',
        courseCode: e.class.course?.courseCode,
        courseName: e.class.course?.name,
        totalSessions,
        recordedSessions: records.length,
        present,
        absentExcused,
        absentUnexcused,
        late,
        absentRate,
        attendanceScore: e.grade?.attendanceScore !== null && e.grade?.attendanceScore !== undefined ? Number(e.grade.attendanceScore) : 10.0,
        isBanned,
        sessions
      };
    });

    return successResponse(res, report, 'Lấy báo cáo chuyên cần thành công');
  } catch (error) {
    console.error('Error getting my-report:', error);
    return errorResponse(res, error.status ? error.message : 'Lỗi lấy báo cáo chuyên cần', error.status || 500);
  }
});

// ==========================================
// 2. ASSIGNMENTS & SUBMISSIONS (UC7.1 - UC7.3)
// ==========================================

// UC7.1: Lấy danh sách bài tập theo lớp
router.get('/classes/:id/assignments', authenticateJWT, async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    if (!await canAccessClass(classId, req.user)) {
      return errorResponse(res, 'Không tìm thấy lớp được phân công', 404);
    }
    const userId = req.user.id;
    const role = req.user.role;

    const assignments = await Assignment.find({ classId }).sort({ createdAt: -1 });
    const ids = assignments.map(a => a.id);
    const counts = await Submission.aggregate([{ $match: { assignmentId: { $in: ids } } }, { $group: { _id: '$assignmentId', n: { $sum: 1 } } }]);
    const countMap = new Map(counts.map(c => [c._id, c.n]));
    const mine = role === 'STUDENT' ? await Submission.find({ assignmentId: { $in: ids }, studentId: userId }) : [];
    const mineMap = new Map(mine.map(s => [s.assignmentId, plain(s)]));

    return successResponse(
      res,
      assignments.map(a => ({
        id: a.id,
        title: a.title,
        description: a.description,
        fileUrl: a.fileUrl,
        dueDate: a.dueDate,
        createdAt: a.createdAt,
        totalSubmissions: countMap.get(a.id) || 0,
        mySubmission: role === 'STUDENT' ? mineMap.get(a.id) || null : null
      })),
      'Lấy danh sách bài tập thành công'
    );
  } catch (error) {
    console.error('Error fetching assignments:', error);
    return errorResponse(res, 'Lỗi lấy danh sách bài tập', 500);
  }
});

// UC7.1: Giảng viên giao bài tập mới (hỗ trợ upload file đề bài)
router.post('/classes/:id/assignments', authenticateJWT, authorizeRoles('ADMIN', 'TEACHER'), requireAssignedClass, upload.single('file'), async (req, res) => {
  try {
    const classId = parseInt(req.params.id);
    const { title, description, dueDate } = req.body;

    if (!title || !dueDate) {
      return errorResponse(res, 'Tiêu đề và Hạn nộp bài là bắt buộc', 400);
    }
    if (Number.isNaN(new Date(dueDate).getTime())) {
      return errorResponse(res, 'Hạn nộp bài không hợp lệ', 400);
    }

    const fileUrl = req.file ? `/uploads/${req.file.filename}` : null;

    const assignment = await Assignment.create({
      classId,
      title: title.trim(),
      description: description || '',
      fileUrl,
      dueDate: new Date(dueDate)
    });

    // Tạo thông báo cho toàn bộ học viên trong lớp
    const enrollments = await Enrollment.find({ classId, status: 'ACTIVE' }).select('studentId');

    if (enrollments.length > 0) {
      await Notification.insertMany(enrollments.map(e => ({
        userId: e.studentId,
        title: `Bài tập mới: ${assignment.title}`,
        message: `Giảng viên vừa giao bài tập mới. Hạn nộp: ${new Date(dueDate).toLocaleString('vi-VN')}`,
        type: 'ASSIGNMENT'
      })));
    }

    return successResponse(res, plain(assignment), 'Giao bài tập thành công', 201);
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
    const assignment = await Assignment.findOne({ id }).select('classId');
    if (!assignment) return errorResponse(res, 'Không tìm thấy bài tập', 404);
    if (!await canAccessClass(assignment.classId, req.user)) {
      return errorResponse(res, 'Bạn không có quyền xem bài tập này', 403);
    }

    const doc = await Assignment.findOne({ id }).populate([
      { path: 'class', populate: ['course', { path: 'teacher', select: 'fullName' }] },
      {
        path: 'submissions',
        match: role === 'STUDENT' ? { studentId: userId } : {},
        populate: { path: 'student', select: 'id code fullName email' }
      }
    ]);

    if (!doc) {
      return errorResponse(res, 'Không tìm thấy bài tập', 404);
    }

    return successResponse(res, plain(doc), 'Lấy chi tiết bài tập thành công');
  } catch (error) {
    console.error('Error getting assignment detail:', error);
    return errorResponse(res, 'Lỗi lấy chi tiết bài tập', 500);
  }
});

// UC7.2: Học viên nộp bài trực tuyến (Upload file)
router.post(['/assignments/:id/submissions', '/assignments/:id/submit'], authenticateJWT, authorizeRoles('STUDENT'), async (req, res, next) => {
  try {
    const assignment = await Assignment.findOne({ id: Number(req.params.id) });
    if (!assignment || !await canAccessClass(assignment.classId, req.user)) return errorResponse(res, 'Không có quyền nộp bài tập này', 403);
    next();
  } catch (error) { next(error); }
}, upload.single('file'), async (req, res) => {
  try {
    const assignmentId = parseInt(req.params.id);
    const studentId = req.user.id;

    const assignment = await Assignment.findOne({ id: assignmentId });

    if (!assignment) {
      return errorResponse(res, 'Không tìm thấy bài tập', 404);
    }
    if (!await canAccessClass(assignment.classId, req.user)) {
      return errorResponse(res, 'Bạn không có quyền nộp bài cho lớp này', 403);
    }

    let link = null;
    if (req.body.link) {
      try {
        const url = new URL(req.body.link);
        if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
        link = url.href;
      } catch { return errorResponse(res, 'Link bài làm phải là URL http/https hợp lệ', 400); }
    }
    if (!req.file && !link) return errorResponse(res, 'Vui lòng đính kèm file hoặc link bài làm', 400);
    if (req.body.content && (typeof req.body.content !== 'string' || req.body.content.length > 10000)) return errorResponse(res, 'Nội dung quá dài', 400);
    const fileUrl = req.file ? `/uploads/${req.file.filename}` : link;
    const now = new Date();
    const isLate = now > new Date(assignment.dueDate);
    const submissionStatus = isLate ? 'LATE_SUBMITTED' : 'SUBMITTED';

    // Upsert theo ràng buộc UNIQUE(assignment_id, student_id)
    let submission = await Submission.findOne({ assignmentId, studentId });
    if (submission) {
      submission.fileUrl = fileUrl;
      submission.submittedAt = now;
      submission.status = submissionStatus;
      submission.content = req.body.content || null;
      submission.score = null;
      submission.teacherFeedback = null;
      await submission.save();
    } else {
      submission = await Submission.create({ assignmentId, studentId, fileUrl, content: req.body.content || null, submittedAt: now, status: submissionStatus });
    }

    return successResponse(
      res,
      plain(submission),
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
    const existing = await Submission.findOne({ id }).populate('assignment');
    if (!existing || !existing.assignment) return errorResponse(res, 'Không tìm thấy bài nộp', 404);
    if (!await canAccessClass(existing.assignment.classId, req.user)) {
      return errorResponse(res, 'Bạn không có quyền chấm bài này', 403);
    }

    const numericScore = parseFloat(score);
    if (isNaN(numericScore) || numericScore < 0 || numericScore > 10) {
      return errorResponse(res, 'Điểm số phải là số từ 0.0 đến 10.0', 400);
    }

    const submission = await Submission.findOneAndUpdate(
      { id },
      { $set: { score: numericScore, teacherFeedback: teacherFeedback || null } },
      { new: true }
    ).populate(['assignment', { path: 'student', select: 'fullName' }]);
    if (!submission) return errorResponse(res, 'Không tìm thấy bài nộp', 404);

    // Gửi thông báo cho sinh viên được chấm
    await Notification.create({
      userId: submission.studentId,
      title: `Điểm bài tập: ${submission.assignment.title}`,
      message: `Bạn nhận được ${numericScore}/10 điểm. Lời nhận xét: ${teacherFeedback || 'Không có'}`,
      type: 'GRADE'
    });

    return successResponse(res, plain(submission), 'Chấm điểm bài tập thành công');
  } catch (error) {
    console.error('Error grading submission:', error);
    return errorResponse(res, 'Lỗi chấm điểm bài tập', 500);
  }
});

module.exports = router;
