const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const {
  Assignment, Attendance, Class, Course, CourseLesson, CourseQuestion,
  Enrollment, Notification, Schedule, Submission
} = require('../../models');
const { plain } = require('../../utils/query');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

const activeStatuses = ['UPCOMING', 'ONGOING'];

async function getTeacherScope(teacherId) {
  const classes = (await Class.find({ teacherId })
    .sort({ semester: -1, classCode: 1 })
    .populate(['course', 'schedules'])).map(plain);
  const assignedCourseIds = [...new Set(classes.map(item => item.courseId))];
  const courses = (await Course.find({
    $or: [{ instructorId: teacherId }, { id: { $in: assignedCourseIds } }]
  }).sort({ courseCode: 1 })).map(plain);
  const classIds = classes.map(item => item.id);
  const courseIds = courses.map(item => item.id);
  const lessons = courseIds.length
    ? await CourseLesson.find({ courseId: { $in: courseIds } }).select('id courseId')
    : [];
  return { classes, courses, classIds, courseIds, lessonIds: lessons.map(item => item.id) };
}

function questionScope({ classIds, lessonIds }) {
  return { $or: [
    { classId: { $in: classIds } },
    { lessonId: { $in: lessonIds } }
  ] };
}

router.get('/teacher/dashboard', authenticateJWT, authorizeRoles('TEACHER'), async (req, res) => {
  try {
    const scope = await getTeacherScope(req.user.id);
    const liveClasses = scope.classes.filter(item =>
      item.course?.deliveryMode === 'LIVE_ONLINE' && activeStatuses.includes(item.status)
    );
    const activeClassIds = liveClasses.map(item => item.id);
    const activeEnrollments = activeClassIds.length
      ? await Enrollment.find({ classId: { $in: activeClassIds }, status: 'ACTIVE' })
        .select('classId studentId').populate({ path: 'student', select: 'code fullName' })
      : [];
    const activeLearnerCount = new Set(activeEnrollments.map(item => item.studentId)).size;
    const assignments = scope.classIds.length
      ? await Assignment.find({ classId: { $in: scope.classIds } }).select('id classId')
      : [];
    const pendingSubmissions = assignments.length
      ? await Submission.countDocuments({
          assignmentId: { $in: assignments.map(item => item.id) },
          score: null
        })
      : 0;
    const pendingQuestions = scope.classIds.length || scope.lessonIds.length
      ? await CourseQuestion.countDocuments({ ...questionScope(scope), status: 'PENDING' })
      : 0;
    const absences = activeClassIds.length
      ? await Attendance.find({ classId: { $in: activeClassIds }, status: 'ABSENT_UNEXCUSED' })
      : [];

    const absenceCounts = new Map();
    absences.forEach(item => {
      const key = `${item.classId}:${item.studentId}`;
      absenceCounts.set(key, (absenceCounts.get(key) || 0) + 1);
    });
    const classById = new Map(scope.classes.map(item => [item.id, item]));
    const studentByEnrollment = new Map(activeEnrollments.map(item => [
      `${item.classId}:${item.studentId}`,
      item.student
    ]));
    const attendanceWarnings = activeEnrollments.flatMap(enrollment => {
      const classItem = classById.get(enrollment.classId);
      const student = studentByEnrollment.get(`${enrollment.classId}:${enrollment.studentId}`);
      if (!classItem || !student) return [];
      const totalSessions = classItem.course?.totalSessions || 30;
      const absentUnexcused = absenceCounts.get(`${enrollment.classId}:${enrollment.studentId}`) || 0;
      const absentRate = (absentUnexcused / totalSessions) * 100;
      return absentRate > 20 ? [{
        classId: enrollment.classId,
        classCode: classItem.classCode,
        studentId: enrollment.studentId,
        code: student.code,
        fullName: student.fullName,
        absentUnexcused,
        totalSessions,
        absentRate: Number(absentRate.toFixed(1))
      }] : [];
    }).sort((a, b) => b.absentRate - a.absentRate);

    const schedules = scope.classes.filter(classItem => activeStatuses.includes(classItem.status)).flatMap(classItem =>
      (classItem.schedules || []).map(schedule => ({
        id: schedule.id,
        classId: classItem.id,
        classCode: classItem.classCode,
        courseCode: classItem.course?.courseCode,
        courseName: classItem.course?.name,
        deliveryMode: classItem.course?.deliveryMode,
        semester: classItem.semester,
        dayOfWeek: schedule.dayOfWeek,
        shift: schedule.shift,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        room: schedule.room,
        meetUrl: classItem.meetUrl || null
      }))
    ).sort((a, b) => a.dayOfWeek - b.dayOfWeek || a.shift - b.shift);
    const enrollmentCounts = new Map();
    activeEnrollments.forEach(item => {
      enrollmentCounts.set(item.classId, (enrollmentCounts.get(item.classId) || 0) + 1);
    });

    return successResponse(res, {
      courses: scope.courses,
      classes: scope.classes.map(item => ({
        id: item.id,
        classCode: item.classCode,
        courseId: item.courseId,
        courseCode: item.course?.courseCode,
        courseName: item.course?.name,
        deliveryMode: item.course?.deliveryMode,
        semester: item.semester,
        status: item.status,
        meetUrl: item.meetUrl || null,
        activeLearnerCount: enrollmentCounts.get(item.id) || 0
      })),
      liveClasses: liveClasses.map(item => ({
        id: item.id,
        classCode: item.classCode,
        courseCode: item.course?.courseCode,
        courseName: item.course?.name,
        semester: item.semester,
        status: item.status,
        meetUrl: item.meetUrl || null,
        activeLearnerCount: enrollmentCounts.get(item.id) || 0
      })),
      schedules,
      attendanceWarnings,
      summary: {
        recordedCourseCount: scope.courses.filter(course => course.deliveryMode === 'RECORDED').length,
        liveClassCount: liveClasses.length,
        activeLearnerCount,
        pendingGradingCount: pendingSubmissions,
        newQuestionCount: pendingQuestions
      }
    }, 'Lấy Teacher Dashboard thành công');
  } catch (error) {
    console.error('Error fetching teacher dashboard:', error);
    return errorResponse(res, 'Lỗi lấy Teacher Dashboard', 500);
  }
});

