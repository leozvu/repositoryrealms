import crypto from 'node:crypto';
import { CURRENCIES, docGrand, moneyC, parseStrict } from './format.js';
import { hasAny, isDirector, rolesOf } from './perm.js';
import { enqueueEvent } from './event-outbox.js';

export class FinancialPaymentError extends Error {
  constructor(message, status = 400, code = 'payment_invalid') {
    super(message);
    this.status = status;
    this.code = code;
  }
}
const fail = (message, status, code) => { throw new FinancialPaymentError(message, status, code); };
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const integerAmount = value => Number.isSafeInteger(value) && value > 0 && value <= 2147483647;

export function requirePaymentKey(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9:_-]{16,128}$/.test(value)) {
    fail('Cần Idempotency-Key gồm 16–128 ký tự cho thao tác thanh toán. Hãy tải lại giao diện; ứng dụng tích hợp phải giữ cùng key khi thử lại cùng yêu cầu.', 400, 'payment_idempotency_required');
  }
  return value;
}

export function paymentDate(value) {
  if (value == null || value === '') return null;
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value) {
    fail('Ngày thanh toán không hợp lệ.', 400, 'payment_date_invalid');
  }
  return value;
}

export function vendorPaymentRequest(user, recordId, key, date) {
  const normalized = { resource: 'vendorbills', recordId, date: paymentDate(date) };
  return {
    requestKey: hash(JSON.stringify([user.id, 'vendorbills', recordId, requirePaymentKey(key)])),
    requestHash: hash(JSON.stringify(normalized)),
    date: normalized.date,
  };
}

function normalize(resource, user, input) {
  if (!user?.id || (user.status && user.status !== 'active') || !hasAny(user, resource === 'invoices' ? ['ACCOUNTANT'] : ['ACCOUNTANT', 'PM'])) {
    fail('Bạn không có quyền thực hiện thanh toán.', 403, 'forbidden');
  }
  const key = requirePaymentKey(input.idempotencyKey);
  const amount = resource === 'invoices' ? Number(input.amount) : null;
  if (resource === 'invoices' && (!['number', 'string'].includes(typeof input.amount) || !integerAmount(amount))) {
    fail('Số tiền thu phải là số nguyên dương theo đồng tiền hóa đơn và nằm trong giới hạn lưu sổ hiện tại.', 400, 'payment_amount_invalid');
  }
  const body = {
    resource, recordId: String(input.recordId || ''), amount, date: paymentDate(input.date),
    note: resource === 'invoices' ? String(input.note || '').trim().slice(0, 1000) : '',
    approvalId: resource === 'vendorbills' ? input.approvalId || null : null,
  };
  if (!body.recordId) fail('Thiếu chứng từ thanh toán.', 400, 'payment_record_required');
  return {
    ...body, actor: user,
    idempotencyKey: hash(JSON.stringify([body.approvalId ? `approval:${body.approvalId}` : user.id, resource, body.recordId, key])),
    requestHash: hash(JSON.stringify(body)),
  };
}

function replay(receipt, command) {
  if (receipt.requestHash !== command.requestHash) {
    fail('Idempotency-Key này đã dùng cho nội dung khác. Giữ nội dung cũ để thử lại hoặc tạo key mới cho thanh toán mới.', 409, 'payment_idempotency_conflict');
  }
  return { record: JSON.parse(receipt.resultJson), receipt: { id: receipt.id, transactionId: receipt.transactionId }, replayed: true };
}

