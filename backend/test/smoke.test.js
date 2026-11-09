// Smoke test toàn hệ thống trên dữ liệu seed: mọi endpoint chính của 5 actor phải trả về không lỗi 5xx.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret';
process.env.VIETQR_ACCOUNT_NO = 'TEST123';
process.env.SEPAY_BANK_NAME = 'TestBank';
process.env.VIETQR_BANK_ID = 'TEST';
process.env.VIETQR_ACCOUNT_NAME = 'TEST EMS';
const bcrypt = require('bcryptjs');
const { startMongo, stopMongo } = require('./helpers/mongo');
const app = require('../src/app');
const M = require('../src/models');
const { buildSeed } = require('../scripts/seed');

let server, base, seed;
before(async () => {
  await startMongo();
  seed = buildSeed({ passwordHash: await bcrypt.hash('password123', 4), now: new Date(Date.UTC(2026, 10, 4)) });
  const map = { users: M.User, courses: M.Course, classes: M.Class, schedules: M.Schedule, enrollments: M.Enrollment, grades: M.Grade, tuition_invoices: M.TuitionInvoice, tuition_payments: M.TuitionPayment, notifications: M.Notification };
  for (const [k, rows] of Object.entries(seed.data)) await map[k].insertMany(rows);
  server = app.listen(0, '127.0.0.1');
  await new Promise(r => server.once('listening', r));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => { await new Promise(r => server.close(r)); await stopMongo(); });

const user = role => seed.data.users.find(u => u.role === role && (role !== 'STUDENT' || u.code === 'SE03002'));
const call = async (path, role, method = 'GET', body) => {
  const u = user(role);
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + jwt.sign({ id: u.id, role, code: u.code }, process.env.JWT_SECRET) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json() };
};

