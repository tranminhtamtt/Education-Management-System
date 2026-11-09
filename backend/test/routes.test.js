const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-only-secret';
process.env.SEPAY_WEBHOOK_API_KEY = 'test-webhook-key';
process.env.VIETQR_ACCOUNT_NO = 'TEST123';
process.env.SEPAY_BANK_NAME = 'TestBank';
process.env.VIETQR_BANK_ID = 'TEST';
process.env.VIETQR_ACCOUNT_NAME = 'TEST EMS';
delete process.env.SEPAY_API_TOKEN;
const { startMongo, stopMongo, resetMongo } = require('./helpers/mongo');
const app = require('../src/app');
const M = require('../src/models');

let server, base;
before(async () => {
  await startMongo();
  server = app.listen(0, '127.0.0.1');
  await new Promise(resolve => server.once('listening', resolve));
  base = `http://127.0.0.1:${server.address().port}/api/v1`;
});
after(async () => {
  await new Promise(resolve => server.close(resolve));
  await stopMongo();
});

const token = (role, id = 1) => 'Bearer ' + jwt.sign({ id, role }, process.env.JWT_SECRET);
const call = async (path, role, method = 'GET', body, headers = {}) => {
  const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json', ...(role ? { Authorization: token(...[].concat(role)) } : {}), ...headers }, ...(body ? { body: JSON.stringify(body) } : {}) });
  return { status: res.status, body: await res.json().catch(() => null) };
};

async function seedBasic() {
  await resetMongo();
  await M.User.create([
    { id: 1, code: 'ACC', email: 'acc@x', passwordHash: 'h', fullName: 'Acc', role: 'ACCOUNTANT' },
    { id: 2, code: 'ADM', email: 'adm@x', passwordHash: 'h', fullName: 'Adm', role: 'ADMIN' },
    { id: 10, code: 'SE01001', email: 's10@x', passwordHash: 'h', fullName: 'Student A', role: 'STUDENT', studentProfile: { enrollmentYear: 2026 } },
    { id: 11, code: 'SE01002', email: 's11@x', passwordHash: 'h', fullName: 'Student B', role: 'STUDENT', studentProfile: { enrollmentYear: 2026 } }
  ]);
  await M.Course.create([{ id: 1, courseCode: 'PRF192', name: 'PRF', credits: 3, baseTuitionFee: 1000 }, { id: 2, courseCode: 'PRO192', name: 'PRO', credits: 3, baseTuitionFee: 1000 }, { id: 3, courseCode: 'MAD101', name: 'MAD', credits: 3, baseTuitionFee: 1000 }]);
  await M.Class.create([
    { id: 1, classCode: 'PRF-1', courseId: 1, semester: 'FA26', status: 'ONGOING', maxStudents: 1 },
    { id: 2, classCode: 'PRO-1', courseId: 2, semester: 'FA26', status: 'ONGOING' },
    { id: 3, classCode: 'MAD-1', courseId: 3, semester: 'FA26', status: 'ONGOING' }
  ]);
}

test('accountant RBAC, webhook authentication, removal of manual "mark paid" endpoint', async () => {
  await seedBasic();
  assert.equal((await call('/accountant/transactions')).status, 401);
  for (const role of ['ADMIN', 'TEACHER', 'STUDENT']) assert.equal((await call('/accountant/transactions', role)).status, 403);
  assert.equal((await call('/accountant/transactions', 'ACCOUNTANT')).status, 200);
  assert.equal((await call('/payment-orders', 'TEACHER', 'POST', {})).status, 403);
  assert.equal((await call('/payment-orders', 'ACCOUNTANT', 'POST', {})).status, 400);
  assert.equal((await call('/payments/sepay/webhook', null, 'POST', {})).status, 401);
  assert.equal((await call('/payments/sepay/webhook', null, 'POST', {}, { Authorization: 'Apikey wrong-key-value' })).status, 401);
  assert.equal((await call('/tuition-invoices/1/pay', 'ACCOUNTANT', 'PATCH', { amountPaid: 1000 })).status, 404);
  assert.equal((await call('/accountant/reconcile', 'ACCOUNTANT', 'POST', { providerId: 1 })).status, 503);
});