router.patch('/teacher/classes/:id', authenticateJWT, authorizeRoles('TEACHER'), async (req, res) => {
  try {
    const classId = Number.parseInt(req.params.id, 10);
    if (!Number.isSafeInteger(classId)) return errorResponse(res, 'ID lớp không hợp lệ', 400);
    const keys = Object.keys(req.body || {});
    if (keys.length !== 1 || keys[0] !== 'meetUrl') {
      return errorResponse(res, 'Chỉ được cập nhật đường dẫn lớp học trực tuyến', 400);
    }

    const classItem = await Class.findOne({ id: classId, teacherId: req.user.id }).populate('course');
    if (!classItem) return errorResponse(res, 'Không tìm thấy lớp được phân công', 404);
    if (classItem.course?.deliveryMode !== 'LIVE_ONLINE') {
      return errorResponse(res, 'Chỉ lớp LIVE_ONLINE mới có đường dẫn phòng học', 400);
    }
    const meetUrl = String(req.body.meetUrl || '').trim();
    if (meetUrl) {
      try {
        const url = new URL(meetUrl);
        if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported protocol');
      } catch {
        return errorResponse(res, 'Đường dẫn Meet/Zoom không hợp lệ', 400);
      }
    }

    classItem.meetUrl = meetUrl || null;
    await classItem.save();
    return successResponse(res, { id: classItem.id, meetUrl: classItem.meetUrl }, 'Cập nhật link lớp học thành công');
  } catch (error) {
    console.error('Error updating teacher class link:', error);
    return errorResponse(res, 'Lỗi cập nhật link lớp học', 500);
  }
});

router.get('/questions', authenticateJWT, authorizeRoles('TEACHER', 'STUDENT'), async (req, res) => {
  try {
    const status = req.query.status ? String(req.query.status).toUpperCase() : null;
    if (status && !['PENDING', 'ANSWERED', 'RESOLVED'].includes(status)) {
      return errorResponse(res, 'Trạng thái Q&A không hợp lệ', 400);
    }
    const where = status ? { status } : {};
    if (req.user.role === 'STUDENT') {
      where.studentId = req.user.id;
    } else {
      const scope = await getTeacherScope(req.user.id);
      if (!scope.classIds.length && !scope.lessonIds.length) {
        return successResponse(res, [], 'Chưa có câu hỏi');
      }
      Object.assign(where, questionScope(scope));
    }

    const questions = (await CourseQuestion.find(where)
      .sort({ status: 1, createdAt: -1, id: -1 })
      .populate([
        { path: 'student', select: 'id code fullName email' },
        { path: 'class', populate: { path: 'course', select: 'courseCode name' } },
        { path: 'lesson', populate: { path: 'course', select: 'courseCode name' } },
        { path: 'answeredBy', select: 'id fullName' }
      ])).map(plain);
    return successResponse(res, questions, 'Lấy danh sách hỏi đáp thành công');
  } catch (error) {
    console.error('Error fetching course questions:', error);
    return errorResponse(res, 'Lỗi lấy danh sách hỏi đáp', 500);
  }
});

