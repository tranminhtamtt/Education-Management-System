const router = require('express').Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const roles = (...allowed) => [authenticateJWT, authorizeRoles(...allowed)];
const { withTransaction, lockDoc } = require('../../config/db');
const M = require('../../models');
const { plain, like, httpError } = require('../../utils/query');
const { successResponse, errorResponse } = require('../../utils/formatResponse');

const id = value => {
  const number = Number(value);
  if (!Number.isSafeInteger(number) || number <= 0) throw httpError('Mã dữ liệu không hợp lệ');
  return number;
};
const text = (value, max) => {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > max) throw httpError('Nội dung bắt buộc hoặc vượt độ dài cho phép');
  return value.trim();
};
const optionalUrl = value => {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error();
    return url.href;
  } catch { throw httpError('Đường dẫn phải là URL http/https hợp lệ'); }
};
const endpoint = handler => async (req, res) => {
  try { await handler(req, res); } catch (error) {
    if (!error.status) console.error('Student API:', error);
    errorResponse(res, error.status ? error.message : 'Không thể thực hiện thao tác học tập', error.status || 500);
  }
};
const populated = [
  { path: 'class', populate: ['course', 'schedules', { path: 'teacher', select: 'id fullName code' }] },
  'tuitionInvoice', 'grade'
];
async function myEnrollment(studentId, enrollmentId, activeOnly = true) {
  const enrollment = await M.Enrollment.findOne({ id: enrollmentId, studentId, ...(activeOnly ? { status: 'ACTIVE' } : {}) }).populate(populated);
  if (!enrollment || !enrollment.class?.course) throw httpError('Không tìm thấy khóa học được phép truy cập', 404);
  return enrollment;
}

router.get('/courses/catalog', roles('STUDENT', 'ADMIN'), endpoint(async (req, res) => {
  const filter = { status: 'ACTIVE' };
  for (const [field, choices] of Object.entries({ category: ['FPT_SUBJECT', 'CERTIFICATE'], deliveryMode: ['RECORDED', 'LIVE_ONLINE'] })) {
    if (req.query[field]) {
      if (!choices.includes(req.query[field])) throw httpError('Bộ lọc khóa học không hợp lệ');
      filter[field] = req.query[field];
    }
  }
  if (req.query.search) filter.$or = [{ name: like(req.query.search) }, { courseCode: like(req.query.search) }];
  const page = Math.min(100000, Math.max(1, Math.floor(Number(req.query.page) || 1)));
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(req.query.pageSize) || 12)));
  const total = await M.Course.countDocuments(filter);
  const items = await M.Course.find(filter).sort({ courseCode: 1 }).skip((page - 1) * pageSize).limit(pageSize)
    .populate({ path: 'instructor', select: 'id fullName teacherProfile' });
  successResponse(res, { items: items.map(plain), total, page, pageSize });
}));

router.get('/courses/catalog/:id', roles('STUDENT', 'ADMIN'), endpoint(async (req, res) => {
  const course = await M.Course.findOne({ id: id(req.params.id), status: 'ACTIVE' })
    .populate({ path: 'instructor', select: 'id fullName teacherProfile' });
  if (!course) throw httpError('Không tìm thấy khóa học', 404);
  const lessons = await M.CourseLesson.find({ courseId: course.id }).sort({ orderIndex: 1 });
  const classes = await M.Class.find({ courseId: course.id, status: { $in: ['UPCOMING', 'ONGOING'] } })
    .populate(['schedules', { path: 'teacher', select: 'id fullName teacherProfile' }]);
  const counts = await M.Enrollment.aggregate([
    { $match: { classId: { $in: classes.map(c => c.id) }, status: { $in: ['ACTIVE', 'PENDING_PAYMENT'] } } },
    { $group: { _id: '$classId', count: { $sum: 1 } } }
  ]);
  const countMap = new Map(counts.map(c => [c._id, c.count]));
  successResponse(res, { ...plain(course), lessons: lessons.map(l => ({
    id: l.id, title: l.title, sectionTitle: l.sectionTitle, orderIndex: l.orderIndex,
    durationMinutes: l.durationMinutes, isPreview: l.isPreview,
    videoUrl: l.isPreview ? l.videoUrl : null
  })), classes: course.deliveryMode === 'RECORDED' ? [] : classes.map(c => ({
    id: c.id, classCode: c.classCode, semester: c.semester, status: c.status,
    teacher: c.teacher, schedules: c.schedules, remainingSeats: Math.max(0, c.maxStudents - (countMap.get(c.id) || 0))
  })) });
}));