test('enrollment via API creates grade + UNPAID invoice; curriculum rules enforced; force only bypasses prerequisites', async () => {
  await seedBasic();
  const ok = await call('/classes/1/enrollments', ['ADMIN', 2], 'POST', { studentId: 10 });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  assert.equal(ok.body.data.invoice.status, 'UNPAID');
  assert.equal(ok.body.data.invoice.amount, 1000);
  assert.equal((await call('/classes/1/enrollments', ['ADMIN', 2], 'POST', { studentId: 10 })).status, 400); // trùng
  assert.match((await call('/classes/1/enrollments', ['ADMIN', 2], 'POST', { studentId: 11 })).body.message, /sĩ số/); // đầy lớp
  const prereq = await call('/classes/2/enrollments', ['ADMIN', 2], 'POST', { studentId: 11 });
  assert.equal(prereq.status, 400);
  assert.equal(prereq.body.data.canForce, true); // frontend đọc data.canForce để hỏi đặc cách
  assert.equal((await call('/classes/2/enrollments', ['ADMIN', 2], 'POST', { studentId: 11, forceEnroll: true })).status, 201);
  const ahead = await call('/classes/3/enrollments', ['ADMIN', 2], 'POST', { studentId: 11 });
  assert.equal(ahead.status, 400); // MAD101 thuộc kỳ 2
  assert.match(ahead.body.message, /vượt kỳ/);
  const progress = await call('/curriculum/student/10', ['ADMIN', 2]);
  assert.equal(progress.body.data.currentTerm, 1);
  assert.equal(progress.body.data.allCourses.find(c => c.courseCode === 'PRF192').status, 'STUDYING');
  const overview = await call('/curriculum/term-overview', ['ADMIN', 2]);
  assert.equal(overview.body.data.terms[0].studentCount, 2);
});

test('student pays via SePay webhook end-to-end; student sees only own orders/invoices; reminders skip PAID', async () => {
  await seedBasic();
  await call('/classes/1/enrollments', ['ADMIN', 2], 'POST', { studentId: 10 });
  const invoiceId = (await M.TuitionInvoice.findOne({ studentId: 10 })).id;
  assert.equal((await call('/payment-orders', ['STUDENT', 11], 'POST', { invoiceId })).status, 403);
  const order = await call('/payment-orders', ['STUDENT', 10], 'POST', { invoiceId });
  assert.equal(order.status, 200, JSON.stringify(order.body));
  assert.equal((await call(`/payment-orders/${order.body.data.id}`, ['STUDENT', 11])).status, 403);

  const hook = { id: 555, transferAmount: 1000, transferType: 'in', accountNumber: 'TEST123', gateway: 'TestBank', transactionDate: '2026-11-04 09:00:00', referenceCode: 'FT555', content: `HP ${order.body.data.code}` };
  assert.equal((await call('/payments/sepay/webhook', null, 'POST', hook, { Authorization: 'Apikey test-webhook-key' })).status, 200);
  assert.equal((await call('/payments/sepay/webhook', null, 'POST', hook, { Authorization: 'Apikey test-webhook-key' })).body.data.duplicate, true);

  const status = await call(`/payment-orders/${order.body.data.id}`, ['STUDENT', 10]);
  assert.equal(status.body.data.invoiceStatus, 'PAID');
  const mine = await call('/tuition-invoices', ['STUDENT', 11]);
  assert.equal(mine.body.data.invoices.length, 0);

  const tx = await call('/accountant/transactions?search=SE01001', 'ACCOUNTANT');
  assert.equal(tx.body.data.total, 1);
  assert.equal(tx.body.data.items[0].invoice.student.code, 'SE01001');
  const detail = await call(`/accountant/transactions/${tx.body.data.items[0].id}`, 'ACCOUNTANT');
  assert.equal(detail.body.data.payload.referenceCode, 'FT555');

  assert.equal((await call('/tuition-invoices/reminders', 'ACCOUNTANT', 'POST', {})).status, 400); // chỉ còn hóa đơn PAID
  const summary = await call('/accountant/summary?year=2026', 'ACCOUNTANT');
  assert.equal(summary.body.data.collected, 1000);
  assert.equal(summary.body.data.outstanding, 0);
  assert.equal(summary.body.data.bankReceived, 1000);
});

