// Minimal Prisma read boundary. This executes the real board, registry and
// collection contracts; it is not evidence of PostgreSQL isolation behaviour.
export function createLeadBoardDb(rows = [], settings = {}, onQuery) {
  const data = { lead: structuredClone(rows), settings: typeof settings === 'string' ? settings : JSON.stringify(settings) };
  const calls = [], transactions = [];
  function matches(row, where = {}) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'AND') return value.every(item => matches(row, item));
      if (key === 'OR') return value.some(item => matches(row, item));
      if (value && typeof value === 'object') return Object.entries(value).every(([operator, operand]) => {
        if (operator === 'notIn') return row[key] !== null && !operand.includes(row[key]);
        if (operator === 'startsWith') return typeof row[key] === 'string' && row[key].startsWith(operand);
        throw new Error('Unsupported query operator: ' + operator);
      });
      return (row[key] ?? null) === value;
    });
  }
  function boundary(source, transaction) {
    const record = (model, operation, args) => {
      calls.push({ model, operation, transaction, args: structuredClone(args) });
      onQuery?.({ data, model, operation, transaction, args });
    };
    return {
      lead: {
        async findMany(args) {
          record('lead', 'findMany', args);
          const order = Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy].filter(Boolean);
          let selected = source.lead.filter(row => matches(row, args.where)).sort((a, b) => {
            for (const clause of order) for (const [key, direction] of Object.entries(clause)) {
              const left = a[key], right = b[key];
              const compared = left == null ? (right == null ? 0 : 1) : right == null ? -1 : left < right ? -1 : left > right ? 1 : 0;
              if (compared) return direction === 'desc' ? -compared : compared;
            }
            return 0;
          });
          if (args.cursor) {
            const anchor = selected.findIndex(row => row.id === args.cursor.id);
            selected = anchor < 0 ? [] : selected.slice(anchor + (args.skip ?? 0));
          }
          return structuredClone(selected.slice(0, args.take));
        },
        async findFirst(args) {
          record('lead', 'findFirst', args);
          const row = source.lead.find(row => matches(row, args.where));
          return row ? { id: row.id } : null;
        },
        async count(args) { record('lead', 'count', args); return source.lead.filter(row => matches(row, args.where)).length; },
        async groupBy(args) {
          record('lead', 'groupBy', args);
          const grouped = new Map();
          for (const row of source.lead.filter(row => matches(row, args.where))) {
            const key = JSON.stringify(args.by.map(field => row[field] ?? null));
            const item = grouped.get(key) ?? { ...Object.fromEntries(args.by.map(field => [field, row[field] ?? null])), _count: { _all: 0 }, _sum: { value: 0 } };
            item._count._all++; item._sum.value += row.value ?? 0; grouped.set(key, item);
          }
          return [...grouped.values()];
        },
      },
      setting: { async findUnique(args) { record('setting', 'findUnique', args); return { json: source.settings }; } },
    };
  }
  const db = { ...boundary(data, null), async $transaction(run, options) {
    transactions.push(structuredClone(options));
    return run(boundary(structuredClone(data), transactions.length));
  } };
  return { db, data, calls, transactions };
}
