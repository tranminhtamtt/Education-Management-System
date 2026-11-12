const router = require('express').Router();
const authenticateJWT = require('../../middlewares/auth.middleware');
const authorizeRoles = require('../../middlewares/role.middleware');
const roles = (...allowed) => [authenticateJWT, authorizeRoles(...allowed)];
const { withTransaction, lockDoc } = require('../../config/db');
const M = require('../../models');
const { plain, like, httpError } = require('../../utils/query');
const { successResponse, errorResponse } = require('../../utils/formatResponse');
const { teacherQuestionScope } = require('./questionScope');

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

// =========================================================================
// KHÁM PHÁ KHÓA HỌC THEO MÔN / CHỨNG CHỈ
// Một môn FPT (giữ kỳ trong khung) hoặc một chứng chỉ có thể có nhiều khóa học.
// =========================================================================
const CATEGORIES = ['FPT_SUBJECT', 'CERTIFICATE'];

// Thống kê gọn cho từng môn: số khóa, giá thấp nhất, hình thức đang có.
async function subjectSummaries(subjectIds) {
  const rows = await M.Course.aggregate([
    { $match: { subjectId: { $in: subjectIds }, status: 'ACTIVE' } },
    { $group: { _id: '$subjectId', courseCount: { $sum: 1 }, minPrice: { $min: '$baseTuitionFee' }, modes: { $addToSet: '$deliveryMode' } } }
  ]);
  return new Map(rows.map(r => [r._id, { courseCount: r.courseCount, minPrice: r.minPrice, modes: r.modes.sort() }]));
}

router.get('/subjects', roles('STUDENT', 'ADMIN'), endpoint(async (req, res) => {
  const filter = { status: 'ACTIVE' };
  if (req.query.category) {
    if (!CATEGORIES.includes(req.query.category)) throw httpError('Danh mục không hợp lệ');
    filter.category = req.query.category;
  }
  if (req.query.search) filter.$or = [{ name: like(req.query.search) }, { code: like(req.query.search) }];
  const subjects = await M.Subject.find(filter).sort({ term: 1, code: 1 });
  const stats = await subjectSummaries(subjects.map(s => s.id));
  successResponse(res, subjects.map(s => ({
    ...plain(s),
    ...(stats.get(s.id) || { courseCount: 0, minPrice: null, modes: [] })
  })));
}));