// Content owners can publish real lesson URLs; student catalog only exposes previews.
router.get('/courses/:id/lessons', roles('ADMIN', 'TEACHER'), endpoint(async (req, res) => {
  const course = await M.Course.findOne({ id: id(req.params.id) });
  if (!course) throw httpError('Không tìm thấy khóa học', 404);
  if (req.user.role === 'TEACHER' && course.instructorId !== req.user.id) throw httpError('Không được phân công khóa học', 403);
  successResponse(res, (await M.CourseLesson.find({ courseId: course.id }).sort({ orderIndex: 1 })).map(plain));
}));
router.post('/courses/:id/lessons', roles('ADMIN', 'TEACHER'), endpoint(async (req, res) => {
  const courseId = id(req.params.id), orderIndex = id(req.body.orderIndex);
  const values = {
    title: text(req.body.title, 200), sectionTitle: req.body.sectionTitle ? text(req.body.sectionTitle, 200) : 'Nội dung khóa học',
    videoUrl: optionalUrl(req.body.videoUrl), materialUrl: optionalUrl(req.body.materialUrl),
    isPreview: req.body.isPreview === true, durationMinutes: Number(req.body.durationMinutes || 0)
  };
  if (!Number.isFinite(values.durationMinutes) || values.durationMinutes < 0) throw httpError('Thời lượng không hợp lệ');
  const lesson = await withTransaction(async session => {
    const course = await lockDoc(M.Course, { id: courseId }, session);
    if (!course) throw httpError('Không tìm thấy khóa học', 404);
    if (req.user.role === 'TEACHER' && course.instructorId !== req.user.id) throw httpError('Không được phân công khóa học', 403);
    let lesson = await M.CourseLesson.findOne({ courseId, orderIndex }).session(session);
    if (lesson) { Object.assign(lesson, values); await lesson.save({ session }); }
    else [lesson] = await M.CourseLesson.create([{ courseId, orderIndex, ...values }], { session });
    const total = await M.CourseLesson.countDocuments({ courseId }).session(session);
    const classes = await M.Class.find({ courseId }).select('id').session(session);
    await M.Enrollment.updateMany({ classId: { $in: classes.map(c => c.id) } }, [
      { $set: { progressPercent: { $round: [{ $multiply: [{ $divide: [{ $ifNull: ['$completedLessonsCount', 0] }, total] }, 100] }, 0] } } }
    ], { session });
    return plain(lesson);
  });
  successResponse(res, lesson, 'Đã lưu bài giảng');
}));

router.post('/courses/:id/purchase', roles('STUDENT'), endpoint(async (req, res) => {
  const courseId = id(req.params.id);
  const result = await withTransaction(async session => {
    // Serialize purchases per course (capacity) and per student (schedule conflicts).
    const course = await lockDoc(M.Course, { id: courseId, status: 'ACTIVE' }, session);
    const student = await lockDoc(M.User, { id: req.user.id, role: 'STUDENT', status: 'ACTIVE' }, session);
    if (!course || !student) throw httpError('Khóa học hoặc tài khoản không khả dụng', 404);
    let classItem;
    if (course.deliveryMode === 'RECORDED') {
      classItem = await M.Class.findOne({ classCode: `VIDEO-${course.id}` }).session(session);
      if (!classItem) [classItem] = await M.Class.create([{
        classCode: `VIDEO-${course.id}`, courseId, teacherId: course.instructorId,
        semester: 'SELF_PACED', status: 'ONGOING', maxStudents: 2147483647
      }], { session });
    } else {
      classItem = await lockDoc(M.Class, { id: id(req.body.classId), courseId, status: { $in: ['UPCOMING', 'ONGOING'] } }, session);
      if (!classItem) throw httpError('Lớp Live không mở đăng ký', 404);
    }
    const courseClasses = await M.Class.find({ courseId }).select('id').session(session);
    const existing = await M.Enrollment.findOne({ studentId: req.user.id, classId: { $in: courseClasses.map(c => c.id) }, status: { $in: ['ACTIVE', 'PENDING_PAYMENT'] } }).session(session);
    if (existing) {
      const invoice = await M.TuitionInvoice.findOne({ enrollmentId: existing.id }).session(session);
      return { enrollment: plain(existing), invoice: plain(invoice), existing: true };
    }
    if (await M.Enrollment.exists({ classId: classItem.id, studentId: req.user.id, status: 'DROPPED' }).session(session)) throw httpError('Đăng ký trước đã ngừng học. Vui lòng liên hệ giáo vụ để đăng ký lại', 409);
    if (course.deliveryMode === 'LIVE_ONLINE') {
      const count = await M.Enrollment.countDocuments({ classId: classItem.id, status: { $in: ['ACTIVE', 'PENDING_PAYMENT'] } }).session(session);
      if (count >= classItem.maxStudents) throw httpError('Lớp đã đủ sĩ số', 409);
      const mine = await M.Enrollment.find({ studentId: req.user.id, status: { $in: ['ACTIVE', 'PENDING_PAYMENT'] } }).select('classId').session(session);
      const others = await M.Class.find({ id: { $in: mine.map(e => e.classId) }, semester: classItem.semester, status: { $ne: 'COMPLETED' } }).select('id').session(session);
      const schedules = await M.Schedule.find({ classId: classItem.id }).session(session);
      const otherSchedules = await M.Schedule.find({ classId: { $in: others.map(c => c.id) } }).session(session);
      if (schedules.some(a => otherSchedules.some(b => a.dayOfWeek === b.dayOfWeek && a.startTime < b.endTime && b.startTime < a.endTime))) {
        throw httpError('Lớp Live trùng lịch với khóa học đã đăng ký', 409);
      }
    }
    const amount = Number(course.baseTuitionFee);
    if (!Number.isSafeInteger(amount) || amount < 0) throw httpError('Học phí khóa học không hợp lệ', 409);
    const [enrollment] = await M.Enrollment.create([{ classId: classItem.id, studentId: req.user.id, status: amount === 0 ? 'ACTIVE' : 'PENDING_PAYMENT' }], { session });
    const [invoice] = await M.TuitionInvoice.create([{
      studentId: req.user.id, enrollmentId: enrollment.id, amount, paidAmount: 0,
      status: amount === 0 ? 'PAID' : 'UNPAID', paidAt: amount === 0 ? new Date() : null,
      dueDate: new Date(Date.now() + 7 * 86400000)
    }], { session });
    await M.Grade.create([{ enrollmentId: enrollment.id }], { session });
    return { enrollment: plain(enrollment), invoice: plain(invoice), existing: false };
  });
  successResponse(res, result, result.enrollment.status === 'ACTIVE' ? 'Khóa học đã sẵn sàng' : 'Đăng ký thành công. Thanh toán học phí để mở khóa học', result.existing ? 200 : 201);
}));

