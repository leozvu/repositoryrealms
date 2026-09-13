import { hasAny } from './perm.js';

// These records expose scalar business fields only. Prisma relation writes and
// update operators must not become a second route around authorization.
export function pickRecordFields(data, fields) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return {};
  return Object.fromEntries(fields.filter(key => Object.hasOwn(data, key)).map(key => [key, data[key]]));
}

export function scalarRecordError(data) {
  return Object.values(data).some(value => value !== null && typeof value === 'object')
    ? 'Dữ liệu cập nhật phải dùng giá trị trực tiếp, không nhận lệnh cập nhật hoặc quan hệ lồng nhau.' : null;
}

const REVIEW_FIELDS = ['userId', 'quarter', 'scores', 'selfNote', 'mgrNote', 'status'];
const LEAVE_FIELDS = ['userId', 'from', 'to', 'type', 'status', 'note'];
const INVOICE_FIELDS = ['code', 'clientId', 'projectId', 'items', 'vat', 'status', 'date', 'dueDate', 'recurring', 'recGroup', 'currency', 'fxRate'];
const BILL_FIELDS = ['code', 'vendorId', 'projectId', 'desc', 'amount', 'date', 'dueDate', 'status'];
const TRANSACTION_FIELDS = ['type', 'category', 'amount', 'currency', 'fxRate', 'date', 'desc', 'projectId'];
const INVOICE_VALUE_FIELDS = ['code', 'clientId', 'projectId', 'items', 'vat', 'date', 'currency', 'fxRate'];
const BILL_VALUE_FIELDS = ['code', 'vendorId', 'projectId', 'amount', 'date'];
const manager = user => hasAny(user, ['HR', 'PM', 'LEAD']);

function selfScores(value, previous = '[]') {
  try {
    const submitted = JSON.parse(value);
    const existing = JSON.parse(previous || '[]');
    if (!Array.isArray(submitted) || !Array.isArray(existing)) return previous;
    const base = existing.length ? existing : submitted;
    return JSON.stringify(base.filter(item => item && typeof item.name === 'string').map(item => {
      const input = submitted.find(candidate => candidate?.name === item.name);
      const self = Number(input?.self);
      return { name: item.name, self: Number.isInteger(self) && self >= 0 && self <= 5 ? self : (item.self || 0), mgr: existing.length ? (item.mgr || 0) : 0 };
    }));
  } catch { return previous; }
}

export function createReviewData(data, user) {
  const safe = pickRecordFields(data, REVIEW_FIELDS);
  if (manager(user)) return safe;
  return {
    ...pickRecordFields(safe, ['quarter', 'selfNote']), userId: user.id, status: 'pending',
    scores: selfScores(safe.scores || '[]'),
  };
}

export function updateReviewData(data, user, existing = {}) {
  if (manager(user)) return pickRecordFields(data, REVIEW_FIELDS);
  const safe = pickRecordFields(data, ['scores', 'selfNote']);
  if (Object.hasOwn(safe, 'scores')) safe.scores = selfScores(safe.scores, existing.scores);
  return { ...safe, status: 'self_done' };
}

export function createLeaveData(data, user) {
  const safe = pickRecordFields(data, LEAVE_FIELDS);
  return hasAny(user, ['HR']) ? { ...safe, status: safe.status || 'pending' }
    : { ...pickRecordFields(safe, ['from', 'to', 'type', 'note']), userId: user.id, status: 'pending' };
}

export function updateLeaveData(data, user) {
  return pickRecordFields(data, hasAny(user, ['HR']) ? LEAVE_FIELDS : ['from', 'to', 'type', 'note']);
}

export const createInvoiceData = data => ({ ...pickRecordFields(data, INVOICE_FIELDS), payments: '[]', paidDate: null });
export const updateInvoiceData = data => pickRecordFields(data, INVOICE_FIELDS);
export const createVendorBillData = data => ({ ...pickRecordFields(data, BILL_FIELDS), paidDate: null });
export const updateVendorBillData = data => pickRecordFields(data, BILL_FIELDS);
export const reviewWriteWhere = row => pickRecordFields(row, ['id', ...REVIEW_FIELDS]);
export const leaveWriteWhere = row => pickRecordFields(row, ['id', ...LEAVE_FIELDS]);
export const invoiceWriteWhere = row => pickRecordFields(row, ['id', 'payments', 'paidDate', 'status', ...INVOICE_VALUE_FIELDS]);
export const vendorBillWriteWhere = row => pickRecordFields(row, ['id', 'status', 'paidDate', ...BILL_VALUE_FIELDS]);
export const createTransactionData = (data, user) => ({ ...pickRecordFields(data, TRANSACTION_FIELDS), createdById: user.id });
export const updateTransactionData = data => pickRecordFields(data, TRANSACTION_FIELDS);
export const canChangeCashEntry = async (row, _user, db) => !(await db.financialPaymentReceipt.findUnique({ where: { transactionId: row.id } }));

export function invoiceHasPayments(row) {
  if (!row) return false;
  if (row.status === 'paid' || row.paidDate) return true;
  try {
    const payments = JSON.parse(row.payments || '[]');
    return !Array.isArray(payments) || payments.length > 0;
  } catch { return true; } // Corrupt history must not be treated as unpaid.
}

const changed = (row, data, keys) => keys.some(key => Object.hasOwn(data, key) && data[key] !== row[key]);

export function validateInvoiceWrite(row, data) {
  const error = scalarRecordError(data);
  if (error) return error;
  if (Object.hasOwn(data, 'status')) {
    const allowed = row?.status === 'paid' ? ['paid'] : invoiceHasPayments(row) ? ['sent', 'overdue'] : ['draft', 'sent', 'overdue'];
    if (!allowed.includes(data.status)) return 'Trạng thái đã thu chỉ được cập nhật qua thao tác ghi nhận thanh toán.';
  }
  if (invoiceHasPayments(row) && changed(row, data, INVOICE_VALUE_FIELDS)) {
    return 'Hóa đơn đã có lịch sử thu: không được đổi khách hàng, giá trị, đồng tiền hoặc thông tin ghi sổ. Cần xử lý điều chỉnh qua kế toán.';
  }
  return null;
}

export async function validateVendorBillWrite(row, data, db) {
  const error = scalarRecordError(data);
  if (error) return error;
  if (Object.hasOwn(data, 'status') && data.status !== (row?.status || 'pending')) {
    return 'Trạng thái hóa đơn đầu vào chỉ được cập nhật qua quy trình phê duyệt và thanh toán.';
  }
  if (!row || !changed(row, data, BILL_VALUE_FIELDS)) return null;
  const locked = row.status === 'paid' || row.status === 'approved' || row.paidDate;
  const pending = !locked && await db.approval.findFirst({ where: { type: 'vendorbill', refId: row.id, status: 'pending' } });
  if (locked || pending) return 'Hóa đơn đang chờ duyệt hoặc đã thanh toán: không được đổi nhà cung cấp, số tiền hoặc thông tin ghi sổ.';
  return null;
}
