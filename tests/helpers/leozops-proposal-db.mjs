export function createProposalDb() {
  const state = { proposals: [], audits: [], sequence: 0 };

  const model = {
    async findUnique({ where }) {
      const [field, value] = Object.entries(where)[0] || [];
      return state.proposals.find(row => row[field] === value) || null;
    },
    async create({ data }) {
      const duplicate = state.proposals.some(row =>
        row.idempotencyKeyHash === data.idempotencyKeyHash || row.correlationId === data.correlationId);
      if (duplicate) {
        const error = new Error('unique constraint');
        error.code = 'P2002';
        throw error;
      }
      const row = { id: `proposal_${++state.sequence}`, ...data };
      state.proposals.push(row);
      return row;
    },
    async findMany({ where, orderBy, take }) {
      let rows = state.proposals.filter(row =>
        Object.entries(where).every(([field, value]) => row[field] === value));
      if (orderBy?.createdAt === 'desc') {
        rows = rows.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      }
      return rows.slice(0, take);
    },
  };

  const auditLog = {
    async create({ data }) {
      const row = { id: `audit_${state.audits.length + 1}`, ...data };
      state.audits.push(row);
      return row;
    },
  };

  const db = {
    leozOpsActionProposal: model,
    auditLog,
    async $transaction(work) {
      const proposals = state.proposals.map(row => ({ ...row }));
      const audits = state.audits.map(row => ({ ...row }));
      const sequence = state.sequence;
      try {
        return await work({ leozOpsActionProposal: model, auditLog });
      } catch (error) {
        state.proposals.splice(0, state.proposals.length, ...proposals);
        state.audits.splice(0, state.audits.length, ...audits);
        state.sequence = sequence;
        throw error;
      }
    },
  };

  return { db, state };
}
