const copy = value => structuredClone(value);
function matches(row, where = {}) {
  return Object.entries(where).every(([key, value]) => {
    if (key === 'OR') return value.some(part => matches(row, part));
    if (key === 'AND') return value.every(part => matches(row, part));
    const actual = row[key];
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      return Object.entries(value).every(([op, expected]) => ({
        lte: () => actual <= expected, lt: () => actual < expected,
        gt: () => actual > expected, gte: () => actual >= expected,
        in: () => expected.includes(actual), equals: () => actual === expected,
      })[op]?.());
    }
    return actual instanceof Date && value instanceof Date ? +actual === +value : actual === value;
  });
}
export function createOutboxMemoryDB(seed = {}) {
  let state = Object.fromEntries(['eventOutbox', 'task', 'notification', 'auditLog', 'realmChangeEvent', 'rule', 'webhook', 'user', 'onboarding', 'message', 'conversation', 'project', 'lead', 'setting', 'realmGoldEntry', 'taskEvent'].map(name => [name, copy(seed[name] || [])]));
  let sequence = 0;
  const db = { fail: null, rows: name => copy(state[name]), seed: (name, rows) => { state[name] = copy(rows); } };
  const fail = (model, method, args) => { if (db.fail?.(model, method, args)) throw new Error('secret=https://sensitive.invalid?token=private'); };
  for (const name of Object.keys(state)) {
    const create = args => {
      const row = { id: `${name}-${++sequence}`, createdAt: new Date(), ...copy(args.data) };
      state[name].push(row);
      return copy(row);
    };
    db[name] = {
      async create(args) { fail(name, 'create', args); return create(args); },
      async createMany(args) { fail(name, 'createMany', args); args.data.forEach(data => create({ data })); return { count: args.data.length }; },
      async upsert(args) {
        fail(name, 'upsert', args);
        const key = args.where.occurrenceId_deliveryKey;
        const found = state[name].find(row => key ? row.occurrenceId === key.occurrenceId && row.deliveryKey === key.deliveryKey : matches(row, args.where));
        return found ? copy(found) : create({ data: args.create });
      },
      async findUnique(args) { fail(name, 'findUnique', args); return copy(state[name].find(row => matches(row, args.where)) || null); },
      async findFirst(args = {}) { return this.findUnique({ where: args.where }); },
      async findMany(args = {}) {
        fail(name, 'findMany', args);
        let rows = state[name].filter(row => matches(row, args.where));
        const order = args.orderBy ? (Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) : [];
        rows = [...rows].sort((a, b) => {
          for (const part of order) for (const [key, dir] of Object.entries(part)) {
            if (a[key] !== b[key]) { const result = a[key] < b[key] ? -1 : a[key] > b[key] ? 1 : 0; if (result) return dir === 'desc' ? -result : result; }
          }
          return 0;
        });
        return copy(rows.slice(0, args.take ?? rows.length));
      },
      async updateMany(args) {
        fail(name, 'updateMany', args);
        const rows = state[name].filter(row => matches(row, args.where));
        for (const row of rows) for (const [key, value] of Object.entries(args.data)) row[key] = value?.increment ? row[key] + value.increment : copy(value);
        return { count: rows.length };
      },
      async update(args) { await this.updateMany(args); return this.findUnique({ where: args.where }); },
      async deleteMany(args) { const rows = state[name].filter(row => !matches(row, args.where)); const count = state[name].length - rows.length; state[name] = rows; return { count }; },
    };
  }
  db.$transaction = async callback => {
    const before = copy(state);
    try { return await callback(db); } catch (error) { state = before; throw error; }
  };
  return db;
}
