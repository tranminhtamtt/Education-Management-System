// Kiểm thử mô hình Trung tâm khóa học: Môn/Chứng chỉ → nhiều Khóa học, Hỏi đáp đúng giảng viên, chuyên cần gọn.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'course-center-test-secret';
const { startMongo, stopMongo } = require('./helpers/mongo');
const M = require('../src/models');
const app = require('../src/app');
const { buildCourseCenterSeed, insertSeed } = require('../scripts/course-center-seed');
const { SE_CURRICULUM } = require('../src/modules/curriculum/curriculumData');

const NOW = new Date('2026-11-11T03:00:00Z');
let server, base, seed;
const user = code => seed.data.users.find(u => u.code === code);
const call = async (path, code, method = 'GET', body) => {
  const u = user(code);
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign({ id: u.id, role: u.role }, process.env.JWT_SECRET) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
};

before(async () => {
  await startMongo();
  seed = buildCourseCenterSeed({ passwordHash: 'x', now: NOW });
  await insertSeed(seed);
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { await new Promise(r => server.close(r)); await stopMongo(); });

test('seed keeps every FPT subject with its curriculum term and adds certificates; each subject has several courses', () => {
  const { subjects, courses } = seed.data;
  for (const c of SE_CURRICULUM) {
    const s = subjects.find(x => x.code === c.courseCode);
    assert.ok(s, c.courseCode);
    assert.equal(s.term, c.term, c.courseCode);
    assert.equal(s.category, 'FPT_SUBJECT');
  }
  assert.deepEqual(subjects.filter(s => s.category === 'CERTIFICATE').map(s => s.code).sort(), ['AWS-CCP', 'CCNA', 'IELTS', 'JLPT-N3', 'TOEIC']);
  for (const s of subjects) assert.ok(courses.some(c => c.subjectId === s.id), `${s.code} có ít nhất 1 khóa`);
  for (const s of subjects) {
    const live = courses.filter(c => c.subjectId === s.id && c.deliveryMode === 'LIVE_ONLINE');
    assert.ok(live.length >= 1, `${s.code} có khóa Live`);
    for (const c of live) {
      const classes = seed.data.classes.filter(x => x.courseId === c.id && x.status === 'ONGOING');
      assert.ok(classes.length >= 1 && classes.every(x => x.teacherId), `${c.courseCode} có lớp đang học và có giảng viên`);
    }
  }
  const prfLive = courses.find(c => c.courseCode === 'PRF192-LIVE');
  assert.equal(new Set(seed.data.classes.filter(x => x.courseId === prfLive.id && x.status === 'ONGOING').map(x => x.teacherId)).size, 2, 'PRF192 Live có 2 lớp với 2 giảng viên');
  for (const code of ['PRF192', 'IELTS', 'CCNA']) {
    const s = subjects.find(x => x.code === code);
    const modes = new Set(courses.filter(c => c.subjectId === s.id).map(c => c.deliveryMode));
    assert.ok(modes.has('RECORDED') && modes.has('LIVE_ONLINE'), `${code} có cả khóa video và Live`);
  }
  assert.equal(seed.data.grades, undefined, 'không tạo bảng điểm');
});

test('seed live schedules never overlap for teachers, rooms or students in the same cohort', () => {
  const classById = new Map(seed.data.classes.map(c => [c.id, c]));
  const teacher = new Set(), room = new Set(), student = new Set();
  for (const s of seed.data.schedules) {
    const c = classById.get(s.classId);
    const t = `${c.semester}|${s.dayOfWeek}|${s.shift}|${c.teacherId}`, r = `${c.semester}|${s.dayOfWeek}|${s.shift}|${s.room}`;
    assert.ok(!teacher.has(t), t); assert.ok(!room.has(r), r);
    teacher.add(t); room.add(r);
  }
  for (const e of seed.data.enrollments) {
    for (const s of seed.data.schedules.filter(x => x.classId === e.classId)) {
      const k = `${e.studentId}|${classById.get(e.classId).semester}|${s.dayOfWeek}|${s.shift}`;
      assert.ok(!student.has(k), k); student.add(k);
    }
  }
  // Điểm danh chỉ có cho buổi đã diễn ra
  assert.ok(seed.data.attendances.every(a => a.sessionDate.toISOString().slice(0, 10) < '2026-11-11'));
});

test('catalog: subjects listed compactly by category; subject detail lists its courses with ownership', async () => {
  const fpt = await call('/subjects?category=FPT_SUBJECT', 'HE170009');
  assert.equal(fpt.status, 200);
  assert.equal(fpt.body.data.length, SE_CURRICULUM.length);
  assert.ok(fpt.body.data.every((s, i, arr) => i === 0 || arr[i - 1].term <= s.term), 'sắp theo kỳ');
  const prf = fpt.body.data.find(s => s.code === 'PRF192');
  assert.equal(prf.courseCount, 3);
  assert.deepEqual(prf.modes, ['LIVE_ONLINE', 'RECORDED']);
  const certs = await call('/subjects?category=CERTIFICATE', 'HE170009');
  assert.equal(certs.body.data.length, 5);
  assert.equal((await call('/subjects?category=BAD', 'HE170009')).status, 400);
  const detail = await call(`/subjects/${prf.id}`, 'HE170009');
  assert.equal(detail.body.data.courses.length, 3);
  assert.ok(detail.body.data.courses.find(c => c.courseCode === 'PRF192-LIVE').isOwned);
  assert.ok(!detail.body.data.courses.find(c => c.courseCode === 'PRF192-LIVE2').isOwned);
  assert.equal(detail.body.data.courses.find(c => c.courseCode === 'PRF192-VID').lessonCount, 6);
  assert.deepEqual(detail.body.data.courses.find(c => c.courseCode === 'PRF192-LIVE').teachers.map(t => t.fullName).sort(), ['ThS. Nguyễn Hoài Nam', 'ThS. Đỗ Quang Khải'].sort());
});

test('dashboard has no GPA / passed-course scoring', async () => {
  const res = await call('/analytics/student-overview', 'HE170001');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.gpa, undefined);
  assert.equal(res.body.data.passedCourses, undefined);
  assert.equal(res.body.data.pendingPaymentCount, 1);
});

