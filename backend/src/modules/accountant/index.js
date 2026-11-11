/**
 * API Kế toán + thanh toán SePay (Người 3 - ACCOUNTANT).
 * UC9.2 giao dịch, UC9.3 đối soát, UC9.4 theo dõi sai lệch, UC9.7 tổng hợp,
 * UC-PAY.1 Payment Order/VietQR, UC-PAY.2 webhook SePay.
 */
const router = require('express').Router();
const auth = require('../../middlewares/auth.middleware');
const roles = require('../../middlewares/role.middleware');
const {
  User, TuitionInvoice, TuitionPayment, PaymentOrder, PaymentTransaction, PaymentDiscrepancy, RefundRequest, PaymentAuditLog
} = require('../../models');
const { like, plain } = require('../../utils/query');
const { successResponse, errorResponse } = require('../../utils/formatResponse');
const s = require('./payment.service');
const { withTransaction } = require('../../config/db');
const tuitionDateRange = require('../../utils/tuitionDateRange');

const run = fn => async (req, res) => {
  try {
    return successResponse(res, await fn(req));
  } catch (e) {
    if (!e.status) console.error('Payment operation failed:', e.code || e.message);
    if (e.code === 11000) return errorResponse(res, 'Mã tham chiếu đã tồn tại', 409);
    return errorResponse(res, e.status ? e.message : 'Lỗi xử lý thanh toán', e.status || 500);
  }
};
const id = value => {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0) throw s.fail('ID không hợp lệ');
  return n;
};
const STUDENT_FIELDS = 'id code fullName email';

// ---------------------------------------------------------------------------
// UC-PAY.2: Webhook SePay — xác thực bằng API Key riêng, không dùng JWT
// ---------------------------------------------------------------------------
router.post('/payments/sepay/webhook', run(async req => {
  s.authenticateWebhook(req.headers.authorization, process.env.SEPAY_WEBHOOK_API_KEY);
  // Gọi qua đối tượng service để kiểm thử có thể thay thế
  return s.receiveWebhook(req.body);
}));

// ---------------------------------------------------------------------------
// UC-PAY.1: Payment Order + VietQR động
// ---------------------------------------------------------------------------
router.post('/payment-orders', auth, roles('STUDENT', 'ACCOUNTANT'), run(req =>
  s.createOrder(id(req.body.invoiceId), req.user, req.body.amount)
));

router.get('/payment-orders/:id', auth, roles('STUDENT', 'ACCOUNTANT'), run(async req => {
  const order = await PaymentOrder.findOne({ id: id(req.params.id) }).populate(['invoice', 'transactions']);
  if (!order) throw s.fail('Không tìm thấy lệnh thanh toán', 404);
  if (req.user.role === 'STUDENT' && order.invoice?.studentId !== req.user.id) throw s.fail('Không có quyền', 403);
  const o = plain(order);
  return {
    ...o,
    transactions: (o.transactions || []).map(t => ({ id: t.id, amount: t.amount, appliedAmount: t.appliedAmount, status: t.status, occurredAt: t.occurredAt })),
    invoiceStatus: o.invoice?.status
  };
}));

// ---------------------------------------------------------------------------
// Khu vực chỉ dành cho ACCOUNTANT
// ---------------------------------------------------------------------------
router.use('/accountant', auth, roles('ACCOUNTANT'));

// Administrative closure only: never change the transaction or invoice.
router.patch('/accountant/discrepancies/:id', run(async req => {
  const discrepancyId = id(req.params.id);
  const body = req.body || {};
  if (Object.keys(body).some(key => !['status', 'note'].includes(key)) || body.status !== 'RESOLVED') {
    throw s.fail('Chỉ được đóng hồ sơ OPEN sang RESOLVED kèm ghi chú');
  }
  if (typeof body.note !== 'string' || !body.note.trim() || body.note.length > 4000) {
    throw s.fail('Ghi chú xử lý bắt buộc, tối đa 4000 ký tự');
  }
  return withTransaction(async session => {
    const existing = await PaymentDiscrepancy.findOne({ id: discrepancyId }).session(session);
    if (!existing) throw s.fail('Không tìm thấy hồ sơ sai lệch', 404);
    const resolved = await PaymentDiscrepancy.findOneAndUpdate(
      { id: discrepancyId, status: 'OPEN' },
      { $set: { status: 'RESOLVED', note: body.note.trim() } },
      { new: true, session }
    );
    if (!resolved) throw s.fail('Hồ sơ đã được xử lý', 409);
    await s.audit(session, req.user.id, 'RESOLVE_DISCREPANCY', existing.transactionId,
      { discrepancyId, previousNote: existing.note || null, note: resolved.note });
    return plain(resolved);
  });
}));