router.get('/my-courses', roles('STUDENT'), endpoint(async (req, res) => {
  const enrollments = await M.Enrollment.find({ studentId: req.user.id, status: { $ne: 'DROPPED' } }).sort({ enrolledAt: -1 }).populate(populated);
  successResponse(res, enrollments.filter(e => e.class?.course).map(e => ({
    ...plain(e), class: { ...plain(e.class), meetUrl: e.status === 'ACTIVE' ? e.class.meetUrl : null }
  })));
}));

router.get('/my-courses/:id', roles('STUDENT'), endpoint(async (req, res) => {
  const enrollment = await myEnrollment(req.user.id, id(req.params.id));
  const lessons = await M.CourseLesson.find({ courseId: enrollment.class.courseId }).sort({ orderIndex: 1 });
  const progress = await M.LessonProgress.find({ enrollmentId: enrollment.id, studentId: req.user.id });
  successResponse(res, { ...plain(enrollment), lessons: lessons.map(l => ({ ...plain(l), isCompleted: progress.some(p => p.lessonId === l.id && p.isCompleted) })) });
}));

router.post('/lessons/:lessonId/complete', roles('STUDENT'), endpoint(async (req, res) => {
  const lessonId = id(req.params.lessonId), enrollmentId = id(req.body.enrollmentId);
  const result = await withTransaction(async session => {
    const enrollment = await lockDoc(M.Enrollment, { id: enrollmentId, studentId: req.user.id, status: 'ACTIVE' }, session);
    if (!enrollment) throw httpError('Khóa học chưa mở hoặc không thuộc tài khoản của bạn', 403);
    const classItem = await M.Class.findOne({ id: enrollment.classId }).session(session);
    const lesson = await M.CourseLesson.findOne({ id: lessonId, courseId: classItem?.courseId }).session(session);
    if (!lesson) throw httpError('Bài học không thuộc khóa học', 404);
    if (!await M.LessonProgress.exists({ enrollmentId, lessonId }).session(session)) {
      await M.LessonProgress.create([{ enrollmentId, lessonId, studentId: req.user.id, courseId: classItem.courseId, isCompleted: true, completedAt: new Date() }], { session });
    }
    const lessons = await M.CourseLesson.find({ courseId: classItem.courseId }).select('id').session(session);
    const count = await M.LessonProgress.countDocuments({ enrollmentId, lessonId: { $in: lessons.map(l => l.id) }, isCompleted: true }).session(session);
    enrollment.completedLessonsCount = count;
    enrollment.progressPercent = lessons.length ? Math.round(count / lessons.length * 100) : 0;
    await enrollment.save({ session });
    return plain(enrollment);
  });
  successResponse(res, result, 'Đã cập nhật tiến độ học tập');
}));

