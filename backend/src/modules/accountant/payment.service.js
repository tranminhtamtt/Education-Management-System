/**
 * Dịch vụ thanh toán học phí qua SePay (Accountant / Người 3).
 *
 * Nguyên tắc:
 *  - Chỉ webhook SePay đã xác thực (hoặc dữ liệu SePay API được Accountant khôi phục) mới làm thay đổi công nợ.
 *  - Mọi thay đổi công nợ chạy trong transaction MongoDB; hóa đơn + giao dịch được khóa bằng lockDoc.
 *  - Idempotent theo provider_id (unique) và receipt_no `SEPAY-<providerId>` (unique).
 *  - Không cộng vượt công nợ; phần thừa/không khớp được lưu thành sai lệch để xử lý/hoàn tiền.
 */
const crypto = require('crypto');
const { withTransaction, lockDoc } = require('../../config/db');
const {
  TuitionInvoice, TuitionPayment, PaymentOrder, PaymentTransaction, PaymentDiscrepancy,
  RefundRequest, PaymentAuditLog, Notification, Enrollment
} = require('../../models');
const { generateVietQRData } = require('../../utils/vietqrGenerator');

const fail = (message, status = 400) => Object.assign(new Error(message), { status });
const PAYMENT_CODE_RE = /EMS[A-F0-9]{24}\b/g;

function money(value) {
  const n = Number(value);
  if (!Number.isSafeInteger(n) || n <= 0 || n > 9999999999) throw fail('Số tiền VND không hợp lệ');
  return n;
}

function allocation(amount, debt) {
  return Math.min(money(amount), Math.max(0, debt));
}

// SePay gửi header `Authorization: Apikey <API_KEY>` khi chọn chứng thực API Key.
function authenticateWebhook(header, secret) {
  if (!secret) throw fail('Chưa cấu hình SePay', 503);
  const a = Buffer.from(String(header || ''));
  const b = Buffer.from(`Apikey ${secret}`);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw fail('Webhook không hợp lệ', 401);
}

async function audit(session, actorId, action, entityId, details = {}) {
  await PaymentAuditLog.create([{ actorId: actorId ?? null, action, entityId: entityId || 0, details }], { session });
}

async function upsertDiscrepancy(session, transactionId, reason) {
  const existing = await PaymentDiscrepancy.findOne({ transactionId }).session(session);
  if (existing) {
    existing.reason = reason;
    existing.status = 'OPEN';
    return existing.save({ session });
  }
  const [created] = await PaymentDiscrepancy.create([{ transactionId, reason }], { session });
  return created;
}

const statusFor = (paid, amount) => (paid <= 0 ? 'UNPAID' : paid >= amount ? 'PAID' : 'PARTIAL');

/**
 * Phân bổ một giao dịch chưa phân bổ vào hóa đơn (phải gọi trong transaction).
 * Chỉ phân bổ tối đa số còn nợ; phần thừa giữ lại trên giao dịch (DISCREPANCY).
 */
