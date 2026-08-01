export const CEO_TERMINAL_COCKPIT_VERSION = 1;

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2 };
const ATTENTION_ORDER = {
  'entity.source_unavailable': 0,
  'command.delivery_failed': 1,
  'message.delivery_failed': 2,
  'rollout.migration_required': 3,
  'command.receipt_pending': 4,
  'message.receipt_pending': 5,
  'entity.source_stale': 6,
  'terminal.source_degraded': 7,
  'identity.step_up_required': 8,
  'rollout.review_required': 9,
};
const RECEIPT_PENDING = new Set(['dispatching', 'pending_confirmation']);
const RECEIPT_FAILED = new Set(['failed', 'rejected']);
const SOURCE_CRITICAL = new Set(['expired', 'invalid', 'missing']);

const list = (value) => (Array.isArray(value) ? value : []);
const countBy = (rows, predicate) => rows.reduce((total, row) => total + (predicate(row) ? 1 : 0), 0);

function filtered(rows, entityId, key = 'targetEntityId') {
  if (!entityId || entityId === 'all') return list(rows);
  return list(rows).filter((row) => row?.[key] === entityId);
}

function attentionItem(code, severity, count, href, entityIds = []) {
  return { code, severity, count, href, entityIds: [...new Set(entityIds.filter(Boolean))] };
}

function activePeople(links) {
  const grouped = new Map();
  for (const link of list(links).filter((row) => row?.status === 'active')) {
    if (!grouped.has(link.personKey)) grouped.set(link.personKey, new Set());
    grouped.get(link.personKey).add(link.entityId);
  }
  return {
    people: grouped.size,
    crossEntityPeople: [...grouped.values()].filter((entities) => entities.size > 1).length,
  };
}

/**
 * CEO-12 is a read-model composer only. It intentionally accepts already-sanitized
 * control-plane models and never infers, copies or combines entity business records.
 */
