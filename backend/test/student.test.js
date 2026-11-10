const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'student-test-secret';
process.env.VIETQR_BANK_ID = 'TEST';
process.env.VIETQR_ACCOUNT_NO = 'TEST123';
process.env.VIETQR_ACCOUNT_NAME = 'EMS TEST';
process.env.SEPAY_BANK_NAME = 'TestBank';
const { startMongo, stopMongo, resetMongo } = require('./helpers/mongo');
const M = require('../src/models');
const app = require('../src/app');
const payment = require('../src/modules/accountant/payment.service');
const { migrateStudentData } = require('../scripts/migrate-student');
const { mongoose } = require('../src/config/db');
let server, base;
before(async () => {
  await startMongo();
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { if (server) await new Promise(resolve => server.close(resolve)); await stopMongo(); });
const call = async (path, userId = 1, method = 'GET', body) => {
  const role = { 1: 'STUDENT', 2: 'STUDENT', 3: 'TEACHER', 4: 'TEACHER', 5: 'ADMIN' }[userId];
  const response = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(userId ? { Authorization: `Bearer ${jwt.sign({ id: userId, role }, process.env.JWT_SECRET)}` } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: response.status, body: await response.json() };
};
beforeEach(async () => {
  await resetMongo();
  await M.User.create([1, 2, 3, 4, 5].map(id => ({ id, code: `U${id}`, email: `u${id}@test.local`, fullName: `User ${id}`, passwordHash: 'hash', role: id <= 2 ? 'STUDENT' : id === 5 ? 'ADMIN' : 'TEACHER' })));
  await M.Course.create([
    { id: 1, courseCode: 'VIDEO', name: 'Recorded', deliveryMode: 'RECORDED', baseTuitionFee: 1000, instructorId: 3 },
    { id: 2, courseCode: 'LIVE', name: 'Live', deliveryMode: 'LIVE_ONLINE', baseTuitionFee: 1000, totalSessions: 10 },
    { id: 3, courseCode: 'LIVE2', name: 'Live 2', deliveryMode: 'LIVE_ONLINE', baseTuitionFee: 1000 },
    { id: 4, courseCode: 'FREE', name: 'Free', deliveryMode: 'RECORDED', category: 'CERTIFICATE', baseTuitionFee: 0 }
  ]);
  await M.Class.create([
    { id: 1, classCode: 'LIVE-1', courseId: 2, teacherId: 3, semester: 'FA26', maxStudents: 1, status: 'ONGOING', meetUrl: 'https://meet.google.com/test' },
    { id: 2, classCode: 'LIVE-2', courseId: 3, teacherId: 4, semester: 'FA26', status: 'ONGOING' }
  ]);
  await M.Schedule.create([1, 2].map(classId => ({ classId, dayOfWeek: 2, shift: 1, startTime: '07:30', endTime: '09:50', room: `ROOM${classId}` })));
  await M.CourseLesson.create([
    { id: 1, courseId: 1, orderIndex: 1, title: 'Lesson 1', videoUrl: 'https://example.com/private.mp4', materialUrl: 'https://example.com/private.pdf' },
    { id: 2, courseId: 1, orderIndex: 2, title: 'Lesson 2', isPreview: true, videoUrl: 'https://example.com/preview.mp4' },
    { id: 3, courseId: 4, orderIndex: 1, title: 'Free lesson' }
  ]);
});

test('catalog filters and previews never expose paid lesson URLs or live room links', async () => {
  assert.equal((await call('/courses/catalog', 0)).status, 401);
  assert.equal((await call('/courses/catalog', 3)).status, 403);
  const filtered = await call('/courses/catalog?category=CERTIFICATE&deliveryMode=RECORDED');
  assert.equal(filtered.body.data.total, 1);
  const detail = (await call('/courses/catalog/1')).body.data;
  assert.equal(detail.lessons[0].videoUrl, null);
  assert.equal(detail.lessons[0].materialUrl, undefined);
  assert.match(detail.lessons[1].videoUrl, /preview/);
  assert.equal((await call('/courses/catalog/2')).body.data.classes[0].meetUrl, undefined);
  assert.equal((await call('/courses/catalog?category=INVALID')).status, 400);
  assert.equal((await call('/courses/catalog/nope')).status, 400);
  assert.equal((await call('/auth/login', 0, 'POST', {})).status, 400);
});

test('purchase is idempotent and payment only unlocks after the full verified amount', async () => {
  const purchases = await Promise.all([call('/courses/1/purchase', 1, 'POST', {}), call('/courses/1/purchase', 1, 'POST', {})]);
  assert.ok(purchases.every(r => [200, 201].includes(r.status)), JSON.stringify(purchases));
  assert.equal(await M.Enrollment.countDocuments(), 1);
  assert.equal(await M.TuitionInvoice.countDocuments(), 1);
  const enrollment = purchases[0].body.data.enrollment, invoice = purchases[0].body.data.invoice;
  assert.equal(enrollment.status, 'PENDING_PAYMENT');
  assert.equal((await call(`/my-courses/${enrollment.id}`)).status, 404);
  const order = await payment.createOrder(invoice.id, { id: 1, role: 'STUDENT' });
  const hook = (id, amount) => ({ id, transferAmount: amount, transferType: 'in', accountNumber: 'TEST123', gateway: 'TestBank', transactionDate: '2026-11-10 10:00:00', referenceCode: `REF${id}`, content: order.code });
  await payment.receiveWebhook(hook(1, 400));
  assert.equal((await M.Enrollment.findOne({ id: enrollment.id })).status, 'PENDING_PAYMENT');
  await payment.receiveWebhook(hook(2, 600));
  await payment.receiveWebhook(hook(2, 600));
  assert.equal((await M.Enrollment.findOne({ id: enrollment.id })).status, 'ACTIVE');
  assert.equal((await call(`/my-courses/${enrollment.id}`)).status, 200);
  assert.equal((await call(`/my-courses/${enrollment.id}`, 2)).status, 404);
});

test('live seats and overlapping schedules include pending purchases, with rollback on rejection', async () => {
  assert.equal((await call('/courses/2/purchase', 1, 'POST', { classId: 1 })).status, 201);
  assert.equal((await call('/courses/2/purchase', 2, 'POST', { classId: 1 })).status, 409);
  assert.equal((await call('/courses/3/purchase', 1, 'POST', { classId: 2 })).status, 409);
  assert.equal(await M.Enrollment.countDocuments(), 1);
  assert.equal(await M.TuitionInvoice.countDocuments(), 1);
  assert.equal((await call('/courses/2/purchase', 2, 'POST', { classId: 2 })).status, 404);
});

test('progress is isolated, idempotent under concurrency, and reaches exactly 100%', async () => {
  const purchase = await call('/courses/4/purchase', 1, 'POST', {});
  const enrollment = purchase.body.data.enrollment;
  assert.equal(enrollment.status, 'ACTIVE');
  assert.equal((await call('/lessons/3/complete', 2, 'POST', { enrollmentId: enrollment.id })).status, 403);
  assert.equal((await call('/lessons/1/complete', 1, 'POST', { enrollmentId: enrollment.id })).status, 404);
  const results = await Promise.all(Array.from({ length: 3 }, () => call('/lessons/3/complete', 1, 'POST', { enrollmentId: enrollment.id })));
  assert.ok(results.every(r => r.status === 200), JSON.stringify(results));
  assert.equal(await M.LessonProgress.countDocuments(), 1);
  assert.equal((await M.Enrollment.findOne({ id: enrollment.id })).progressPercent, 100);
});

test('Q&A restricts student data and teacher ownership; an answer creates a notification', async () => {
  const purchase = await call('/courses/4/purchase', 1, 'POST', {});
  const classId = purchase.body.data.enrollment.classId;
  await M.Class.updateOne({ id: classId }, { $set: { teacherId: 3 } });
  const question = await call('/questions', 1, 'POST', { classId, lessonId: 3, questionTitle: 'Help', questionContent: 'Explain this lesson' });
  assert.equal(question.status, 201);
  assert.equal((await call('/questions', 2)).body.data.length, 0);
  assert.equal((await call(`/questions?classId=${classId}`, 4)).status, 403);
  assert.equal((await call('/questions', 2, 'POST', { classId, questionTitle: 'Bad', questionContent: 'Not enrolled' })).status, 403);
  const questionId = question.body.data.id;
  assert.equal((await call(`/questions/${questionId}/answer`, 1, 'PATCH', { teacherAnswer: 'No' })).status, 403);
  assert.equal((await call(`/questions/${questionId}/answer`, 4, 'PATCH', { teacherAnswer: 'No' })).status, 403);
  assert.equal((await call(`/questions/${questionId}/answer`, 3, 'PATCH', { teacherAnswer: 'Here is the answer' })).status, 200);
  assert.equal(await M.Notification.countDocuments({ userId: 1 }), 1);
  assert.equal((await call('/questions')).body.data[0].status, 'ANSWERED');
});

test('submission accepts links, records lateness, invalidates previous scores, and protects class rosters', async () => {
  await M.Enrollment.create({ id: 1, classId: 1, studentId: 1 });
  const assignment = await M.Assignment.create({ classId: 1, title: 'Work', dueDate: new Date('2020-01-01') });
  assert.equal((await call(`/assignments/${assignment.id}/submit`, 2, 'POST', { link: 'https://github.com/a/b' })).status, 403);
  assert.equal((await call(`/assignments/${assignment.id}/submit`, 1, 'POST', { link: 'javascript:alert(1)' })).status, 400);
  const submitted = await call(`/assignments/${assignment.id}/submit`, 1, 'POST', { link: 'https://github.com/a/b', content: 'My work' });
  assert.equal(submitted.status, 200);
  assert.equal(submitted.body.data.status, 'LATE_SUBMITTED');
  await M.Submission.updateOne({ id: submitted.body.data.id }, { $set: { score: 8, teacherFeedback: 'Old work' } });
  const revised = await call(`/assignments/${assignment.id}/submissions`, 1, 'POST', { link: 'https://github.com/a/c' });
  assert.equal(revised.body.data.score, null);
  assert.equal(revised.body.data.teacherFeedback, null);
  assert.equal((await call('/classes/1', 2)).status, 403);
  assert.equal((await call('/classes/1')).body.data.enrollments.length, 1);
});

test('schedule dates follow requested week and attendance uses the actual course session count', async () => {
  await M.Enrollment.create({ id: 1, classId: 1, studentId: 1 });
  await M.Attendance.create({ classId: 1, studentId: 1, sessionDate: new Date('2026-11-02'), status: 'ABSENT_UNEXCUSED' });
  const schedule = (await call('/schedules/my-schedule?weekStart=2027-01-06')).body.data[0];
  assert.equal(schedule.week1Session.date, '2027-01-04');
  assert.equal(schedule.week2Session.date, '2027-01-11');
  assert.equal(schedule.meetUrl, 'https://meet.google.com/test');
  assert.equal((await call('/schedules/my-schedule?weekStart=invalid')).status, 400);
  const report = (await call('/attendances/my-report?weekStart=2027-01-04')).body.data[0];
  assert.equal(report.totalSessions, 10);
  assert.equal(report.absentRate, 10);
  assert.ok(report.sessions.some(s => s.sessionDate === '2026-11-02' && s.status === 'ABSENT_UNEXCUSED'));
});

test('migration preserves legacy records and finances and can run twice without changes', async () => {
  const db = mongoose.connection.db;
  await db.collection('courses').insertOne({ id: 100, courseCode: 'LEGACY', name: 'Legacy' });
  await db.collection('enrollments').insertOne({ id: 100, classId: 1, studentId: 2, status: 'ACTIVE' });
  const before = await M.Enrollment.countDocuments();
  await migrateStudentData(db);
  const second = await migrateStudentData(db);
  assert.deepEqual(second, { courses: 0, classes: 0, enrollments: 0 });
  assert.equal(await M.Enrollment.countDocuments(), before);
  const legacy = await db.collection('courses').findOne({ id: 100 });
  assert.equal(legacy.deliveryMode, 'LIVE_ONLINE');
  assert.equal((await M.Enrollment.findOne({ id: 100 })).status, 'ACTIVE');
  assert.equal(await M.TuitionPayment.countDocuments(), 0);
});

test('lesson publishing validates ownership and updates the progress denominator', async () => {
  const purchase = await call('/courses/4/purchase', 1, 'POST', {});
  const enrollmentId = purchase.body.data.enrollment.id;
  await call('/lessons/3/complete', 1, 'POST', { enrollmentId });
  const lesson = { title: 'New lesson', orderIndex: 2, videoUrl: 'https://example.com/new.mp4' };
  assert.equal((await call('/courses/4/lessons', 3, 'POST', lesson)).status, 403);
  assert.equal((await call('/courses/4/lessons', 5, 'POST', { ...lesson, videoUrl: 'javascript:alert(1)' })).status, 400);
  assert.equal((await call('/courses/4/lessons', 5, 'POST', lesson)).status, 200);
  assert.equal((await M.Enrollment.findOne({ id: enrollmentId })).progressPercent, 50);
  assert.equal((await call('/courses/4/lessons', 5, 'POST', { ...lesson, title: 'Updated lesson' })).status, 200);
  assert.equal(await M.CourseLesson.countDocuments({ courseId: 4 }), 2);
  assert.equal((await call('/courses/4/lessons', 1)).status, 403);
});