async function finalize(tx, command, record, payment) {
  const entry = await tx.transaction.create({ data: {
    type: command.resource === 'invoices' ? 'income' : 'expense',
    category: command.resource === 'invoices' ? 'Doanh thu dịch vụ' : 'Thanh toán nhà cung cấp',
    amount: payment.amount, currency: payment.currency, fxRate: payment.fxRate,
    date: payment.date, desc: payment.description, projectId: record.projectId, createdById: command.actor.id,
  } });
  await tx.auditLog.create({ data: {
    userId: command.actor.id, userName: command.actor.name || command.actor.id,
    action: 'payment', entity: command.resource, refId: record.id,
    detail: `${record.code}: ${command.resource === 'invoices' ? '+' : '-'}${moneyC(payment.amount, payment.currency)}`,
  } });
  const receipt = await tx.financialPaymentReceipt.create({ data: {
    idempotencyKey: command.idempotencyKey, requestHash: command.requestHash,
    resource: command.resource, recordId: record.id, userId: command.actor.id,
    approvalId: command.approvalId, transactionId: entry.id,
    amount: payment.amount, currency: payment.currency, fxRate: payment.fxRate,
    date: payment.date, resultJson: JSON.stringify(record),
  } });
  await enqueueEvent(tx, { resource: command.resource, event: 'update', row: record, old: payment.before, user: command.actor });
  await enqueueEvent(tx, { resource: 'transactions', event: 'create', row: entry, user: command.actor });
  return { record, receipt: { id: receipt.id, transactionId: entry.id }, replayed: false };
}

async function receiveInvoice(tx, command) {
  const invoice = await tx.invoice.findUnique({ where: { id: command.recordId }, include: { client: true } });
  if (!invoice) fail('Không tìm thấy hóa đơn.', 404, 'payment_record_not_found');
  const payments = parseStrict(invoice.payments);
  const items = parseStrict(invoice.items);
  if (!payments || !items || !items.length || payments.some(item => !item || !Number.isSafeInteger(item.amount) || item.amount < 0)
    || items.some(item => !item || !Number.isFinite(Number(item.qty)) || Number(item.qty) < 0 || !Number.isFinite(Number(item.price)) || Number(item.price) < 0)) {
    fail('Dòng hàng hoặc lịch sử thanh toán bị hỏng. Chưa ghi thu; cần kiểm tra chứng từ.', 409, 'payment_history_invalid');
  }
  if (['paid', 'void', 'cancelled'].includes(invoice.status)) fail('Hóa đơn đã thu đủ hoặc không còn được phép thu.', 409, 'payment_document_closed');
  const total = docGrand(invoice);
  const remaining = total - payments.reduce((sum, item) => sum + item.amount, 0);
  if (!integerAmount(total) || command.amount > remaining) fail('Số tiền thu vượt số còn lại. Hãy tải lại hóa đơn trước khi thanh toán.', 409, 'payment_exceeds_balance');
  const currency = invoice.currency || 'VND';
  const fxRate = currency === 'VND' ? 1 : Number(invoice.fxRate);
  if (!CURRENCIES[currency] || !Number.isFinite(fxRate) || fxRate <= 0) fail('Đồng tiền hoặc tỷ giá hóa đơn không hợp lệ.', 409, 'payment_currency_invalid');
  const date = command.date || new Date().toISOString().slice(0, 10);
  const full = command.amount === remaining;
  const changed = await tx.invoice.updateMany({
    where: {
      id: invoice.id, payments: invoice.payments, status: invoice.status,
      items: invoice.items, vat: invoice.vat, currency: invoice.currency, fxRate: invoice.fxRate,
      clientId: invoice.clientId, projectId: invoice.projectId, date: invoice.date, code: invoice.code, paidDate: invoice.paidDate,
    },
    data: {
      payments: JSON.stringify([...payments, { id: crypto.randomUUID(), amount: command.amount, currency, fxRate, date, note: command.note }]),
      status: full ? 'paid' : invoice.status === 'draft' ? 'sent' : invoice.status,
      paidDate: full ? date : null,
    },
  });
  if (changed.count !== 1) fail('Hóa đơn vừa thay đổi. Hãy thử lại cùng yêu cầu.', 409, 'payment_write_conflict');
  const record = await tx.invoice.findUnique({ where: { id: invoice.id } });
  const { client: _client, ...before } = invoice;
  return finalize(tx, command, record, {
    amount: command.amount, currency, fxRate, date, before,
    description: `Thu hóa đơn ${invoice.code} — ${invoice.client?.name || invoice.clientId}${command.note ? ` (${command.note})` : ''}`,
  });
}