test('refund lifecycle: cannot exceed unallocated amount, cannot complete twice, everything audited', async () => {
  await seedBasic();
  await M.PaymentTransaction.create({ id: 7, providerId: '7', amount: 1500, appliedAmount: 1000, status: 'DISCREPANCY', payload: {}, occurredAt: new Date() });
  const r = (path, method, body) => call('/accountant/refunds' + path, 'ACCOUNTANT', method, body);
  assert.equal((await r('', 'POST', { transactionId: 7, amount: 501, reason: 'Excess' })).status, 400);
  assert.equal((await r('', 'POST', { transactionId: 7, amount: 500, reason: 'Excess' })).status, 200);
  assert.equal((await r('', 'POST', { transactionId: 7, amount: 1, reason: 'Duplicate' })).status, 400);
  const id = (await M.RefundRequest.findOne()).id;
  assert.equal((await r(`/${id}`, 'PATCH', { status: 'COMPLETED', reference: 'test' })).status, 400);
  assert.equal((await r(`/${id}`, 'PATCH', { status: 'APPROVED' })).status, 200);
  assert.equal((await r(`/${id}`, 'PATCH', { status: 'COMPLETED' })).status, 400);
  assert.equal((await r(`/${id}`, 'PATCH', { status: 'COMPLETED', reference: 'TEST-REFUND-1' })).status, 200);
  assert.equal((await r(`/${id}`, 'PATCH', { status: 'COMPLETED', reference: 'TEST-REFUND-1' })).status, 400);
  assert.equal((await M.RefundRequest.findOne()).status, 'COMPLETED');
  assert.equal(await M.PaymentAuditLog.countDocuments({ action: { $in: ['REQUEST_REFUND', 'REFUND_APPROVED', 'REFUND_COMPLETED'] } }), 3);
});