test('attendance report only shows ongoing live classes with a simple attended count', async () => {
  const res = await call('/attendances/my-report', 'HE170005');
  assert.equal(res.status, 200);
  assert.equal(res.body.data.length, 1, 'chỉ lớp Live PRJ301, không có khóa video');
  const r = res.body.data[0];
  assert.equal(r.classCode, 'PRJ301-LIVE-K1');
  assert.equal(r.attendedSessions + r.missedSessions, r.recordedSessions);
  assert.equal(r.missedSessions, 1);
});

test('Q&A: students can only ask the teacher who teaches their unlocked course; only that teacher answers', async () => {
  const teachers = await call('/questions/my-teachers', 'HE170009');
  assert.equal(teachers.status, 200);
  const live = teachers.body.data.find(t => t.classCode === 'PRF192-LIVE-K1');
  assert.equal(live.teacherName, 'ThS. Nguyễn Hoài Nam');
  // Không được hỏi khóa chưa thanh toán (MAD101-VID đang chờ thanh toán)
  const pendingClass = seed.data.classes.find(c => c.classCode === `VIDEO-${seed.data.courses.find(x => x.courseCode === 'MAD101-VID').id}`);
  assert.equal((await call('/questions', 'HE170009', 'POST', { classId: pendingClass.id, questionTitle: 'Q', questionContent: 'Chưa mua' })).status, 403);
  const asked = await call('/questions', 'HE170009', 'POST', { classId: live.classId, questionTitle: 'Hỏi về vòng lặp', questionContent: 'Khi nào dùng do-while?' });
  assert.equal(asked.status, 201);
  assert.equal(asked.body.data.teacherId, live.teacherId);
  const qid = asked.body.data.id;
  assert.equal((await call(`/questions/${qid}/answer`, 'GV005', 'PATCH', { teacherAnswer: 'Không phải lớp tôi' })).status, 403);
  assert.equal((await call(`/questions/${qid}/answer`, 'ADM001', 'PATCH', { teacherAnswer: 'Admin' })).status, 403);
  assert.ok((await call('/questions', 'GV005')).body.data.every(q => q.id !== qid), 'giảng viên khác không thấy câu hỏi');
  assert.equal((await call(`/questions/${qid}/answer`, 'GV001', 'PATCH', { teacherAnswer: 'Dùng khi cần chạy ít nhất 1 lần.' })).status, 200);
  const mine = (await call('/questions', 'HE170009')).body.data.find(q => q.id === qid);
  assert.equal(mine.status, 'ANSWERED');
  assert.equal(mine.teacher.fullName, 'ThS. Nguyễn Hoài Nam');
});
