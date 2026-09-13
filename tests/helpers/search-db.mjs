export function createSearchDb(records = {}, modules = null) {
  const calls = [];
  const data = structuredClone(records);
  function matches(row, where) {
    return Object.entries(where).every(([key, value]) => {
      if (key === 'AND') return value.every(condition => matches(row, condition));
      if (key === 'OR') return value.some(condition => matches(row, condition));
      if (value && typeof value === 'object') {
        if ('gt' in value) return row[key] > value.gt;
        if ('contains' in value) return String(row[key] ?? '').toLowerCase().includes(value.contains.replace(/\\([\\%_])/g, '$1').toLowerCase());
      }
      return row[key] === value;
    });
  }
  const db = new Proxy({}, { get(_target, model) { return {
    async findUnique(args) { calls.push({ model, ...args }); return model === 'setting' ? { json: JSON.stringify({ modules }) } : null; },
    async findMany(args) {
      calls.push({ model, ...structuredClone(args) });
      return (data[model] || []).filter(row => matches(row, args.where)).sort((a, b) => a.id.localeCompare(b.id)).slice(0, args.take)
        .map(row => Object.fromEntries(Object.keys(args.select).filter(key => Object.hasOwn(row, key)).map(key => [key, row[key]])));
    },
  }; } });
  return { db, calls, data };
}
