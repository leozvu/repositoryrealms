export const state = { user: null, records: {}, writes: [] };
export function resetPayroll(records, user = { id: 'hr', name: 'HR', roles: ['HR'] }) {
  state.user = user; state.records = structuredClone(records); state.writes = [];
}
export const currentUser = async () => state.user;
const matches = (row, where = {}) => Object.entries(where).every(([key, expected]) => {
  if (expected && typeof expected === 'object') return Object.entries(expected).every(([op, value]) => op === 'not' ? row[key] !== value : op === 'gte' ? row[key] >= value : op === 'lte' ? row[key] <= value : false);
  return row[key] === expected;
});
export const prisma = new Proxy({}, { get(_target, model) {
  if (model === '$transaction') return async writes => Promise.all(writes);
  return {
    async findUnique({ where }) { return structuredClone(Object.values(state.records[model] || {}).find(row => matches(row, where)) || null); },
    async findMany({ where } = {}) { return structuredClone(Object.values(state.records[model] || {}).filter(row => matches(row, where))); },
    async create({ data }) {
      const id = data.id || `${model}-${state.writes.length}`;
      const row = { ...(model === 'payroll' ? { status: 'draft' } : {}), ...structuredClone(data), id };
      (state.records[model] ||= {})[id] = row; state.writes.push({ model, operation: 'create', data }); return row;
    },
    async update({ where, data }) { Object.assign(state.records[model][where.id], structuredClone(data)); state.writes.push({ model, operation: 'update', data }); return structuredClone(state.records[model][where.id]); },
  };
} });