router.get('/subjects/:id', roles('STUDENT', 'ADMIN'), endpoint(async (req, res) => {
  const subject = await M.Subject.findOne({ id: id(req.params.id), status: 'ACTIVE' });
  if (!subject) throw httpError('Không tìm thấy môn học / chứng chỉ', 404);
  const courses = await M.Course.find({ subjectId: subject.id, status: 'ACTIVE' })
    .sort({ deliveryMode: 1, baseTuitionFee: 1 })
    .populate({ path: 'instructor', select: 'id fullName teacherProfile' });
  const courseIds = courses.map(c => c.id);
  const [lessonCounts, openClasses] = await Promise.all([
    M.CourseLesson.aggregate([{ $match: { courseId: { $in: courseIds } } }, { $group: { _id: '$courseId', n: { $sum: 1 }, minutes: { $sum: '$durationMinutes' } } }]),
    M.Class.find({ courseId: { $in: courseIds }, status: { $in: ['UPCOMING', 'ONGOING'] }, semester: { $ne: 'SELF_PACED' } })
      .select('id courseId teacherId').populate({ path: 'teacher', select: 'id fullName' })
  ]);
  const lessonMap = new Map(lessonCounts.map(r => [r._id, r]));
  // Các lớp Live đang mở và giảng viên dạy từng lớp (một khóa có thể có nhiều giảng viên).
  const classMap = new Map();
  for (const c of openClasses) {
    const entry = classMap.get(c.courseId) || { n: 0, teachers: new Map() };
    entry.n++;
    if (c.teacher) entry.teachers.set(c.teacher.id, c.teacher.fullName);
    classMap.set(c.courseId, entry);
  }
  // Khóa học viên đã mua (để hiện "Đã đăng ký" thay vì nút mua).
  let ownedCourseIds = new Set();
  if (req.user.role === 'STUDENT') {
    const mine = await M.Enrollment.find({ studentId: req.user.id, status: { $in: ['ACTIVE', 'PENDING_PAYMENT'] } }).populate({ path: 'class', select: 'courseId' });
    ownedCourseIds = new Set(mine.map(e => e.class?.courseId).filter(Boolean));
  }
  successResponse(res, {
    ...plain(subject),
    courses: courses.map(c => ({
      ...plain(c),
      lessonCount: lessonMap.get(c.id)?.n || 0,
      totalMinutes: lessonMap.get(c.id)?.minutes || 0,
      openClassCount: classMap.get(c.id)?.n || 0,
      teachers: c.deliveryMode === 'LIVE_ONLINE'
        ? [...(classMap.get(c.id)?.teachers || new Map()).entries()].map(([teacherId, fullName]) => ({ id: teacherId, fullName }))
        : (c.instructor ? [{ id: c.instructor.id, fullName: c.instructor.fullName }] : []),
      isOwned: ownedCourseIds.has(c.id)
    }))
  });
}));

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
    .populate([{ path: 'instructor', select: 'id fullName teacherProfile' }, { path: 'subject', select: 'id code name category term' }]);
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
  // Trung tâm khóa học: không xét điểm số / GPA. Dashboard chỉ theo dõi việc học.
  const enrollments = await M.Enrollment.find({ studentId: req.user.id, status: { $in: ['ACTIVE', 'PENDING_PAYMENT'] } }).populate(populated);
  const all = enrollments.filter(e => e.class?.course);
  const active = all.filter(e => e.status === 'ACTIVE');
  const classIds = active.filter(e => e.class.status !== 'COMPLETED').map(e => e.classId);
  const assignments = await M.Assignment.find({ classId: { $in: classIds }, dueDate: { $gte: new Date() } }).sort({ dueDate: 1 });
  const submitted = await M.Submission.find({ studentId: req.user.id, assignmentId: { $in: assignments.map(a => a.id) } }).select('assignmentId');
  const recorded = active.filter(e => e.class.course.deliveryMode === 'RECORDED');
  const liveWeeklySessions = active
    .filter(e => e.class.course.deliveryMode === 'LIVE_ONLINE' && e.class.status === 'ONGOING')
    .reduce((sum, e) => sum + (e.class.schedules?.length || 0), 0);
  const pendingQuestions = await M.CourseQuestion.countDocuments({ studentId: req.user.id, status: 'PENDING' });
  successResponse(res, {
    enrolledClassesCount: classIds.length,
    pendingPaymentCount: all.filter(e => e.status === 'PENDING_PAYMENT').length,
    averageProgress: recorded.length ? Math.round(recorded.reduce((sum, e) => sum + (e.progressPercent || 0), 0) / recorded.length) : 0,
    completedVideoCourses: recorded.filter(e => e.progressPercent >= 100).length,
    liveWeeklySessions,
    pendingQuestions,
    upcomingDeadlines: assignments.filter(a => !submitted.some(s => s.assignmentId === a.id)).slice(0, 5).map(a => ({ ...plain(a), isSubmitted: false }))
  });
}));

// Giảng viên mà học viên được phép hỏi: chỉ giảng viên đang dạy khóa học viên đã mở khóa.
// Lớp Live → giảng viên của lớp; khóa video → giảng viên phụ trách khóa.
async function teacherOf(classItem) {
  const course = classItem.course || await M.Course.findOne({ id: classItem.courseId });
  if (course?.deliveryMode === 'RECORDED' && course.instructorId) return course.instructorId;
  return classItem.teacherId || null;
}

router.get('/questions/my-teachers', roles('STUDENT'), endpoint(async (req, res) => {
  const enrollments = await M.Enrollment.find({ studentId: req.user.id, status: 'ACTIVE' })
    .populate({ path: 'class', populate: ['course', { path: 'teacher', select: 'id fullName' }] });
  const rows = [];
  for (const e of enrollments) {
    if (!e.class?.course) continue;
    const teacherId = await teacherOf(e.class);
    if (!teacherId) continue;
    const teacher = e.class.teacher?.id === teacherId ? e.class.teacher : await M.User.findOne({ id: teacherId, role: 'TEACHER' }).select('id fullName');
    if (!teacher) continue;
    rows.push({ classId: e.classId, classCode: e.class.classCode, courseName: e.class.course.name, deliveryMode: e.class.course.deliveryMode, teacherId: teacher.id, teacherName: teacher.fullName });
  }
  successResponse(res, rows);
}));