async function applyPayment(session, transactionId, invoiceId, actorId = null) {
  const transaction = await lockDoc(PaymentTransaction, { id: transactionId }, session);
  if (!transaction) throw fail('Không tìm thấy giao dịch', 404);
  if (await RefundRequest.exists({ transactionId, status: { $ne: 'REJECTED' } }).session(session)) throw fail('Giao dịch đã có yêu cầu hoàn tiền');
  // Giao dịch chuyển trùng (appliedAmount = 0) vẫn được ghép sang hóa đơn khác còn nợ sau khi kiểm tra.
  if (Number(transaction.appliedAmount) > 0) throw fail('Giao dịch đã phân bổ');

  const inv = await lockDoc(TuitionInvoice, { id: invoiceId }, session);
  if (!inv) throw fail('Không tìm thấy hóa đơn', 404);

  const appliedAmount = allocation(transaction.amount, Number(inv.amount) - Number(inv.paidAmount));
  if (appliedAmount > 0) {
    const paidAmount = Number(inv.paidAmount) + appliedAmount;
    const status = statusFor(paidAmount, Number(inv.amount));
    await TuitionInvoice.updateOne({ id: invoiceId }, {
      $set: { paidAmount, status, paidAt: status === 'PAID' ? transaction.occurredAt : null }
    }, { session });
    await TuitionPayment.create([{
      invoiceId,
      transactionId: transaction.id,
      receiptNo: `SEPAY-${transaction.providerId}`,
      amount: appliedAmount,
      method: 'BANK_TRANSFER',
      paidAt: transaction.occurredAt,
      note: 'SePay verified webhook'
    }], { session });
    const activated = status === 'PAID' && (await Enrollment.updateOne(
      { id: inv.enrollmentId, studentId: inv.studentId, status: 'PENDING_PAYMENT' },
      { $set: { status: 'ACTIVE' } },
      { session }
    )).modifiedCount > 0;
    await Notification.create([{
      userId: inv.studentId,
      type: 'TUITION',
      title: 'Đã nhận thanh toán học phí',
      message: `Hóa đơn #${invoiceId}: đã nhận ${appliedAmount.toLocaleString('vi-VN')} VND qua chuyển khoản ngân hàng (SePay ${transaction.providerId}).`
        + (activated ? ' Bạn đã được cấp quyền học khóa học.' : '')
    }], { session });
  }

  const txStatus = appliedAmount === Number(transaction.amount) ? 'MATCHED' : 'DISCREPANCY';
  await PaymentTransaction.updateOne({ id: transaction.id }, { $set: { invoiceId, appliedAmount, status: txStatus } }, { session });
  if (Number(inv.paidAmount) + appliedAmount >= Number(inv.amount)) {
    const covered = await PaymentTransaction.find({
      invoiceId,
      appliedAmount: { $gt: 0 },
      $expr: { $eq: ['$appliedAmount', '$amount'] }
    }).select('id').session(session);
    await PaymentDiscrepancy.updateMany({
      transactionId: { $in: covered.map(t => t.id) },
      reason: 'UNDERPAYMENT',
      status: 'OPEN'
    }, { $set: { status: 'RESOLVED' } }, { session });
  }
  if (txStatus === 'DISCREPANCY') {
    await upsertDiscrepancy(session, transaction.id, 'OVERPAYMENT_OR_DUPLICATE');
  } else {
    await PaymentDiscrepancy.updateMany({ transactionId: transaction.id, status: 'OPEN' }, { $set: { status: 'RESOLVED' } }, { session });
  }
  await audit(session, actorId, 'APPLY_PAYMENT', transaction.id, { invoiceId, appliedAmount });
  return { appliedAmount, status: txStatus };
}

function parseWebhook(body) {
  if (!body || typeof body !== 'object') throw fail('Webhook không hợp lệ');
  if (!Number.isSafeInteger(body.id) || body.id <= 0) throw fail('Thiếu mã giao dịch SePay');
  if (!process.env.VIETQR_ACCOUNT_NO || !process.env.SEPAY_BANK_NAME) throw fail('Chưa cấu hình tài khoản nhận', 503);
  if (String(body.accountNumber) !== process.env.VIETQR_ACCOUNT_NO || body.gateway !== process.env.SEPAY_BANK_NAME) throw fail('Sai tài khoản/ngân hàng nhận');
  if (body.transferType !== 'in') return { ignored: true };
  const amount = money(body.transferAmount);
  const occurredAt = new Date(String(body.transactionDate).replace(' ', 'T') + '+07:00');
  if (Number.isNaN(occurredAt.getTime())) throw fail('Ngày giao dịch không hợp lệ');
  const codes = [...new Set(`${body.code || ''} ${body.content || ''}`.toUpperCase().match(PAYMENT_CODE_RE) || [])];
  return { providerId: String(body.id), amount, occurredAt, reference: body.referenceCode || null, codes };
}

async function findDuplicate(providerId, amount, reference, session) {
  const old = await PaymentTransaction.findOne({ providerId }).session(session || null);
  if (!old) return null;
  if (Number(old.amount) !== amount || (old.reference || null) !== reference) throw fail('ID giao dịch đã tồn tại với dữ liệu khác', 409);
  return { duplicate: true, id: old.id };
}

