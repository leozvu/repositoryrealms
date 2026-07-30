function scalarMatches(actual, expected) {
  if (expected && typeof expected === 'object' && !Array.isArray(expected) && !(expected instanceof Date)) {
    if ('in' in expected && !expected.in.includes(actual)) return false;
    if ('lt' in expected && !(new Date(actual) < new Date(expected.lt))) return false;
    if ('lte' in expected && !(new Date(actual) <= new Date(expected.lte))) return false;
    return true;
  }
  return actual === expected;
}

function matches(row, where = {}) {
  if (where.OR && !where.OR.some(condition => matches(row, condition))) return false;
  return Object.entries(where).every(([field, expected]) => field === 'OR' || scalarMatches(row[field], expected));
}

function updateRow(row, data) {
  for (const [field, value] of Object.entries(data)) {
    row[field] = value && typeof value === 'object' && 'increment' in value
      ? Number(row[field] || 0) + Number(value.increment)
      : value;
  }
  return row;
}

function ordered(rows, orderBy) {
  const orders = Array.isArray(orderBy) ? orderBy : orderBy ? [orderBy] : [];
  return [...rows].sort((left, right) => {
    for (const order of orders) {
      const [field, direction] = Object.entries(order)[0];
      const a = left[field] instanceof Date ? left[field].getTime() : left[field];
      const b = right[field] instanceof Date ? right[field].getTime() : right[field];
      if (a === b) continue;
      return (a < b ? -1 : 1) * (direction === 'desc' ? -1 : 1);
    }
    return 0;
  });
}

export function createCommandDb(seed = {}) {
  const state = {
    proposals: structuredClone(seed.proposals || []),
    reviews: structuredClone(seed.reviews || []),
    intents: structuredClone(seed.intents || []),
    events: structuredClone(seed.events || []),
    jobs: structuredClone(seed.jobs || []),
    runtimes: structuredClone(seed.runtimes || []),
    quotas: structuredClone(seed.quotas || []),
    leads: structuredClone(seed.leads || []),
    receipts: structuredClone(seed.receipts || []),
    users: structuredClone(seed.users || []),
    activities: structuredClone(seed.activities || []),
    audits: structuredClone(seed.audits || []),
    notifications: structuredClone(seed.notifications || []),
    sequence: 0,
  };

  const create = (collection, prefix, data) => {
    const row = {
      id: data.id || `${prefix}_${++state.sequence}`,
      createdAt: data.createdAt || new Date(),
      ...data,
    };
    state[collection].push(row);
    return row;
  };
  const findUnique = collection => async ({ where }) => state[collection].find(row => matches(row, where)) || null;
  const findMany = collection => async ({ where = {}, orderBy, take } = {}) => {
    const rows = ordered(state[collection].filter(row => matches(row, where)), orderBy);
    return Number.isInteger(take) ? rows.slice(0, take) : rows;
  };
  const updateMany = collection => async ({ where, data }) => {
    const rows = state[collection].filter(row => matches(row, where));
    rows.forEach(row => updateRow(row, data));
    return { count: rows.length };
  };

  const leozOpsActionProposal = {
    findUnique: findUnique('proposals'),
    findMany: findMany('proposals'),
  };
  const leozOpsProposalReview = {
    findUnique: findUnique('reviews'),
    findMany: findMany('reviews'),
  };
  const leozOpsCommandIntent = {
    findUnique: findUnique('intents'),
    findMany: findMany('intents'),
    updateMany: updateMany('intents'),
    async create({ data }) {
      if (state.intents.some(row => row.idempotencyKeyHash === data.idempotencyKeyHash
        || row.correlationId === data.correlationId || row.repositoryIdempotencyKey === data.repositoryIdempotencyKey)) {
        const error = new Error('unique constraint'); error.code = 'P2002'; throw error;
      }
      return create('intents', 'intent', {
        confirmedById: null, confirmedAt: null, repositoryReceiptId: null,
        lastErrorCode: null, budgetConsumedAt: null, ...data,
      });
    },
  };
  const leozOpsCommandEvent = {
    findMany: findMany('events'),
    async create({ data }) { return create('events', 'event', data); },
  };
  const leozOpsCommandJob = {
    findMany: findMany('jobs'),
    updateMany: updateMany('jobs'),
    async create({ data }) {
      if (state.jobs.some(row => row.intentId === data.intentId && row.kind === data.kind)) {
        const error = new Error('unique constraint'); error.code = 'P2002'; throw error;
      }
      return create('jobs', 'job', {
        status: 'pending', attemptCount: 0, maxAttempts: 5,
        lockToken: null, lockedAt: null, lastErrorCode: null, ...data,
      });
    },
  };
  const leozOpsRuntimeControl = {
    findUnique: findUnique('runtimes'),
    updateMany: updateMany('runtimes'),
    async create({ data }) { return create('runtimes', 'runtime', data); },
    async update({ where, data }) {
      const row = state.runtimes.find(item => matches(item, where));
      if (!row) throw new Error('runtime missing');
      return updateRow(row, data);
    },
  };
  const leozOpsQuotaBucket = {
    async upsert({ where, create: createData, update }) {
      let row = state.quotas.find(item => matches(item, where));
      if (row) return updateRow(row, update);
      row = { createdAt: new Date(), ...createData };
      state.quotas.push(row);
      return row;
    },
    async deleteMany({ where }) {
      const before = state.quotas.length;
      state.quotas = state.quotas.filter(row => !matches(row, where));
      return { count: before - state.quotas.length };
    },
  };
  const lead = {
    findUnique: findUnique('leads'),
    updateMany: updateMany('leads'),
  };
  const realmActionReceipt = {
    findUnique: findUnique('receipts'),
    async create({ data }) {
      if (state.receipts.some(row => row.idempotencyKey === data.idempotencyKey)) {
        const error = new Error('unique constraint'); error.code = 'P2002'; throw error;
      }
      return create('receipts', 'receipt', data);
    },
  };
  const activity = { async create({ data }) { return create('activities', 'activity', data); } };
  const auditLog = { async create({ data }) { return create('audits', 'audit', data); } };
  const notification = { async create({ data }) { return create('notifications', 'notification', data); } };
  const user = { findUnique: findUnique('users') };

  const db = {
    leozOpsActionProposal, leozOpsProposalReview, leozOpsCommandIntent,
    leozOpsCommandEvent, leozOpsCommandJob, leozOpsRuntimeControl,
    leozOpsQuotaBucket, lead, realmActionReceipt, activity, auditLog,
    notification, user,
    async $transaction(work) {
      const snapshot = structuredClone(state);
      try { return await work(db); }
      catch (error) {
        for (const key of Object.keys(state)) state[key] = snapshot[key];
        throw error;
      }
    },
  };
  return { db, state };
}