function pageParams(query) {
  const page = Math.max(1, Math.floor(Number(query.page) || 1));
  const take = Math.min(100, Math.max(1, Math.floor(Number(query.pageSize) || 20)));
  if (!Number.isSafeInteger(page) || page > 1000000) throw s.fail('Phân trang không hợp lệ');
  return { page, take, skip: (page - 1) * take };
}

async function transactionFilter(query) {
  const where = {};
  if (query.status) where.status = String(query.status);
  if (query.from || query.to) {
    where.occurredAt = {};
    if (query.from) where.occurredAt.$gte = new Date(String(query.from));
    if (query.to) where.occurredAt.$lte = new Date(String(query.to));
    if (Object.values(where.occurredAt).some(d => Number.isNaN(d.getTime()))) throw s.fail('Khoảng thời gian không hợp lệ');
  }
  if (query.search) {
    const q = String(query.search).trim();
    const [orders, students] = await Promise.all([
      PaymentOrder.find({ code: like(q) }).select('id'),
      User.find({ role: 'STUDENT', $or: [{ fullName: like(q) }, { code: like(q) }] }).select('id')
    ]);
    const invoices = students.length ? await TuitionInvoice.find({ studentId: { $in: students.map(u => u.id) } }).select('id') : [];
    where.$or = [
      { providerId: like(q) },
      { reference: like(q) },
      { orderId: { $in: orders.map(o => o.id) } },
      { invoiceId: { $in: invoices.map(i => i.id) } }
    ];
  }
  return where;
}

const TRANSACTION_POPULATE = [
  'order',
  { path: 'invoice', populate: [{ path: 'student', select: STUDENT_FIELDS }, { path: 'enrollment', populate: { path: 'class', populate: 'course' } }] },
  'discrepancy'
];

// Paginated transactions, discrepancies and historical refunds (read-only).
router.get('/accountant/:resource(transactions|discrepancies|refunds|audit-logs)', run(async req => {
  const { page, take, skip } = pageParams(req.query);
  const resource = req.params.resource;
  let model, where = {}, populate = [];
  if (resource === 'transactions') {
    model = PaymentTransaction;
    where = await transactionFilter(req.query);
    populate = TRANSACTION_POPULATE;
  } else if (resource === 'discrepancies') {
    model = PaymentDiscrepancy;
    if (req.query.status) where.status = String(req.query.status);
    if (req.query.reason) where.reason = String(req.query.reason);
    populate = [{ path: 'transaction', populate: TRANSACTION_POPULATE.slice(0, 2) }];
  } else if (resource === 'refunds') {
    model = RefundRequest;
    if (req.query.status) where.status = String(req.query.status);
    populate = [{ path: 'transaction', populate: TRANSACTION_POPULATE.slice(0, 2) }];
  } else {
    model = PaymentAuditLog;
    if (req.query.action) where.action = String(req.query.action);
  }
  const [docs, total] = await Promise.all([
    model.find(where).sort({ id: -1 }).skip(skip).limit(take).populate(populate),
    model.countDocuments(where)
  ]);
  // Dữ liệu webhook gốc chỉ trả đầy đủ ở màn hình chi tiết; danh sách chỉ giữ nội dung chuyển khoản.
  const brief = p => (p ? { content: p.content ?? null, code: p.code ?? null } : p);
  const items = docs.map(d => {
    const o = plain(d);
    if (o.payload) o.payload = brief(o.payload);
    if (o.transaction?.payload) o.transaction.payload = brief(o.transaction.payload);
    return o;
  });
  return { items, total, page, pageSize: take };
}));

// UC9.2: Chi tiết giao dịch (chỉ đọc) — kèm sai lệch, hoàn tiền, audit trail
router.get('/accountant/transactions/:id', run(async req => {
  const t = await PaymentTransaction.findOne({ id: id(req.params.id) }).populate([...TRANSACTION_POPULATE, 'refunds']);
  if (!t) throw s.fail('Không tìm thấy giao dịch', 404);
  const logs = await PaymentAuditLog.find({ entityId: t.id, action: { $in: ['APPLY_PAYMENT', 'RECOVER_BANK_PAYMENT', 'UNMATCHED_BANK_PAYMENT', 'RECONCILE', 'RESOLVE_DISCREPANCY'] } }).sort({ id: 1 });
  return { ...plain(t), auditLogs: logs.map(plain) };
}));