/**
 * Nhận webhook SePay (hoặc dữ liệu đã xác minh từ SePay API khi actorId != null).
 */
async function receiveWebhook(body, actorId = null) {
  const parsed = parseWebhook(body);
  if (parsed.ignored) return parsed;
  const { providerId, amount, occurredAt, reference, codes } = parsed;

  const known = await findDuplicate(providerId, amount, reference);
  if (known) return known;

  try {
    return await withTransaction(async session => {
      const dup = await findDuplicate(providerId, amount, reference, session);
      if (dup) return dup;

      const order = codes.length === 1 ? await PaymentOrder.findOne({ code: codes[0] }).session(session) : null;
      const [t] = await PaymentTransaction.create([{
        providerId, reference, orderId: order?.id ?? null, amount, occurredAt, payload: body
      }], { session });
      if (actorId !== null) await audit(session, actorId, 'RECOVER_BANK_PAYMENT', t.id, { providerId });

      if (order) {
        await applyPayment(session, t.id, order.invoiceId, actorId);
        const invoice = await TuitionInvoice.findOne({ id: order.invoiceId }).session(session);
        if (amount < Number(order.amount) && invoice.status !== 'PAID') {
          await PaymentTransaction.updateOne({ id: t.id }, { $set: { status: 'DISCREPANCY' } }, { session });
          await upsertDiscrepancy(session, t.id, 'UNDERPAYMENT');
        }
      } else {
        await upsertDiscrepancy(session, t.id, 'UNKNOWN_PAYMENT_CODE');
        await audit(session, actorId, 'UNMATCHED_BANK_PAYMENT', t.id, { providerId, codes });
      }
      return { id: t.id };
    });
  } catch (e) {
    // Webhook trùng đến đồng thời: unique provider_id chặn bản ghi thứ hai.
    if (e.code === 11000) {
      const dup = await findDuplicate(providerId, amount, reference);
      if (dup) return dup;
    }
    throw e;
  }
}

async function createOrder(invoiceId, user, requestedAmount) {
  if (!process.env.VIETQR_BANK_ID || !process.env.VIETQR_ACCOUNT_NO || !process.env.VIETQR_ACCOUNT_NAME) throw fail('Chưa cấu hình VietQR', 503);
  return withTransaction(async session => {
    const inv = await lockDoc(TuitionInvoice, { id: invoiceId }, session);
    if (!inv) throw fail('Không tìm thấy hóa đơn', 404);
    if (!(user.role === 'STUDENT' && inv.studentId === user.id) && !['ACCOUNTANT', 'ADMIN'].includes(user.role)) throw fail('Không có quyền', 403);
    const remaining = Number(inv.amount) - Number(inv.paidAmount);
    if (remaining <= 0) throw fail('Hóa đơn đã thanh toán đủ');
    const amount = money(requestedAmount ?? remaining);
    if (amount > remaining) throw fail('Số tiền vượt công nợ');
    const [order] = await PaymentOrder.create([{
      invoiceId,
      amount,
      code: `EMS${crypto.randomBytes(12).toString('hex').toUpperCase()}`,
      createdById: user.id ?? null
    }], { session });
    const full = await TuitionInvoice.findOne({ id: invoiceId }).session(session)
      .populate([{ path: 'student', select: 'id code fullName' }, { path: 'enrollment', populate: { path: 'class', populate: 'course' } }]);
    return {
      ...order.toJSON(),
      ...generateVietQRData({ amount, paymentCode: order.code }),
      studentName: full.student?.fullName,
      courseName: full.enrollment?.class?.course?.name,
      totalAmount: Number(inv.amount),
      paidAmount: Number(inv.paidAmount),
      remainingAmount: remaining,
      status: inv.status
    };
  });
}

module.exports = { fail, money, allocation, authenticateWebhook, audit, applyPayment, parseWebhook, receiveWebhook, createOrder, upsertDiscrepancy, statusFor };
