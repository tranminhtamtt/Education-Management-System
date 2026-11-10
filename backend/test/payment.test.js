const { test, before, after, beforeEach } = require('node:test');
const assert = require('node:assert/strict');
const { startMongo, stopMongo, resetMongo } = require('./helpers/mongo');
const s = require('../src/modules/accountant/payment.service');
const M = require('../src/models');

const code = 'EMS' + 'A'.repeat(24);
process.env.VIETQR_ACCOUNT_NO = 'TEST123';
process.env.SEPAY_BANK_NAME = 'TestBank';
process.env.VIETQR_BANK_ID = 'TEST';
process.env.VIETQR_ACCOUNT_NAME = 'TEST EMS';

before(startMongo);
after(stopMongo);

async function fixture(amount = 1000) {
  await resetMongo();
  await M.User.create([{ id: 10, code: 'S10', email: 's10@x', passwordHash: 'h', fullName: 'Student', role: 'STUDENT' }]);
  await M.Course.create([{ id: 1, courseCode: 'PRF192', name: 'C', baseTuitionFee: amount }]);
  await M.Class.create([{ id: 1, classCode: 'C1', courseId: 1, semester: 'FA26' }]);
  await M.Enrollment.create([{ id: 1, classId: 1, studentId: 10 }]);
  await M.TuitionInvoice.create([{ id: 1, studentId: 10, enrollmentId: 1, amount, dueDate: new Date() }]);
  await M.PaymentOrder.create([{ id: 1, code, invoiceId: 1, amount }]);
}
const webhook = (id, amount, content = code) => ({ id, transferAmount: amount, transferType: 'in', accountNumber: 'TEST123', gateway: 'TestBank', transactionDate: '2026-11-02 10:00:00', referenceCode: `TEST-${id}`, content });
const invoice = () => M.TuitionInvoice.findOne({ id: 1 }).lean();

beforeEach(() => fixture());

test('strict VND and webhook authentication validation', () => {
  for (const v of [0, -1, 0.5, NaN, Infinity, 'bad', 1e12]) assert.throws(() => s.money(v));
  assert.equal(s.money('1000'), 1000);
  assert.throws(() => s.authenticateWebhook('Apikey key', ''), { status: 503 });
  assert.throws(() => s.authenticateWebhook('Bearer key', 'key'), { status: 401 });
  s.authenticateWebhook('Apikey key', 'key');
});

test('full payment: invoice PAID, one receipt linked to transaction, notification and audit', async () => {
  await s.receiveWebhook(webhook(1, 1000));
  const inv = await invoice();
  assert.equal(inv.status, 'PAID');
  assert.equal(inv.paidAmount, 1000);
  const receipts = await M.TuitionPayment.find().lean();
  assert.equal(receipts.length, 1);
  assert.equal(receipts[0].receiptNo, 'SEPAY-1');
  assert.equal((await M.PaymentTransaction.findOne({ providerId: '1' })).status, 'MATCHED');
  assert.equal(await M.Notification.countDocuments({ userId: 10, type: 'TUITION' }), 1);
  assert.equal(await M.PaymentAuditLog.countDocuments({ action: 'APPLY_PAYMENT' }), 1);
});

test('installments UNPAID → PARTIAL → PAID without double counting', async () => {
  await s.receiveWebhook(webhook(1, 400));
  assert.equal((await invoice()).status, 'PARTIAL');
  assert.equal((await M.PaymentDiscrepancy.findOne()).reason, 'UNDERPAYMENT');
  await s.receiveWebhook(webhook(2, 600));
  const inv = await invoice();
  assert.equal(inv.status, 'PAID');
  assert.equal(inv.paidAmount, 1000);
  assert.equal((await M.PaymentTransaction.findOne({ providerId: '2' })).status, 'MATCHED');
  const sum = (await M.TuitionPayment.find().lean()).reduce((n, p) => n + p.amount, 0);
  assert.equal(sum, 1000);
});