router.get('/analytics/student-overview', roles('STUDENT'), endpoint(async (req, res) => {
  const enrollments = await M.Enrollment.find({ studentId: req.user.id, status: 'ACTIVE' }).populate(populated);
  const active = enrollments.filter(e => e.class?.course);
  const grades = active.filter(e => e.grade?.totalScore != null);
  const classIds = active.filter(e => e.class.status !== 'COMPLETED').map(e => e.classId);
  const assignments = await M.Assignment.find({ classId: { $in: classIds }, dueDate: { $gte: new Date() } }).sort({ dueDate: 1 });
  const submitted = await M.Submission.find({ studentId: req.user.id, assignmentId: { $in: assignments.map(a => a.id) } }).select('assignmentId');
  const totalCredits = grades.reduce((sum, e) => sum + (Number(e.class.course.credits) || 1), 0);
  successResponse(res, {
    enrolledClassesCount: classIds.length, passedCourses: grades.filter(e => e.grade.isPassed).length,
    gpa: totalCredits ? Number((grades.reduce((sum, e) => sum + e.grade.totalScore * (Number(e.class.course.credits) || 1), 0) / totalCredits).toFixed(2)) : 0,
    averageProgress: active.length ? Math.round(active.reduce((sum, e) => sum + e.progressPercent, 0) / active.length) : 0,
    upcomingDeadlines: assignments.filter(a => !submitted.some(s => s.assignmentId === a.id)).slice(0, 5).map(a => ({ ...plain(a), isSubmitted: false }))
  });
}));

router.get('/questions', roles('STUDENT', 'TEACHER', 'ADMIN'), endpoint(async (req, res) => {
  const filter = {};
  if (req.user.role === 'STUDENT') filter.studentId = req.user.id;
  if (req.user.role === 'TEACHER') filter.classId = { $in: (await M.Class.find({ teacherId: req.user.id }).select('id')).map(c => c.id) };
  if (req.query.classId) {
    const classId = id(req.query.classId);
    if (req.user.role === 'TEACHER' && !filter.classId.$in.includes(classId)) throw httpError('Không có quyền xem lớp', 403);
    filter.classId = classId;
  }
  const rows = await M.CourseQuestion.find(filter).sort({ createdAt: -1 }).limit(200)
    .populate([{ path: 'class', select: 'id classCode' }, { path: 'student', select: 'id fullName code' }]);
  successResponse(res, rows.map(plain));
}));

router.post('/questions', roles('STUDENT'), endpoint(async (req, res) => {
  const classId = id(req.body.classId);
  if (!await M.Enrollment.exists({ classId, studentId: req.user.id, status: 'ACTIVE' })) throw httpError('Bạn chưa có quyền học khóa này', 403);
  const classItem = await M.Class.findOne({ id: classId });
  const lessonId = req.body.lessonId ? id(req.body.lessonId) : null;
  if (lessonId && !await M.CourseLesson.exists({ id: lessonId, courseId: classItem.courseId })) throw httpError('Bài học không thuộc khóa học');
  const question = await M.CourseQuestion.create({
    classId, studentId: req.user.id, lessonId,
    attachmentUrl: optionalUrl(req.body.attachmentUrl),
    questionTitle: text(req.body.questionTitle, 200), questionContent: text(req.body.questionContent, 10000)
  });
  successResponse(res, plain(question), 'Đã gửi câu hỏi tới giảng viên', 201);
}));

router.patch('/questions/:id/answer', roles('TEACHER', 'ADMIN'), endpoint(async (req, res) => {
  const answer = text(req.body.teacherAnswer, 10000);
  const result = await withTransaction(async session => {
    const question = await M.CourseQuestion.findOne({ id: id(req.params.id) }).session(session);
    if (!question) throw httpError('Không tìm thấy câu hỏi', 404);
    if (req.user.role === 'TEACHER' && !await M.Class.exists({ id: question.classId, teacherId: req.user.id }).session(session)) throw httpError('Không có quyền trả lời lớp này', 403);
    question.teacherAnswer = answer; question.status = 'ANSWERED'; question.answeredById = req.user.id; question.answeredAt = new Date();
    await question.save({ session });
    await M.Notification.create([{ userId: question.studentId, title: 'Giảng viên đã trả lời câu hỏi', message: question.questionTitle, type: 'SYSTEM' }], { session });
    return plain(question);
  });
  successResponse(res, result, 'Đã gửi câu trả lời');
}));
module.exports = router;
