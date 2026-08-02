export const CEO_DECISION_FEED_CONTRACT = 'repositoryrealms.ceo.decision-feed';
export const CEO_DECISION_QUEUE_CONTRACT = 'repositoryrealms.ceo.decision-queue';
export const CEO_DECISION_QUEUE_VERSION = 1;
export const CEO_DECISION_FETCH_TIMEOUT_MS = 5_000;
export const CEO_DECISION_MAX_ITEMS = 100;
export const CEO_DECISION_MAX_BYTES = 256 * 1024;

const CLASS_BY_TYPE = Object.freeze({
  expense: 'finance', vendorbill: 'finance', quote: 'finance', realm_redemption: 'finance',
  leave: 'people', task_handoff: 'operations',
  realm_launch: 'governance', ceo_request: 'governance',
});
const SLA_HOURS = Object.freeze({ finance: 4, governance: 8, operations: 12, people: 24 });
const URGENCY_ORDER = Object.freeze({ critical: 0, warning: 1, normal: 2 });

export class CeoDecisionQueueError extends Error {
  constructor(message, status = 400, code = 'ceo_decision_queue_invalid') {
    super(message);
    this.name = 'CeoDecisionQueueError';
    this.status = status;
    this.code = code;
  }
}

function clean(value, field, max = 160) {
  const text = String(value || '').replace(/[\u0000-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim();
  if (!text || text.length > max) throw new CeoDecisionQueueError(`${field} is invalid.`, 502, `ceo_decision_${field}_invalid`);
  return text;
}

function safeDate(value, field) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) throw new CeoDecisionQueueError(`${field} is invalid.`, 502, `ceo_decision_${field}_invalid`);
  return date;
}

function safeAmount(value) {
  const amount = Number(value || 0);
  if (!Number.isSafeInteger(amount) || amount < 0) throw new CeoDecisionQueueError('amount is invalid.', 502, 'ceo_decision_amount_invalid');
  return amount;
}

function pendingStep(raw) {
  let steps = [];
  try { steps = Array.isArray(raw) ? raw : JSON.parse(raw || '[]'); } catch {}
  const step = steps.find((item) => item && item.status === 'pending');
  if (!step) return null;
  return {
    role: clean(step.role || 'REVIEWER', 'step_role', 40),
    label: clean(step.label || step.role || 'Reviewer', 'step_label', 100),
  };
}

function decisionClass(type) {
  return CLASS_BY_TYPE[type] || 'governance';
}

function recordPath(id) {
  return `/approvals?focus=${encodeURIComponent(id)}&from=ceo-terminal`;
}

export function buildLocalCeoDecisionFeed({ entity, currency = 'VND', approvals = [], asOf = new Date() } = {}) {
  const entityId = clean(entity?.id, 'entity_id', 32).toLowerCase();
  const items = approvals
    .filter((approval) => approval?.status === 'pending')
    .slice(0, CEO_DECISION_MAX_ITEMS)
    .map((approval) => {
      const id = clean(approval.id, 'id', 96);
      const type = clean(approval.type, 'type', 48).toLowerCase();
      return {
        id,
        type,
        class: decisionClass(type),
        title: clean(approval.title, 'title', 180),
        amount: safeAmount(approval.amount),
        requesterName: clean(approval.requesterName || 'Unknown', 'requester_name', 100),
        createdAt: safeDate(approval.createdAt, 'created_at').toISOString(),
        currentStep: pendingStep(approval.steps),
        recordPath: recordPath(id),
      };
    });
  return {
    contract: CEO_DECISION_FEED_CONTRACT,
    contractVersion: CEO_DECISION_QUEUE_VERSION,
    entityId,
    currency: clean(currency, 'currency', 8).toUpperCase(),
    asOf: safeDate(asOf, 'as_of').toISOString(),
    items,
    privacy: {
      containsPayload: false,
      containsReferenceIds: false,
      containsDecisionHistory: false,
    },
  };
}