router.post('/questions', authenticateJWT, authorizeRoles('STUDENT'), async (req, res) => {
  try {
    const questionTitle = String(req.body.questionTitle || '').trim();
    const questionContent = String(req.body.questionContent || '').trim();
    const classId = req.body.classId ? Number.parseInt(req.body.classId, 10) : null;
    const lessonId = req.body.lessonId ? Number.parseInt(req.body.lessonId, 10) : null;
    if (!questionTitle || !questionContent || questionTitle.length > 200 || questionContent.length > 10000) {
      return errorResponse(res, 'Vui lòng nhập tiêu đề và nội dung câu hỏi hợp lệ', 400);
    }
    if (!classId && !lessonId) return errorResponse(res, 'Câu hỏi cần gắn với lớp hoặc bài giảng', 400);
    if ((classId && !Number.isSafeInteger(classId)) || (lessonId && !Number.isSafeInteger(lessonId))) {
      return errorResponse(res, 'Lớp hoặc bài giảng không hợp lệ', 400);
    }

    const lesson = lessonId ? await CourseLesson.findOne({ id: lessonId }) : null;
    if (lessonId && !lesson) return errorResponse(res, 'Không tìm thấy bài giảng', 404);
    let classItem = classId ? await Class.findOne({ id: classId }).populate('course') : null;
    if (classId && !classItem) return errorResponse(res, 'Không tìm thấy lớp học', 404);
    if (classItem && !await Enrollment.exists({ classId, studentId: req.user.id, status: 'ACTIVE' })) {
      return errorResponse(res, 'Bạn chưa ghi danh lớp học này', 403);
    }
    if (classItem && lesson && classItem.courseId !== lesson.courseId) {
      return errorResponse(res, 'Bài giảng không thuộc khóa học của lớp', 400);
    }
    if (!classItem && lesson) {
      const candidateClasses = await Class.find({ courseId: lesson.courseId }).select('id');
      const enrollment = await Enrollment.findOne({
        classId: { $in: candidateClasses.map(item => item.id) },
        studentId: req.user.id,
        status: 'ACTIVE'
      }).sort({ enrolledAt: -1 });
      if (!enrollment) return errorResponse(res, 'Bạn chưa ghi danh khóa học này', 403);
      classItem = await Class.findOne({ id: enrollment.classId }).populate('course');
    }

    const question = await CourseQuestion.create({
      studentId: req.user.id,
      classId: classItem?.id || null,
      lessonId: lesson?.id || null,
      questionTitle,
      questionContent
    });
    const teacherId = classItem?.teacherId || classItem?.course?.instructorId;
    if (teacherId) {
      await Notification.create({
        userId: teacherId,
        title: `Câu hỏi mới: ${questionTitle}`,
        message: `Học viên vừa gửi câu hỏi trong lớp ${classItem?.classCode || classItem?.course?.courseCode}.`,
        type: 'QA'
      });
    }
    return successResponse(res, plain(question), 'Đã gửi câu hỏi cho giảng viên', 201);
  } catch (error) {
    console.error('Error creating course question:', error);
    return errorResponse(res, 'Lỗi gửi câu hỏi', 500);
  }
});

router.patch('/questions/:id/answer', authenticateJWT, authorizeRoles('TEACHER'), async (req, res) => {
  try {
    const id = Number.parseInt(req.params.id, 10);
    const teacherAnswer = String(req.body.teacherAnswer || '').trim();
    if (!Number.isSafeInteger(id)) return errorResponse(res, 'ID câu hỏi không hợp lệ', 400);
    if (!teacherAnswer || teacherAnswer.length > 10000) {
      return errorResponse(res, 'Nội dung trả lời không được để trống và tối đa 10.000 ký tự', 400);
    }
    const scope = await getTeacherScope(req.user.id);
    const question = await CourseQuestion.findOne({
      id,
      ...questionScope(scope)
    });
    if (!question) return errorResponse(res, 'Không tìm thấy câu hỏi thuộc lớp hoặc khóa học của bạn', 404);
    if (question.status === 'RESOLVED') return errorResponse(res, 'Câu hỏi đã được đóng', 409);

    question.teacherAnswer = teacherAnswer;
    question.status = 'ANSWERED';
    question.answeredById = req.user.id;
    question.answeredAt = new Date();
    await question.save();
    await Notification.create({
      userId: question.studentId,
      title: 'Giảng viên đã trả lời câu hỏi',
      message: `Câu hỏi "${question.questionTitle}" đã có phản hồi.`,
      type: 'QA'
    });
    return successResponse(res, plain(question), 'Đã gửi câu trả lời');
  } catch (error) {
    console.error('Error answering course question:', error);
    return errorResponse(res, 'Lỗi gửi câu trả lời', 500);
  }
});

module.exports = router;
