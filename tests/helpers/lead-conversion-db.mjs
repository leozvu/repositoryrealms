// Transaction snapshots exercise rollback and Serializable retry without a DB.
export function createLeadConversionDb(leads = [], hooks = {}) {
  let state = { lead: structuredClone(leads), client: [], auditLog: [], eventOutbox: [] };
  let revision = 0;
  const stats = { conflicts: 0, transactions: 0, casMisses: 0 };
  const matches = (row, where) => Object.entries(where).every(([key, value]) => key === 'occurrenceId_deliveryKey' ? matches(row, value) : value === undefined || row[key] === value);
  const db = {
    async $transaction(callback, options) {
      if (options?.isolationLevel !== 'Serializable') throw new Error('Conversion requires Serializable');
      stats.transactions++;
      const start = revision;
      const snapshot = structuredClone(state);
      let dirty = false;
      const tx = Object.fromEntries(Object.keys(snapshot).map(name => [name, {
        async findUnique({ where }) { return structuredClone(snapshot[name].find(row => matches(row, where)) || null); },
        async create({ data }) {
          if (name === 'auditLog' && hooks.auditFailureOnce) { hooks.auditFailureOnce = false; throw new Error('audit storage failed'); }
          if (name === 'client' && hooks.reassignOnce) { hooks.reassignOnce = false; state.lead[0].ownerId = 'another-am'; revision++; }
          const row = { id: `${name}-${snapshot[name].length + 1}`, ...structuredClone(data) };
          snapshot[name].push(row); dirty = true; return structuredClone(row);
        },
        async createMany({ data, skipDuplicates }) {
          if (hooks.outboxFailureOnce) { hooks.outboxFailureOnce = false; throw new Error('outbox storage failed'); }
          let count = 0;
          for (const entry of data) {
            const duplicate = snapshot[name].some(row => row.id === entry.id || (name === 'eventOutbox' && row.occurrenceId === entry.occurrenceId && row.deliveryKey === entry.deliveryKey));
            if (duplicate && skipDuplicates) continue;
            if (duplicate) throw Object.assign(new Error('unique violation'), { code: 'P2002' });
            snapshot[name].push(structuredClone(entry)); count++;
          }
          dirty ||= count > 0;
          return { count };
        },
        async updateMany({ where, data }) {
          if (hooks.casMissOnce) { hooks.casMissOnce = false; stats.casMisses++; return { count: 0 }; }
          const rows = snapshot[name].filter(row => matches(row, where));
          rows.forEach(row => Object.assign(row, structuredClone(data)));
          dirty ||= rows.length > 0;
          return { count: rows.length };
        },
      }]));
      const result = await callback(tx);
      if (dirty && revision !== start) { stats.conflicts++; throw Object.assign(new Error('concurrent commit'), { code: 'P2034' }); }
      if (dirty) { state = snapshot; revision++; }
      return result;
    },
  };
  return { db, stats, state: () => structuredClone(state) };
}

export const WON_LEAD = {
  id: 'lead-1', name: 'Mai', company: 'Acme', email: 'mai@example.test', phone: '0900000000',
  stage: 'won', ownerId: 'am-1', source: 'Facebook', campaign: 'Spring launch', serviceLine: 'Seeding',
  note: 'Ghi chú khách hàng', value: 50_000_000, clientId: null, convertedAt: null, convertedById: null,
};