export function sanitizeCeoDecisionFeed(input, entity, now = new Date()) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new CeoDecisionQueueError('Decision feed is invalid.', 502, 'ceo_decision_feed_invalid');
  if (input.contract !== CEO_DECISION_FEED_CONTRACT || input.contractVersion !== CEO_DECISION_QUEUE_VERSION) {
    throw new CeoDecisionQueueError('Decision feed contract is incompatible.', 502, 'ceo_decision_contract_incompatible');
  }
  const expectedId = clean(entity?.id, 'entity_id', 32).toLowerCase();
  if (String(input.entityId || '').toLowerCase() !== expectedId) throw new CeoDecisionQueueError('Decision feed audience mismatch.', 502, 'ceo_decision_audience_mismatch');
  const asOf = safeDate(input.asOf, 'as_of');
  if (asOf > new Date(now.getTime() + 5 * 60_000)) throw new CeoDecisionQueueError('Decision feed timestamp is in the future.', 502, 'ceo_decision_as_of_invalid');
  if (!Array.isArray(input.items) || input.items.length > CEO_DECISION_MAX_ITEMS) throw new CeoDecisionQueueError('Decision feed item limit exceeded.', 502, 'ceo_decision_items_invalid');
  return buildLocalCeoDecisionFeed({
    entity: { id: expectedId }, currency: input.currency, asOf,
    approvals: input.items.map((item) => ({
      ...item,
      status: 'pending',
      requesterName: item.requesterName,
      steps: item.currentStep ? [{ ...item.currentStep, status: 'pending' }] : [],
    })),
  });
}

function urgencyFor(createdAt, decisionClassValue, now) {
  const ageHours = Math.max(0, (now.getTime() - new Date(createdAt).getTime()) / 3_600_000);
  const slaHours = SLA_HOURS[decisionClassValue] || SLA_HOURS.governance;
  return {
    ageHours: Math.round(ageHours * 10) / 10,
    slaHours,
    urgency: ageHours >= slaHours * 2 ? 'critical' : ageHours >= slaHours ? 'warning' : 'normal',
  };
}

export function buildCeoUnifiedDecisionQueue({ feeds = [], errors = [], registryEntities = [], now = new Date(), entityId = 'all' } = {}) {
  const names = new Map(registryEntities.map((entity) => [entity.id, entity.displayName]));
  const items = feeds.flatMap((feed) => feed.items.map((item) => ({
    ...item,
    entityId: feed.entityId,
    entityName: names.get(feed.entityId) || feed.entityId,
    currency: feed.currency,
    ...urgencyFor(item.createdAt, item.class, now),
  }))).sort((left, right) => (
    URGENCY_ORDER[left.urgency] - URGENCY_ORDER[right.urgency]
    || new Date(left.createdAt) - new Date(right.createdAt)
  ));
  const amountByCurrency = Object.entries(items.reduce((totals, item) => {
    if (item.amount > 0) totals[item.currency] = (totals[item.currency] || 0) + item.amount;
    return totals;
  }, {})).map(([currency, value]) => ({ currency, value }));
  const errorById = new Map(errors.map((error) => [error.entityId, error]));
  const feedIds = new Set(feeds.map((feed) => feed.entityId));
  const sources = registryEntities
    .filter((entity) => entityId === 'all' || entity.id === entityId)
    .map((entity) => ({
      entityId: entity.id,
      displayName: entity.displayName,
      state: feedIds.has(entity.id) ? 'available' : entity.enabled === false ? 'disabled' : 'degraded',
      code: errorById.get(entity.id)?.code || null,
    }));
  return {
    contract: CEO_DECISION_QUEUE_CONTRACT,
    contractVersion: CEO_DECISION_QUEUE_VERSION,
    asOf: safeDate(now, 'as_of').toISOString(),
    entityId,
    items,
    sources,
    metrics: {
      total: items.length,
      critical: items.filter((item) => item.urgency === 'critical').length,
      warning: items.filter((item) => item.urgency === 'warning').length,
      companiesResponding: sources.filter((source) => source.state === 'available').length,
      companiesExpected: sources.filter((source) => source.state !== 'disabled').length,
      amountByCurrency,
    },
    invariants: {
      directEntityDatabaseWrites: false,
      decisionsExecutedInOwningEntity: true,
      amountsCombinedAcrossCurrencies: false,
      aiDecisionMaking: false,
    },
  };
}
