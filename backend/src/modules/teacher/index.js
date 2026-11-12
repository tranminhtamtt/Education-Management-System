const express = require('express');
const router = express.Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const {
  Assignment, Attendance, Class, Course, CourseQuestion,
  Enrollment, Schedule, Submission
} = require('../../models');
const { plain } = require('../../utils/query');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

const { teacherQuestionScope } = require('../student/questionScope');

const activeStatuses = new Set(['UPCOMING', 'ONGOING']);

async function getTeacherScope(teacherId) {
  const classes = (await Class.find({ teacherId })
    .sort({ semester: -1, classCode: 1 })
    .populate(['course', 'schedules'])).map(plain);
  const assignedCourseIds = [...new Set(classes.map(item => item.courseId))];
  const courses = (await Course.find({
    $or: [{ instructorId: teacherId }, { id: { $in: assignedCourseIds } }]
  }).sort({ courseCode: 1 })).map(plain);
  const classIds = classes.map(item => item.id);
  return { classes, courses, classIds };
}

router.get('/teacher/dashboard', authenticateJWT, authorizeRoles('TEACHER'), async (req, res) => {
  try {
    const scope = await getTeacherScope(req.user.id);
    const liveClasses = scope.classes.filter(item =>
      item.course?.deliveryMode === 'LIVE_ONLINE' && activeStatuses.has(item.status)
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
    const questionScope = await teacherQuestionScope(req.user.id);
    const pendingQuestions = await CourseQuestion.countDocuments({ ...questionScope, status: 'PENDING' });
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

    const schedules = scope.classes.filter(classItem => activeStatuses.has(classItem.status)).flatMap(classItem =>
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

module.exports = router;
