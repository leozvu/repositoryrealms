export const state = { user: null, records: {}, calls: [], pendingApproval: null, conflictOnce: false, failModel: null, interceptor: null };

export function resetRecords(user, records = {}) {
  state.user = user;
  state.records = structuredClone(records);
  state.calls = [];
  state.pendingApproval = null;
  state.conflictOnce = false;
  state.failModel = null;
  state.interceptor = null;
}

export const currentUser = async () => state.user;
export const apiUser = async () => state.user;
export const resourceEnabled = async () => true;
export const interceptWrite = async (...args) => state.interceptor ? state.interceptor(...args) : null;
export const emitEvent = async () => {};

function applyData(row, data) {
  for (const [key, value] of Object.entries(data)) {
    if (value && typeof value === 'object' && Object.hasOwn(value, 'increment')) row[key] += value.increment;
    else row[key] = structuredClone(value);
  }
}

export const prisma = new Proxy({}, {
  get(_target, model) {
    if (model === '$transaction') return async callback => {
      const records = structuredClone(state.records), calls = structuredClone(state.calls);
      try { return await callback(prisma); }
      catch (error) { state.records = records; state.calls = calls; throw error; }
    };
    return {
      async findUnique({ where }) { return structuredClone(Object.values(state.records[model] || {}).find(row => Object.entries(where.occurrenceId_deliveryKey || where).every(([key, value]) => row[key] === value)) || null); },
      async findFirst() { return model === 'approval' ? state.pendingApproval : null; },
      async create({ data }) {
        if (state.failModel === model) throw new Error('Injected persistence failure');
        const id = data.id || `${model}-${state.calls.length + 1}`;
        const defaults = model === 'vendorBill' ? { status: 'pending' } : model === 'invoice' ? { status: 'draft' } : {};
        const row = { ...defaults, ...structuredClone(data), id };
        (state.records[model] ||= {})[id] = row;
        state.calls.push({ model, operation: 'create', data: structuredClone(data) });
        return row;
      },
      async upsert({ where, create, update }) {
        if (state.failModel === model) throw new Error('Injected persistence failure');
        const fields = where.occurrenceId_deliveryKey || where;
        const existing = Object.values(state.records[model] || {}).find(row => Object.entries(fields).every(([key, value]) => row[key] === value));
        if (existing) return prisma[model].update({ where: { id: existing.id }, data: update });
        return prisma[model].create({ data: create });
      },
      async createMany({ data, skipDuplicates }) {
        if (state.failModel === model) throw new Error('Injected persistence failure');
        let count = 0;
        for (const entry of data) {
          const duplicate = Object.values(state.records[model] || {}).some(row => row.id === entry.id || (model === 'eventOutbox' && row.occurrenceId === entry.occurrenceId && row.deliveryKey === entry.deliveryKey));
          if (duplicate && skipDuplicates) continue;
          if (duplicate) throw Object.assign(new Error('unique violation'), { code: 'P2002' });
          await prisma[model].create({ data: entry }); count++;
        }
        return { count };
      },
      async update({ where, data }) {
        const row = state.records[model][where.id];
        applyData(row, data);
        state.calls.push({ model, operation: 'update', data: structuredClone(data) });
        return structuredClone(row);
      },
      async updateMany({ where, data }) {
        if (state.conflictOnce) { state.conflictOnce = false; return { count: 0 }; }
        const rows = Object.values(state.records[model] || {}).filter(row => Object.entries(where).every(([key, value]) => row[key] === value));
        rows.forEach(row => applyData(row, data));
        if (rows.length) state.calls.push({ model, operation: 'updateMany', data: structuredClone(data) });
        return { count: rows.length };
      },
      async deleteMany({ where }) {
        if (state.conflictOnce) { state.conflictOnce = false; return { count: 0 }; }
        const rows = Object.values(state.records[model] || {}).filter(row => Object.entries(where).every(([key, value]) => row[key] === value));
        rows.forEach(row => { delete state.records[model][row.id]; });
        if (rows.length) state.calls.push({ model, operation: 'deleteMany' });
        return { count: rows.length };
      },
      async delete({ where }) {
        const row = state.records[model][where.id];
        delete state.records[model][where.id];
        state.calls.push({ model, operation: 'delete', id: where.id });
        return row;
      },
    };
  },
});