router.get('/questions', roles('STUDENT', 'TEACHER', 'ADMIN'), endpoint(async (req, res) => {
  const filter = {};
  if (req.query.status) {
    const status = String(req.query.status).toUpperCase();
    if (!['PENDING', 'ANSWERED', 'RESOLVED'].includes(status)) throw httpError('Trạng thái Q&A không hợp lệ');
    filter.status = status;
  }
  if (req.user.role === 'STUDENT') filter.studentId = req.user.id;
  if (req.user.role === 'TEACHER') {
    Object.assign(filter, await teacherQuestionScope(req.user.id));
  }
  if (req.query.classId) {
    const classId = id(req.query.classId);
    if (req.user.role === 'TEACHER' && !await M.Class.exists({ id: classId, teacherId: req.user.id }) && !await M.CourseQuestion.exists({ classId, teacherId: req.user.id })) {
      throw httpError('Không có quyền xem lớp', 403);
    }
    filter.classId = classId;
  }
  const rows = await M.CourseQuestion.find(filter).sort({ createdAt: -1 }).limit(200)
    .populate([
      { path: 'class', select: 'id classCode courseId', populate: { path: 'course', select: 'id courseCode name' } },
      { path: 'student', select: 'id fullName code' },
      { path: 'teacher', select: 'id fullName' },
      { path: 'lesson', select: 'id title courseId', populate: { path: 'course', select: 'id courseCode name' } },
      { path: 'answeredBy', select: 'id fullName' }
    ]);
  successResponse(res, rows.map(plain));
}));

router.post('/questions', roles('STUDENT'), endpoint(async (req, res) => {
  const classId = req.body.classId == null ? null : id(req.body.classId);
  const lessonId = req.body.lessonId == null ? null : id(req.body.lessonId);
  if (!classId && !lessonId) throw httpError('Câu hỏi cần gắn với lớp hoặc bài giảng');

  const lesson = lessonId ? await M.CourseLesson.findOne({ id: lessonId }) : null;
  if (lessonId && !lesson) throw httpError('Không tìm thấy bài giảng', 404);
  const candidateClasses = classId ? [classId] : await M.Class.find({ courseId: lesson.courseId }).distinct('id');
  const enrollment = await M.Enrollment.findOne({
    classId: { $in: candidateClasses }, studentId: req.user.id, status: 'ACTIVE'
  }).sort({ enrolledAt: -1 }).populate({ path: 'class', populate: 'course' });
  const classItem = enrollment?.class;
  if (!classItem) throw httpError('Bạn chưa có quyền học khóa này', 403);
  if (lesson && lesson.courseId !== classItem.courseId) throw httpError('Bài học không thuộc khóa học');

  const teacherId = await teacherOf(classItem);
  if (!teacherId) throw httpError('Khóa học chưa có giảng viên phụ trách để nhận câu hỏi', 409);
  const values = {
    classId: classItem.id, studentId: req.user.id, teacherId, lessonId,
    attachmentUrl: optionalUrl(req.body.attachmentUrl),
    questionTitle: text(req.body.questionTitle, 200), questionContent: text(req.body.questionContent, 10000)
  };
  const question = await withTransaction(async session => {
    const [created] = await M.CourseQuestion.create([values], { session });
    await M.Notification.create([{
      userId: teacherId, title: 'Học viên gửi câu hỏi mới', message: values.questionTitle, type: 'QA'
    }], { session });
    return created;
  });
  successResponse(res, plain(question), 'Đã gửi câu hỏi tới giảng viên', 201);
}));

router.patch('/questions/:id/answer', roles('TEACHER'), endpoint(async (req, res) => {
  const answer = text(req.body.teacherAnswer, 10000);
  const result = await withTransaction(async session => {
    const question = await M.CourseQuestion.findOne({ id: id(req.params.id) }).session(session);
    if (!question) throw httpError('Không tìm thấy câu hỏi', 404);
    const scope = await teacherQuestionScope(req.user.id, session);
    if (!await M.CourseQuestion.exists({ id: question.id, ...scope }).session(session)) {
      throw httpError('Chỉ giảng viên phụ trách khóa học mới được trả lời câu hỏi này', 403);
    }
    if (question.status === 'RESOLVED') throw httpError('Câu hỏi đã được đóng', 409);
    question.teacherAnswer = answer; question.status = 'ANSWERED'; question.answeredById = req.user.id; question.answeredAt = new Date();
    await question.save({ session });
    await M.Notification.create([{ userId: question.studentId, title: 'Giảng viên đã trả lời câu hỏi', message: question.questionTitle, type: 'QA' }], { session });
    return plain(question);
  });
  successResponse(res, result, 'Đã gửi câu trả lời');
}));
module.exports = router;