async function settleVendor(tx, command) {
  const bill = await tx.vendorBill.findUnique({ where: { id: command.recordId }, include: { vendor: true } });
  if (!bill) fail('Không tìm thấy hóa đơn đầu vào.', 404, 'payment_record_not_found');
  if (bill.status === 'paid' || bill.paidDate) fail('Hóa đơn đầu vào đã được thanh toán.', 409, 'payment_document_closed');
  if (!integerAmount(bill.amount)) fail('Số tiền hóa đơn đầu vào không hợp lệ.', 409, 'payment_amount_invalid');
  if (command.approvalId) {
    const approval = await tx.approval.findUnique({ where: { id: command.approvalId } });
    if (!approval || approval.type !== 'vendorbill' || approval.refId !== bill.id || approval.status !== 'approved' || approval.amount !== bill.amount) {
      fail('Nội dung hóa đơn không khớp yêu cầu đã duyệt. Chưa ghi chi.', 409, 'payment_approval_stale');
    }
    const snapshot = JSON.parse(approval.payload || '{}').billSnapshot;
    if (snapshot && ['vendorId', 'projectId', 'amount', 'date', 'code'].some(key => snapshot[key] !== bill[key])) {
      fail('Thông tin hóa đơn đã thay đổi sau khi gửi duyệt. Chưa ghi chi.', 409, 'payment_approval_stale');
    }
  }
  if (!command.approvalId && !isDirector(command.actor)) {
    // Recheck inside the cash transaction: a concurrent bill edit must not
    // turn a below-threshold route check into an unapproved large payment.
    const settings = await tx.setting.findUnique({ where: { id: 1 } });
    const policy = JSON.parse(settings?.json || '{}');
    if (bill.amount >= (policy.approveExpenseOver ?? 10000000)) fail('Khoản chi cần được phê duyệt trước khi thanh toán.', 409, 'payment_approval_required');
  }
  const date = command.date || new Date().toISOString().slice(0, 10);
  const changed = await tx.vendorBill.updateMany({
    where: { id: bill.id, status: bill.status, paidDate: bill.paidDate, amount: bill.amount, vendorId: bill.vendorId, projectId: bill.projectId, date: bill.date, code: bill.code },
    data: { status: 'paid', paidDate: date },
  });
  if (changed.count !== 1) fail('Hóa đơn đầu vào vừa thay đổi. Hãy thử lại cùng yêu cầu.', 409, 'payment_write_conflict');
  const record = await tx.vendorBill.findUnique({ where: { id: bill.id } });
  const { vendor: _vendor, ...before } = bill;
  return finalize(tx, command, record, { amount: bill.amount, currency: 'VND', fxRate: 1, date, before, description: `Trả ${bill.vendor?.name || bill.vendorId} — ${bill.code}${bill.desc ? ` (${bill.desc})` : ''}` });
}

async function apply(tx, command) {
  const receipt = await tx.financialPaymentReceipt.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
  if (receipt) return replay(receipt, command);
  return command.resource === 'invoices' ? receiveInvoice(tx, command) : settleVendor(tx, command);
}

async function paymentTransaction(db, work) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try { return await db.$transaction(work, { isolationLevel: 'Serializable' }); }
    catch (error) {
      if (!['P2034', 'P2002', 'payment_write_conflict'].includes(error?.code)) throw error;
      if (attempt === 4) fail('Có thao tác thanh toán đồng thời. Hãy thử lại cùng yêu cầu.', 409, 'payment_write_conflict');
    }
  }
}

const execute = (db, command) => paymentTransaction(db, tx => apply(tx, command));