test('overpayment caps allocation at the debt and keeps the surplus as an open discrepancy', async () => {
  await s.receiveWebhook(webhook(1, 1500));
  assert.equal((await invoice()).paidAmount, 1000);
  const t = await M.PaymentTransaction.findOne({ providerId: '1' });
  assert.equal(t.amount, 1500);
  assert.equal(t.appliedAmount, 1000);
  assert.equal(t.status, 'DISCREPANCY');
  assert.equal((await M.PaymentDiscrepancy.findOne({ transactionId: t.id })).reason, 'OVERPAYMENT_OR_DUPLICATE');
});

test('webhook replay is idempotent, conflicting replay rejected, second genuine transfer retained for refund', async () => {
  const body = webhook(1, 1000);
  await s.receiveWebhook(body);
  assert.equal((await s.receiveWebhook(body)).duplicate, true);
  await assert.rejects(s.receiveWebhook({ ...body, transferAmount: 999 }), { status: 409 });
  await s.receiveWebhook(webhook(2, 1000));
  assert.equal(await M.TuitionPayment.countDocuments(), 1);
  assert.equal(await M.PaymentTransaction.countDocuments(), 2);
  assert.equal((await M.PaymentTransaction.findOne({ providerId: '2' })).appliedAmount, 0);
});

test('concurrent duplicate webhooks and concurrent different transfers never over-credit (real transactions)', async () => {
  const body = webhook(7, 600);
  const results = await Promise.all([s.receiveWebhook(body), s.receiveWebhook(body), s.receiveWebhook(body)]);
  assert.equal(results.filter(r => !r.duplicate).length, 1);
  assert.equal(await M.PaymentTransaction.countDocuments(), 1);
  await Promise.all([s.receiveWebhook(webhook(8, 600)), s.receiveWebhook(webhook(9, 600))]);
  const inv = await invoice();
  assert.equal(inv.paidAmount, 1000);
  assert.equal(inv.status, 'PAID');
  const applied = (await M.PaymentTransaction.find().lean()).reduce((n, t) => n + t.appliedAmount, 0);
  assert.equal(applied, 1000);
});

test('unknown or ambiguous payment codes are stored without changing debt', async () => {
  for (const [i, content] of ['WRONG', `${code} EMS${'B'.repeat(24)}`].entries()) {
    await s.receiveWebhook(webhook(100 + i, 1000, content));
  }
  assert.equal((await invoice()).paidAmount, 0);
  assert.equal(await M.PaymentTransaction.countDocuments({ status: 'UNMATCHED' }), 2);
  assert.equal(await M.PaymentDiscrepancy.countDocuments({ reason: 'UNKNOWN_PAYMENT_CODE' }), 2);
});

test('outbound is ignored; wrong account/bank, amount or date is rejected', async () => {
  const body = webhook(1, 1000);
  assert.equal((await s.receiveWebhook({ ...body, transferType: 'out' })).ignored, true);
  for (const change of [{ accountNumber: 'WRONG' }, { gateway: 'WRONG' }, { transferAmount: -1 }, { transactionDate: 'invalid' }, { id: 'x' }]) {
    await assert.rejects(s.receiveWebhook({ ...body, ...change }));
  }
  assert.equal(await M.PaymentTransaction.countDocuments(), 0);
});

test('a failure inside the transaction rolls back transaction, receipt and invoice together', async () => {
  const original = M.Notification.create;
  M.Notification.create = async () => { throw new Error('injected failure'); };
  try {
    await assert.rejects(s.receiveWebhook(webhook(1, 1000)));
  } finally {
    M.Notification.create = original;
  }
  assert.equal((await invoice()).paidAmount, 0);
  assert.equal(await M.PaymentTransaction.countDocuments(), 0);
  assert.equal(await M.TuitionPayment.countDocuments(), 0);
});