// ---------------------------------------------------------------------------
// UC9.3: Đối soát với dữ liệu độc lập từ SePay API v1 (không cộng tiền)
// ---------------------------------------------------------------------------
async function sepayGet(path) {
  if (!process.env.SEPAY_API_TOKEN) throw s.fail('Chưa cấu hình SEPAY_API_TOKEN để truy vấn dữ liệu độc lập', 503);
  let response;
  try {
    response = await fetch(`https://my.sepay.vn/userapi/${path}`, {
      headers: { Authorization: `Bearer ${process.env.SEPAY_API_TOKEN}` },
      signal: AbortSignal.timeout(15000)
    });
  } catch {
    throw s.fail('Không kết nối được API SePay', 502);
  }
  if (!response.ok) throw s.fail('SePay chưa trả dữ liệu hợp lệ; không lưu kết quả đối soát', 502);
  let data;
  try {
    data = await response.json();
  } catch {
    throw s.fail('SePay trả về dữ liệu không đọc được', 502);
  }
  if (!data || Number(data.status) !== 200) throw s.fail('Dữ liệu SePay không hợp lệ', 502);
  return data;
}

const ownAccount = bank => bank.account_number === process.env.VIETQR_ACCOUNT_NO && bank.bank_brand_name === process.env.SEPAY_BANK_NAME;

async function getBankTransaction(providerId) {
  const data = await sepayGet(`transactions/details/${providerId}`);
  const bank = data.transaction;
  if (!bank || String(bank.id) !== providerId) throw s.fail('Dữ liệu SePay không hợp lệ', 502);
  if (!ownAccount(bank)) throw s.fail('Giao dịch thuộc tài khoản khác', 400);
  return bank;
}

const compare = (local, bank) => {
  if (!local) return 'UNMATCHED';
  return Number(local.amount) === Number(bank.amount_in) && Number(bank.amount_out) === 0 && (local.reference || null) === (bank.reference_number || null) ? 'MATCHED' : 'DISCREPANCY';
};

// Đối soát một giao dịch theo SePay ID
router.post('/accountant/reconcile', run(async req => {
  const providerId = String(id(req.body.providerId));
  const bank = await getBankTransaction(providerId);
  const local = await PaymentTransaction.findOne({ providerId });
  const status = compare(local, bank);
  const result = { providerId, status, localId: local?.id || null, localStatus: local?.status || null, bank };
  await PaymentAuditLog.create({ actorId: req.user.id, action: 'RECONCILE', entityId: local?.id || 0, details: result });
  return result;
}));

// Đối soát theo khoảng thời gian: phát hiện giao dịch thiếu ở EMS, sai số tiền/tham chiếu, và giao dịch EMS không có ở ngân hàng
router.post('/accountant/reconcile-range', run(async req => {
  const from = String(req.body.from || ''), to = String(req.body.to || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) throw s.fail('Khoảng ngày không hợp lệ (YYYY-MM-DD)');
  const days = (new Date(to) - new Date(from)) / 86400000;
  if (!Number.isFinite(days) || [from, to].some(date => new Date(date).toISOString().slice(0, 10) !== date)) throw s.fail('Ngày không hợp lệ');
  if (days >= 31) throw s.fail('Chỉ đối soát tối đa 31 ngày mỗi lần');
  if (!process.env.VIETQR_ACCOUNT_NO || !process.env.SEPAY_BANK_NAME) throw s.fail('Chưa cấu hình tài khoản nhận', 503);
  const limit = 5000;
  const params = new URLSearchParams({ account_number: process.env.VIETQR_ACCOUNT_NO || '', transaction_date_min: `${from} 00:00:00`, transaction_date_max: `${to} 23:59:59`, limit: String(limit) });
  const data = await sepayGet(`transactions/list?${params}`);
  if (!Array.isArray(data.transactions)) throw s.fail('SePay thiếu danh sách giao dịch hợp lệ', 502);
  const truncated = data.transactions.length >= limit;
  const bankRows = data.transactions.filter(b => ownAccount(b) && Number(b.amount_in) > 0);
  const start = new Date(`${from}T00:00:00+07:00`), end = new Date(`${to}T23:59:59.999+07:00`);
  const locals = await PaymentTransaction.find({ $or: [{ providerId: { $in: bankRows.map(b => String(b.id)) } }, { occurredAt: { $gte: start, $lte: end } }] });
  const localByProvider = new Map(locals.map(l => [l.providerId, l]));
  const rows = bankRows.map(b => {
    const local = localByProvider.get(String(b.id));
    return { providerId: String(b.id), status: compare(local, b), localId: local?.id || null, localStatus: local?.status || null, amount: Number(b.amount_in), reference: b.reference_number || null, transactionDate: b.transaction_date, content: b.transaction_content };
  });
  const bankIds = new Set(bankRows.map(b => String(b.id)));
  const missingAtBank = (truncated ? [] : locals.filter(l => l.occurredAt >= start && l.occurredAt <= end && !bankIds.has(l.providerId)))
    .map(l => ({ providerId: l.providerId, status: 'DISCREPANCY', note: 'Có trong EMS nhưng không có trong dữ liệu SePay của khoảng ngày', localId: l.id, localStatus: l.status, amount: l.amount, reference: l.reference }));
  const all = [...rows, ...missingAtBank];
  const summary = {
    from, to,
    bankCount: bankRows.length,
    matched: all.filter(r => r.status === 'MATCHED').length,
    unmatched: all.filter(r => r.status === 'UNMATCHED').length,
    discrepancy: all.filter(r => r.status === 'DISCREPANCY').length,
    truncated
  };
  await PaymentAuditLog.create({ actorId: req.user.id, action: 'RECONCILE_RANGE', entityId: 0, details: { ...summary, rows: all.map(r => ({ providerId: r.providerId, status: r.status })) } });
  return { summary, rows: all };
}));