test('login works against seeded users and hides password hash', async () => {
  const res = await fetch(base + '/auth/login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'se03002@fpt.edu.vn', password: 'password123' }) });
  const body = await res.json();
  assert.equal(res.status, 200);
  assert.equal(body.data.user.role, 'STUDENT');
  assert.equal(JSON.stringify(body).includes('passwordHash'), false);
  const me = await call('/auth/me', 'STUDENT');
  assert.equal(me.body.data.code, 'SE03002');
  assert.equal(me.body.data.passwordHash, undefined);
});

test('every main GET endpoint responds without server errors for its role', async () => {
  const student = user('STUDENT'), teacher = user('TEACHER');
  const cls = seed.data.classes.find(c => c.teacherId === teacher.id && c.status === 'ONGOING');
  const checks = [
    ['ADMIN', '/students?page=1&pageSize=5&search=SE0'], ['ADMIN', `/students/${student.id}/profile-360`], ['ADMIN', '/teachers'], ['ADMIN', '/courses'],
    ['ADMIN', '/classes?semester=FA26'], ['ADMIN', `/classes/${cls.id}`], ['ADMIN', '/curriculum'], ['ADMIN', `/curriculum/student/${student.id}`],
    ['ADMIN', '/curriculum/term-overview'], ['ADMIN', `/curriculum/eligible-students/${cls.id}`], ['ADMIN', '/analytics/admin-overview'], ['ADMIN', '/requests'],
    ['TEACHER', '/schedules/my-schedule'], ['TEACHER', `/classes/${cls.id}/attendances?date=2026-11-04`], ['TEACHER', `/classes/${cls.id}/attendance-summary`],
    ['TEACHER', `/classes/${cls.id}/grades`], ['TEACHER', `/classes/${cls.id}/assignments`],
    ['STUDENT', '/schedules/my-schedule'], ['STUDENT', '/students/my-grades'], ['STUDENT', '/attendances/my-report'], ['STUDENT', '/curriculum/my-progress'],
    ['STUDENT', '/analytics/student-overview'], ['STUDENT', '/notifications'], ['STUDENT', '/tuition-invoices'],
    ['ACCOUNTANT', '/tuition-invoices?status=UNPAID,PARTIAL&semester=FA26&search=SE0'], ['ACCOUNTANT', '/tuition-invoices?overdue=true'], ['ACCOUNTANT', '/analytics/tuition-revenue?year=2026'],
    ['ACCOUNTANT', '/accountant/summary?from=2026-01-01&to=2026-12-31'], ['ACCOUNTANT', '/accountant/discrepancies'], ['ACCOUNTANT', '/accountant/refunds'], ['ACCOUNTANT', '/accountant/audit-logs']
  ];
  for (const [role, path] of checks) {
    const r = await call(path, role);
    assert.equal(r.status, 200, `${role} ${path}: ${r.status} ${r.body.message}`);
  }
});

test('seeded data is consistent through the API: term placement, schedules, debts', async () => {
  const progress = await call('/curriculum/my-progress', 'STUDENT');
  assert.equal(progress.body.data.currentTerm, 3);
  assert.deepEqual(progress.body.data.terms.slice(0, 3).map(t => t.status), ['COMPLETED', 'COMPLETED', 'CURRENT']);
  const schedule = await call('/schedules/my-schedule?semester=FA26', 'STUDENT');
  assert.equal(schedule.body.data.length, 4); // 4 môn kỳ 3
  const invoices = await call('/tuition-invoices', 'STUDENT');
  assert.equal(invoices.body.data.summary.UNPAID, 4);
  assert.equal(invoices.body.data.summary.PAID, 8);
  const overview = await call('/curriculum/term-overview', 'ADMIN');
  assert.deepEqual(overview.body.data.terms.map(t => t.studentCount), Array(9).fill(3));
  const revenue = await call('/analytics/tuition-revenue?year=2026', 'ACCOUNTANT');
  assert.ok(revenue.body.data.kpi.debtAmount > 0);
});

test('core write flows still work and teachers cannot edit course grades', async () => {
  const course = seed.data.courses[0];
  const created = await call('/classes', 'ADMIN', 'POST', { classCode: 'TEST-NEW', courseId: course.id, semester: 'SP27' });
  assert.equal(created.status, 201, created.body.message);
  assert.equal((await call(`/classes/${created.body.data.id}/schedules`, 'ADMIN', 'POST', { dayOfWeek: 2, shift: 3, room: 'X1' })).status, 201);
  const ongoing = seed.data.classes.find(c => c.semester === 'FA26');
  const sched = seed.data.schedules.find(s => s.classId === ongoing.id);
  const other = await call('/classes', 'ADMIN', 'POST', { classCode: 'TEST-CONFLICT', courseId: course.id, semester: 'FA26' });
  assert.equal((await call(`/classes/${other.body.data.id}/schedules`, 'ADMIN', 'POST', { dayOfWeek: sched.dayOfWeek, shift: sched.shift, room: sched.room })).status, 409);

  const teacher = user('TEACHER');
  const cls = seed.data.classes.find(c => c.teacherId === teacher.id && c.status === 'ONGOING');
  const roster = await call(`/classes/${cls.id}/grades`, 'TEACHER');
  const first = roster.body.data.grades[0];
  assert.equal((await call(`/classes/${cls.id}/attendances`, 'TEACHER', 'POST', { sessionDate: '2026-11-04', records: [{ studentId: first.studentId, status: 'LATE' }] })).status, 200);
  assert.equal((await call(`/classes/${cls.id}/grades`, 'TEACHER', 'PUT', {
    gradesList: [{ enrollmentId: first.enrollmentId, attendanceScore: 9, midtermScore: 7, finalScore: 8 }]
  })).status, 403);

  const n = await call('/notifications', 'STUDENT');
  assert.equal((await call(`/notifications/${n.body.data.notifications[0].id}/read`, 'STUDENT', 'PATCH')).status, 200);
  assert.equal((await call('/notifications/read-all', 'STUDENT', 'PATCH')).status, 200);
  const req = await call('/requests', 'STUDENT', 'POST', { requestType: 'CONFIRMATION', reason: 'Xin giấy xác nhận' });
  assert.equal(req.status, 201, req.body.message);
  assert.equal((await call(`/requests/${req.body.data.id}/review`, 'ADMIN', 'PATCH', { status: 'APPROVED' })).status, 200);
  assert.equal((await call('/courses', 'ADMIN', 'POST', { courseCode: 'new101', name: 'New', credits: 3 })).status, 201);
  const reminders = await call('/tuition-invoices/reminders', 'ACCOUNTANT', 'POST', { onlyOverdue: true });
  assert.equal(reminders.status, 201, reminders.body.message);
  assert.equal(reminders.body.data.studentCount, 9); // SV đầu tiên của mỗi khóa có hóa đơn quá hạn
});
