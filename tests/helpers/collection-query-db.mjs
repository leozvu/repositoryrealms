// In-memory query boundary for collection behavior tests. PostgreSQL integration
// separately verifies cursor/null ordering against Prisma and the actual schema.
export function createCollectionDb(records = {}) {
  const data = structuredClone(records);
  const calls = [];
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'AND') return value.every(item => matches(row, item));
      if (key === 'OR') return value.some(item => matches(row, item));
      if (value && typeof value === 'object') {
        if ('in' in value) return value.in.includes(row[key]);
        return matches(row[key] || {}, value);
      }
      return (row[key] ?? null) === value;
    });
  }
  function sorted(rows, orderBy = []) {
    const order = Array.isArray(orderBy) ? orderBy : [orderBy];
    return rows.sort((a, b) => {
      for (const clause of order) {
        for (const [key, direction] of Object.entries(clause)) {
          const left = a[key] ?? null, right = b[key] ?? null;
          const compare = left === right ? 0 : left === null ? 1 : right === null ? -1 : left < right ? -1 : left > right ? 1 : 0;
          if (compare) return direction === 'desc' ? -compare : compare;
        }
      }
      return 0;
    });
  }
  const project = (row, select) => select ? Object.fromEntries(Object.keys(select).filter(key => select[key]).map(key => [key, row[key]])) : row;
  const db = new Proxy({}, { get(_target, model) { return {
    async findFirst(args) {
      calls.push({ model, operation: 'findFirst', ...structuredClone(args) });
      const row = (data[model] || []).find(row => matches(row, args.where));
      return row ? structuredClone(project(row, args.select)) : null;
    },
    async findMany(args) {
      calls.push({ model, operation: 'findMany', ...structuredClone(args) });
      let rows = sorted((data[model] || []).filter(row => matches(row, args.where)), args.orderBy);
      if (args.cursor) {
        const index = rows.findIndex(row => row.id === args.cursor.id);
        rows = index < 0 ? [] : rows.slice(index + (args.skip || 0));
      }
      return structuredClone(rows.slice(0, args.take).map(row => project(row, args.select)));
    },
  }; } });
  return { db, calls, data };
}
