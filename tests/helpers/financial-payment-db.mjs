// Deterministic transaction model: concurrent snapshots conflict at commit,
// matching Serializable retry behavior. Production Prisma is never imported.
export function createPaymentDb(records = {}, hooks = {}) {
  let state = { invoice: [], vendorBill: [], approval: [], transaction: [], financialPaymentReceipt: [], auditLog: [], eventOutbox: [], setting: [], ...structuredClone(records) };
  let revision = 0;
  const stats = { conflicts: 0, transactions: 0, casMisses: 0 };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => row[key] === value);
  function model(db, name, dirty) {
    return {
      async findUnique({ where }) { return structuredClone(db[name].find(row => matches(row, where)) || null); },
      async findFirst({ where }) { return structuredClone(db[name].find(row => matches(row, where)) || null); },
      async upsert({ where, create }) {
        if (hooks.outboxFailureOnce && name === 'eventOutbox') { hooks.outboxFailureOnce = false; throw new Error('outbox storage failure'); }
        const existing = db[name].find(row => matches(row, where.occurrenceId_deliveryKey || where));
        if (existing) return structuredClone(existing);
        const row = { id: `${name}-${db[name].length + 1}`, ...structuredClone(create) };
        db[name].push(row);
        dirty.value = true;
        return structuredClone(row);
      },
      async updateMany({ where, data }) {
        if (hooks.casMissOnce && ['invoice', 'vendorBill'].includes(name)) { hooks.casMissOnce = false; stats.casMisses += 1; return { count: 0 }; }
        const rows = db[name].filter(row => matches(row, where));
        rows.forEach(row => Object.assign(row, structuredClone(data)));
        if (rows.length) dirty.value = true;
        return { count: rows.length };
      },
      async create({ data }) {
        if (hooks.receiptFailureOnce && name === 'financialPaymentReceipt') { hooks.receiptFailureOnce = false; throw new Error('receipt storage failure'); }
        if (name === 'financialPaymentReceipt' && db[name].some(row => row.idempotencyKey === data.idempotencyKey || row.transactionId === data.transactionId)) throw Object.assign(new Error('unique violation'), { code: 'P2002' });
        const row = { id: `${name}-${db[name].length + 1}`, ...structuredClone(data) };
        db[name].push(row);
        dirty.value = true;
        return structuredClone(row);
      },
    };
  }
  const db = {
    async $transaction(callback, options) {
      if (options?.isolationLevel !== 'Serializable') throw new Error('Payment transaction must request Serializable');
      stats.transactions += 1;
      const start = revision;
      const snapshot = structuredClone(state);
      const dirty = { value: false };
      const tx = Object.fromEntries(Object.keys(snapshot).map(name => [name, model(snapshot, name, dirty)]));
      const result = await callback(tx);
      if (dirty.value && start !== revision) { stats.conflicts += 1; throw Object.assign(new Error('concurrent commit'), { code: 'P2034' }); }
      if (dirty.value) { state = snapshot; revision += 1; }
      return result;
    },
  };
  return { db, stats, state: () => structuredClone(state) };
}

export const INVOICE = {
  id: 'invoice-1', code: 'INV-1', clientId: 'client-1', client: { name: 'Client' }, projectId: null,
  items: '[{"desc":"Service","qty":1,"price":100}]', vat: 0, date: '2026-09-01',
  status: 'sent', payments: '[]', paidDate: null, currency: 'USD', fxRate: 25000,
};
export const BILL = { id: 'bill-1', code: 'BILL-1', vendorId: 'vendor-1', vendor: { name: 'Vendor' }, projectId: null, amount: 100000, date: '2026-09-01', status: 'pending', paidDate: null };