// Approval creation, auto-approval and payment share the same transaction.
// A failure cannot leave an approved request without its cash effect.
export function requestVendorPayment(db, user, input) {
  const command = normalize('vendorbills', user, input);
  const request = vendorPaymentRequest(user, command.recordId, input.idempotencyKey, command.date);
  return paymentTransaction(db, async tx => {
    const receipt = await tx.financialPaymentReceipt.findUnique({ where: { idempotencyKey: command.idempotencyKey } });
    if (receipt) return { payment: replay(receipt, command), pending: false, replayed: true };
    const previous = await tx.approval.findUnique({ where: { requestKey: request.requestKey } });
    if (previous) {
      if (JSON.parse(previous.payload || '{}').requestHash !== request.requestHash) fail('Key yêu cầu đã dùng cho nội dung khác.', 409, 'payment_idempotency_conflict');
      if (previous.status === 'rejected') fail('Yêu cầu này đã bị từ chối. Hãy tạo yêu cầu mới sau khi kiểm tra.', 409, 'payment_approval_rejected');
      if (previous.status !== 'approved') return { pending: true, approval: previous, replayed: true };
      const payment = await apply(tx, normalize('vendorbills', user, { recordId: previous.refId, date: JSON.parse(previous.payload || '{}').date, approvalId: previous.id, idempotencyKey: `approval_${previous.id}` }));
      return { pending: false, approval: previous, payment, replayed: true };
    }
    const bill = await tx.vendorBill.findUnique({ where: { id: command.recordId }, include: { vendor: true } });
    if (!bill) fail('Không tìm thấy hóa đơn đầu vào.', 404, 'payment_record_not_found');
    if (bill.status === 'paid' || bill.paidDate) fail('Hóa đơn đầu vào đã được thanh toán.', 409, 'payment_document_closed');
    if (!integerAmount(bill.amount)) fail('Số tiền hóa đơn đầu vào không hợp lệ.', 409, 'payment_amount_invalid');
    const setting = await tx.setting.findUnique({ where: { id: 1 } });
    const policy = JSON.parse(setting?.json || '{}');
    if (isDirector(user) || bill.amount < (policy.approveExpenseOver ?? 10000000)) {
      return { pending: false, payment: await apply(tx, command), replayed: false };
    }
    const existing = await tx.approval.findFirst({ where: { type: 'vendorbill', refId: bill.id, status: 'pending' } });
    if (existing) return { pending: true, approval: existing, replayed: true };
    const roles = rolesOf(user);
    const now = new Date();
    const steps = [{ role: 'ACCOUNTANT', label: 'Kế toán' }];
    if (bill.amount >= (policy.approveExpenseDirectorOver ?? 50000000)) steps.push({ role: 'DIRECTOR', label: 'Giám đốc' });
    const decisions = steps.map(step => roles.includes(step.role)
      ? { ...step, status: 'approved', byId: user.id, byName: user.name, at: now.toISOString(), note: 'Tự duyệt (người yêu cầu đảm nhiệm)' }
      : { ...step, status: 'pending' });
    const approved = decisions.every(step => step.status === 'approved');
    const approval = await tx.approval.create({ data: {
      type: 'vendorbill', refId: bill.id, requestKey: request.requestKey,
      title: `Duyệt trả ${bill.vendor?.name || bill.vendorId} — ${bill.code} (${moneyC(bill.amount)})`,
      amount: bill.amount, requesterId: user.id, requesterName: user.name || user.id,
      steps: JSON.stringify(decisions), status: approved ? 'approved' : 'pending', decidedAt: approved ? now : null,
      payload: JSON.stringify({ date: command.date, requestHash: request.requestHash, billSnapshot: { vendorId: bill.vendorId, projectId: bill.projectId, amount: bill.amount, date: bill.date, code: bill.code } }),
    } });
    await tx.auditLog.create({ data: { userId: user.id, userName: user.name || user.id, action: 'request', entity: 'approvals', refId: approval.id, detail: approval.title } });
    await enqueueEvent(tx, { resource: 'approvals', event: 'create', row: approval, user });
    if (!approved) return { pending: true, approval, replayed: false };
    const payment = await apply(tx, normalize('vendorbills', user, { recordId: bill.id, date: command.date, approvalId: approval.id, idempotencyKey: `approval_${approval.id}` }));
    return { pending: false, approval, payment, replayed: false };
  });
}

export const receiveInvoicePayment = (db, user, input) => execute(db, normalize('invoices', user, input));
export const settleVendorPayment = (db, user, input) => execute(db, normalize('vendorbills', user, input));
// The caller commits an approval decision and its cash effect in one transaction.
export const settleVendorPaymentInTransaction = (tx, user, input) => apply(tx, normalize('vendorbills', user, input));

export function financialPaymentResponse(error) {
  return error instanceof FinancialPaymentError
    ? { body: { error: error.message, code: error.code }, status: error.status }
    : { body: { error: 'Chưa xác nhận được kết quả thanh toán. Hãy thử lại cùng yêu cầu để kiểm tra an toàn.', code: 'payment_unavailable' }, status: 503 };
}