test('reconciliation compares independent SePay evidence and never changes debt; recovery reuses verified bank data', async () => {
  await seedBasic();
  await M.PaymentTransaction.create({ id: 1, providerId: '1', reference: 'REF1', amount: 1000, payload: {}, occurredAt: new Date('2026-11-02T03:00:00Z') });
  const nativeFetch = global.fetch;
  process.env.SEPAY_API_TOKEN = 'test-only-token';
  const bankTx = (id, amount, ref) => ({ id: String(id), account_number: 'TEST123', bank_brand_name: 'TestBank', amount_in: `${amount}.00`, amount_out: '0', reference_number: ref, transaction_date: '2026-11-02 10:00:00', transaction_content: 'BANK CODE', code: null });
  global.fetch = async (url, opts) => {
    const u = String(url);
    if (u.startsWith('https://my.sepay.vn/userapi/transactions/details/')) return { ok: true, json: async () => ({ status: 200, transaction: bankTx(u.split('/').pop(), 1000, u.endsWith('/1') ? 'REF1' : 'REF2') }) };
    if (u.startsWith('https://my.sepay.vn/userapi/transactions/list')) return { ok: true, json: async () => ({ status: 200, transactions: [bankTx(1, 1000, 'REF1'), bankTx(2, 2000, 'REF2'), bankTx(3, 999, 'X')] }) };
    return nativeFetch(url, opts);
  };
  try {
    const one = await call('/accountant/reconcile', 'ACCOUNTANT', 'POST', { providerId: 1 });
    assert.equal(one.body.data.status, 'MATCHED');
    const range = await call('/accountant/reconcile-range', 'ACCOUNTANT', 'POST', { from: '2026-11-01', to: '2026-11-03' });
    assert.equal(range.status, 200, JSON.stringify(range.body));
    assert.deepEqual([range.body.data.summary.matched, range.body.data.summary.unmatched], [1, 2]);
    assert.equal((await M.TuitionInvoice.countDocuments({ paidAmount: { $gt: 0 } })), 0);
    assert.equal(await M.PaymentAuditLog.countDocuments({ action: { $in: ['RECONCILE', 'RECONCILE_RANGE'] } }), 2);
    const recovered = await call('/accountant/recover-payment', 'ACCOUNTANT', 'POST', { providerId: 2, amount: 999999 });
    assert.equal(recovered.status, 200);
    const t = await M.PaymentTransaction.findOne({ providerId: '2' });
    assert.equal(t.amount, 1000); // lấy từ SePay, bỏ qua số tiền client gửi
    assert.equal(t.status, 'UNMATCHED'); // không có mã thanh toán → vào danh sách sai lệch
  } finally {
    delete process.env.SEPAY_API_TOKEN;
    global.fetch = nativeFetch;
  }
});
test('teacher dashboard, attendance, and assignment grading are limited to assigned classes', async () => {
  await seedBasic();
  await M.User.create([
    { id: 3, code: 'TEA003', email: 'tea3@x', passwordHash: 'h', fullName: 'Teacher A', role: 'TEACHER' },
    { id: 4, code: 'TEA004', email: 'tea4@x', passwordHash: 'h', fullName: 'Teacher B', role: 'TEACHER' }
  ]);
  await M.Course.create([
    { id: 4, courseCode: 'NET201', name: 'Networking', totalSessions: 10 },
    { id: 5, courseCode: 'NET101', name: 'Networking', totalSessions: 10 }
  ]);
  await M.Class.create([
    { id: 4, classCode: 'NET201-SP26-01', courseId: 4, teacherId: 3, semester: 'SP26', status: 'ONGOING' },
    { id: 5, classCode: 'NET101-SP26-01', courseId: 5, teacherId: 4, semester: 'SP26', status: 'ONGOING' }
  ]);
  await M.Schedule.create({ id: 4, classId: 4, dayOfWeek: 2, shift: 1, startTime: '07:30', endTime: '09:50', room: 'P101' });
  await M.Enrollment.create([
    { id: 4, classId: 4, studentId: 10, status: 'ACTIVE' },
    { id: 5, classId: 4, studentId: 11, status: 'ACTIVE' }
  ]);
  await M.Attendance.create([
    ...[1, 2, 3].map(day => ({ classId: 4, studentId: 10, sessionDate: new Date(`2026-11-0${day}`), status: 'ABSENT_UNEXCUSED' })),
    ...[1, 2].map(day => ({ classId: 4, studentId: 11, sessionDate: new Date(`2026-11-1${day}`), status: 'ABSENT_UNEXCUSED' }))
  ]);
  const assignment = await M.Assignment.create({
    id: 4, classId: 4, title: 'BT01', description: 'Network programming',
    dueDate: new Date('2026-12-01T00:00:00Z')
  });
  const submission = await M.Submission.create({
    id: 4, assignmentId: assignment.id, studentId: 10, fileUrl: '/uploads/work.zip'
  });

  const dashboard = await call('/teacher/dashboard', ['TEACHER', 3]);
  assert.equal(dashboard.status, 200, JSON.stringify(dashboard.body));
  assert.deepEqual(dashboard.body.data.classes.map(item => item.classCode), ['NET201-SP26-01']);
  assert.equal(dashboard.body.data.schedules.length, 1);
  assert.equal(dashboard.body.data.summary.assignmentCount, 1);
  assert.equal(dashboard.body.data.summary.submissionCount, 1);
  assert.deepEqual(dashboard.body.data.attendanceWarnings.map(item => item.studentId), [10]);
  assert.deepEqual((await call('/classes?teacherId=4', ['TEACHER', 3])).body.data.map(item => item.id), [4]);

  assert.equal((await call('/classes/5/attendances', ['TEACHER', 3])).status, 404);
  assert.equal((await call('/classes/5/attendances', ['TEACHER', 3], 'POST', {
    sessionDate: '2026-11-05', records: [{ studentId: 10, status: 'PRESENT' }]
  })).status, 404);
  assert.equal((await call('/classes/5/assignments', ['TEACHER', 3], 'POST', {
    title: 'Not assigned', dueDate: '2026-12-01'
  })).status, 404);
  assert.equal((await call(`/submissions/${submission.id}/grade`, ['TEACHER', 4], 'PATCH', { score: 9 })).status, 403);
  assert.equal((await call(`/submissions/${submission.id}/grade`, ['TEACHER', 3], 'PATCH', {
    score: 9, teacherFeedback: 'Good work'
  })).status, 200);
});

test('UC1.3: export-excel and template routes respond with spreadsheet', async () => {
  await seedBasic();
  const resExp = await fetch(base + '/students/export-excel', { headers: { Authorization: token('ADMIN', 2) } });
  assert.equal(resExp.status, 200);
  assert.ok(resExp.headers.get('content-type').includes('spreadsheetml'));

  const resTpl = await fetch(base + '/students/import/template', { headers: { Authorization: token('ADMIN', 2) } });
  assert.equal(resTpl.status, 200);
  assert.ok(resTpl.headers.get('content-type').includes('spreadsheetml'));
});