// Khôi phục giao dịch ngân hàng đã đến nhưng EMS chưa ghi nhận (webhook thất bại) — dùng dữ liệu SePay API, không nhập tay
router.post('/accountant/recover-payment', run(async req => {
  const providerId = String(id(req.body.providerId));
  const bank = await getBankTransaction(providerId);
  if (Number(bank.amount_out) !== 0 || Number(bank.amount_in) <= 0) throw s.fail('Chỉ khôi phục giao dịch tiền vào');
  return s.receiveWebhook({
    id: Number(providerId),
    transferAmount: Number(bank.amount_in),
    transferType: 'in',
    accountNumber: bank.account_number,
    gateway: bank.bank_brand_name,
    transactionDate: bank.transaction_date,
    referenceCode: bank.reference_number,
    code: bank.code,
    content: bank.transaction_content
  }, req.user.id);
}));

// UC9.7: Tổng hợp tài chính theo khoảng thời gian (dựa trên giao dịch thực tế)
router.get('/accountant/summary', run(async req => {
  let start, end, year = null;
  if (req.query.from !== undefined || req.query.to !== undefined) {
    const range = tuitionDateRange(req.query.from, req.query.to);
    if (!range) throw s.fail('Khoảng thời gian không hợp lệ');
    start = range.$gte;
    end = range.$lte;
  } else {
    year = Number(req.query.year || new Date().getFullYear());
    if (!Number.isInteger(year) || year < 2000 || year > 2100) throw s.fail('Năm không hợp lệ');
    start = new Date(`${year}-01-01T00:00:00+07:00`);
    end = new Date(`${year}-12-31T23:59:59.999+07:00`);
  }
  const [refunds, anomalous, transactions, invoices, receipts] = await Promise.all([
    RefundRequest.aggregate([{ $match: { status: 'COMPLETED', completedAt: { $gte: start, $lte: end } } }, { $group: { _id: null, amount: { $sum: '$amount' } } }]),
    PaymentDiscrepancy.countDocuments({ status: 'OPEN' }),
    PaymentTransaction.aggregate([{ $match: { occurredAt: { $gte: start, $lte: end } } }, { $group: { _id: null, amount: { $sum: '$amount' }, applied: { $sum: '$appliedAmount' }, count: { $sum: 1 } } }]),
    TuitionInvoice.aggregate([{ $group: { _id: null, amount: { $sum: '$amount' }, paid: { $sum: '$paidAmount' },
      paidCount: { $sum: { $cond: [{ $eq: ['$status', 'PAID'] }, 1, 0] } },
      unpaidCount: { $sum: { $cond: [{ $in: ['$status', ['UNPAID', 'PARTIAL']] }, 1, 0] } }
    } }]),
    TuitionPayment.aggregate([{ $match: { paidAt: { $gte: start, $lte: end } } }, { $group: { _id: null, amount: { $sum: '$amount' } } }])
  ]);
  const receivable = Number(invoices[0]?.amount || 0), collected = Number(invoices[0]?.paid || 0);
  return {
    year,
    from: start,
    to: end,
    receivable,
    collected,
    collectedInRange: Number(receipts[0]?.amount || 0),
    paidCount: Number(invoices[0]?.paidCount || 0),
    unpaidCount: Number(invoices[0]?.unpaidCount || 0),
    outstanding: Math.max(0, receivable - collected),
    refunded: Number(refunds[0]?.amount || 0),
    anomalous,
    bankReceived: Number(transactions[0]?.amount || 0),
    applied: Number(transactions[0]?.applied || 0),
    transactionCount: Number(transactions[0]?.count || 0)
  };
}));

module.exports = router;