test('students cannot create orders for other students; creating a QR does not pay; cannot exceed debt', async () => {
  await assert.rejects(s.createOrder(1, { role: 'STUDENT', id: 99 }), { status: 403 });
  const order = await s.createOrder(1, { role: 'STUDENT', id: 10 }, 500);
  assert.match(order.description, /^EMS[A-F0-9]{24}$/);
  assert.match(order.qrImageUrl, /amount=500/);
  assert.equal(order.studentName, 'Student');
  assert.equal((await invoice()).paidAmount, 0);
  await assert.rejects(s.createOrder(1, { role: 'STUDENT', id: 10 }, 1001));
  await s.receiveWebhook(webhook(1, 1000));
  await assert.rejects(s.createOrder(1, { role: 'STUDENT', id: 10 }), /thanh toán đủ/);
});

test('a wrong-code transfer can later be applied to the invoice once by the accountant, with audit', async () => {
  await s.receiveWebhook(webhook(1, 1000, 'NO CODE'));
  const t = await M.PaymentTransaction.findOne({ providerId: '1' });
  const { withTransaction } = require('../src/config/db');
  await withTransaction(session => s.applyPayment(session, t.id, 1, 5));
  assert.equal((await invoice()).status, 'PAID');
  await assert.rejects(withTransaction(session => s.applyPayment(session, t.id, 1, 5)), /đã phân bổ/);
  assert.equal(await M.PaymentAuditLog.countDocuments({ action: 'APPLY_PAYMENT', actorId: 5 }), 1);
});

// Mỗi lần thanh toán có mã riêng; mã cũ vẫn đối soát được nếu ngân hàng gửi chậm.
test('new orders have distinct QR codes and the next order uses only remaining debt', async () => {
  const student = { role: 'STUDENT', id: 10 };
  const first = await s.createOrder(1, student);
  const second = await s.createOrder(1, student);
  assert.notEqual(first.code, second.code);
  assert.notEqual(first.qrImageUrl, second.qrImageUrl);
  assert.equal((await invoice()).paidAmount, 0);
  await s.receiveWebhook(webhook(901, 400, first.code));
  const remaining = await s.createOrder(1, student);
  assert.equal(remaining.amount, 600);
  assert.notEqual(remaining.code, first.code);
  await s.receiveWebhook(webhook(902, 600, remaining.code));
  assert.equal((await invoice()).status, 'PAID');
  assert.equal(await M.TuitionPayment.countDocuments(), 2);
});

test('supplement resolves only covered underpayment and preserves bank evidence', async () => {
  await fixture(500000);
  const body = webhook(1001, 400000);
  await s.receiveWebhook(body);
  const first = await M.PaymentTransaction.findOne({ providerId: '1001' }).lean();
  assert.equal((await M.PaymentDiscrepancy.findOne({ transactionId: first.id })).status, 'OPEN');
  await s.receiveWebhook(webhook(1002, 100000, 'UNKNOWN'));
  await s.receiveWebhook(webhook(1003, 150000));
  assert.equal((await invoice()).paidAmount, 500000);
  assert.equal((await invoice()).status, 'PAID');
  assert.equal((await M.PaymentDiscrepancy.findOne({ transactionId: first.id })).status, 'RESOLVED');
  assert.equal(await M.PaymentDiscrepancy.countDocuments({ status: 'OPEN' }), 2);
  const after = await M.PaymentTransaction.findOne({ id: first.id }).lean();
  assert.equal(after.amount, first.amount);
  assert.deepEqual(after.payload, first.payload);
});

test('same code 400000 plus 100000 records exactly two payments', async () => {
  await fixture(500000);
  await s.receiveWebhook(webhook(2001, 400000));
  await s.receiveWebhook(webhook(2002, 100000));
  await s.receiveWebhook(webhook(2002, 100000));
  assert.equal((await invoice()).paidAmount, 500000);
  assert.equal(await M.PaymentTransaction.countDocuments(), 2);
  assert.equal(await M.TuitionPayment.countDocuments(), 2);
  assert.equal(await M.PaymentDiscrepancy.countDocuments({ status: 'OPEN' }), 0);
});