export function buildCeoTerminalCockpit({
  dashboard = null,
  rollout = null,
  commands = null,
  conversations = null,
  staffLinks = null,
  sourceStates = {},
  identityReady = false,
  entityId = 'all',
  now = new Date(),
} = {}) {
  const dashboardEntities = entityId === 'all'
    ? list(dashboard?.entities)
    : list(dashboard?.entities).filter((entity) => entity.id === entityId);
  const rolloutEntities = entityId === 'all'
    ? list(rollout?.entities)
    : list(rollout?.entities).filter((entity) => entity.id === entityId);
  const deliveries = filtered(commands?.deliveries, entityId);
  const threads = filtered(conversations?.conversations, entityId);
  const scopedLinks = entityId === 'all'
    ? list(staffLinks?.links)
    : list(staffLinks?.links).filter((link) => link.entityId === entityId);

  const sourceCritical = dashboardEntities.filter((entity) => SOURCE_CRITICAL.has(entity?.freshness?.state));
  const sourceStale = dashboardEntities.filter((entity) => entity?.freshness?.state === 'stale');
  const commandFailed = deliveries.filter((row) => RECEIPT_FAILED.has(row.status));
  const commandPending = deliveries.filter((row) => RECEIPT_PENDING.has(row.status));
  const messageFailed = threads.filter((row) => RECEIPT_FAILED.has(row?.lastMessage?.status));
  const messagePending = threads.filter((row) => RECEIPT_PENDING.has(row?.lastMessage?.status));
  const recentReplies = countBy(threads, (row) => row?.lastMessage?.direction === 'inbound');
  const rolloutMigration = rolloutEntities.filter((entity) => entity?.state?.migrationRequired);
  const rolloutHeld = rolloutEntities.filter((entity) => !entity?.state?.migrationRequired && ['hold', 'paused'].includes(entity?.state?.status));
  const people = activePeople(scopedLinks);
  const unavailableSources = Object.entries(sourceStates)
    .filter(([, state]) => state === 'unavailable')
    .map(([source]) => source);

  const attention = [];
  if (!identityReady) attention.push(attentionItem('identity.step_up_required', 'warning', 1, '/ceo-registry'));
  if (sourceCritical.length) attention.push(attentionItem('entity.source_unavailable', 'critical', sourceCritical.length, '/ceo-registry', sourceCritical.map((entity) => entity.id)));
  if (commandFailed.length) attention.push(attentionItem('command.delivery_failed', 'critical', commandFailed.length, '/ceo-commands', commandFailed.map((row) => row.targetEntityId)));
  if (messageFailed.length) attention.push(attentionItem('message.delivery_failed', 'critical', messageFailed.length, '/ceo-inbox', messageFailed.map((row) => row.targetEntityId)));
  if (rolloutMigration.length) attention.push(attentionItem('rollout.migration_required', 'critical', rolloutMigration.length, '/ceo-rollout', rolloutMigration.map((entity) => entity.id)));
  if (commandPending.length) attention.push(attentionItem('command.receipt_pending', 'warning', commandPending.length, '/ceo-commands', commandPending.map((row) => row.targetEntityId)));
  if (messagePending.length) attention.push(attentionItem('message.receipt_pending', 'warning', messagePending.length, '/ceo-inbox', messagePending.map((row) => row.targetEntityId)));
  if (sourceStale.length) attention.push(attentionItem('entity.source_stale', 'warning', sourceStale.length, '/ceo-overview', sourceStale.map((entity) => entity.id)));
  if (rolloutHeld.length) attention.push(attentionItem('rollout.review_required', 'info', rolloutHeld.length, '/ceo-rollout', rolloutHeld.map((entity) => entity.id)));
  if (unavailableSources.length) attention.push(attentionItem('terminal.source_degraded', 'warning', unavailableSources.length, '/ceo-security', unavailableSources));

  attention.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]
    || (ATTENTION_ORDER[a.code] ?? 99) - (ATTENTION_ORDER[b.code] ?? 99)
    || b.count - a.count
    || a.code.localeCompare(b.code));

  const rolloutById = new Map(rolloutEntities.map((entity) => [entity.id, entity]));
  const pulseIds = new Set([
    ...dashboardEntities.map((entity) => entity.id),
    ...rolloutEntities.map((entity) => entity.id),
  ]);
  const companies = [...pulseIds].map((id) => {
    const source = dashboardEntities.find((entity) => entity.id === id);
    const release = rolloutById.get(id);
    return {
      id,
      displayName: source?.displayName || release?.displayName || id,
      sourceState: source?.freshness?.state || 'missing',
      sourceAgeSeconds: source?.freshness?.ageSeconds ?? null,
      rolloutRing: release?.state?.currentRing || dashboard?.rings?.[id]?.ring || 'unknown',
      rolloutStatus: release?.state?.status || dashboard?.rings?.[id]?.status || 'unknown',
      openReceipts: countBy(deliveries, (row) => row.targetEntityId === id && (RECEIPT_PENDING.has(row.status) || RECEIPT_FAILED.has(row.status)))
        + countBy(threads, (row) => row.targetEntityId === id && (RECEIPT_PENDING.has(row?.lastMessage?.status) || RECEIPT_FAILED.has(row?.lastMessage?.status))),
    };
  }).sort((a, b) => a.displayName.localeCompare(b.displayName));

  return {
    version: CEO_TERMINAL_COCKPIT_VERSION,
    generatedAt: new Date(now).toISOString(),
    scope: entityId || 'all',
    metrics: {
      sourcesAvailable: entityId === 'all' && Number.isFinite(dashboard?.health?.available)
        ? dashboard.health.available
        : countBy(dashboardEntities, (entity) => ['fresh', 'stale'].includes(entity?.freshness?.state)),
      sourcesRegistered: entityId === 'all' && Number.isFinite(dashboard?.health?.registered)
        ? dashboard.health.registered
        : dashboardEntities.length,
      openReceipts: commandFailed.length + commandPending.length + messageFailed.length + messagePending.length,
      recentReplies,
      groupPeople: people.people,
      crossEntityPeople: people.crossEntityPeople,
      activeRollouts: countBy(rolloutEntities, (entity) => entity?.state?.status === 'active'),
      rolloutEntities: rolloutEntities.length,
    },
    attention: attention.slice(0, 8),
    companies,
    sources: {
      dashboard: dashboard ? 'available' : 'unavailable',
      rollout: sourceStates.rollout || (rollout ? 'available' : 'unavailable'),
      commands: sourceStates.commands || (commands ? 'available' : identityReady ? 'unavailable' : 'locked'),
      conversations: sourceStates.conversations || (conversations ? 'available' : identityReady ? 'unavailable' : 'locked'),
      workforce: sourceStates.workforce || (staffLinks ? 'available' : 'unavailable'),
    },
    invariants: {
      directEntityDatabaseWrites: false,
      businessActionsUseCanonicalWorkflows: true,
      financialMetricsCombined: false,
    },
  };
}
