export const CEO_DAILY_BRIEFING_VERSION = 1;

const SEVERITY_ORDER = Object.freeze({ critical: 0, warning: 1, info: 2 });
const list = (value) => (Array.isArray(value) ? value : []);

function item(code, severity, count, href, entityIds = [], context = {}) {
  return { code, severity, count, href, entityIds: [...new Set(entityIds.filter(Boolean))], context };
}

/**
 * CEO-14 is a deterministic read model. It composes sanitized CEO-12/13 models;
 * it does not generate facts, execute decisions or mutate an entity record.
 */
export function buildCeoDailyBriefing({ cockpit = null, decisionQueue = null, dashboard = null, now = new Date() } = {}) {
  const decisions = list(decisionQueue?.items);
  const criticalDecisions = decisions.filter((decision) => decision.urgency === 'critical');
  const warningDecisions = decisions.filter((decision) => decision.urgency === 'warning');
  const operational = list(cockpit?.attention);
  const criticalOperations = operational.filter((entry) => entry.severity === 'critical');
  const warningOperations = operational.filter((entry) => entry.severity === 'warning');
  const infoOperations = operational.filter((entry) => entry.severity === 'info');
  const delivery = dashboard?.portfolio?.delivery || {};
  const support = dashboard?.portfolio?.support || {};

  const nowItems = [
    ...criticalDecisions.slice(0, 5).map((decision) => item(
      'decision.sla_critical', 'critical', 1, '/ceo-decisions', [decision.entityId],
      { decisionId: decision.id, title: decision.title, ageHours: decision.ageHours, slaHours: decision.slaHours },
    )),
    ...criticalOperations.map((entry) => item(entry.code, entry.severity, entry.count, entry.href, entry.entityIds)),
  ];
  const todayItems = [
    ...warningDecisions.slice(0, 6).map((decision) => item(
      'decision.sla_warning', 'warning', 1, '/ceo-decisions', [decision.entityId],
      { decisionId: decision.id, title: decision.title, ageHours: decision.ageHours, slaHours: decision.slaHours },
    )),
    ...warningOperations.map((entry) => item(entry.code, entry.severity, entry.count, entry.href, entry.entityIds)),
  ];
  if (Number(delivery.tasksOverdue) > 0) todayItems.push(item('delivery.tasks_overdue', 'warning', Number(delivery.tasksOverdue), '/ceo-overview'));
  if (Number(delivery.projectsLate) > 0) todayItems.push(item('delivery.projects_late', 'warning', Number(delivery.projectsLate), '/ceo-overview'));
  if (Number(support.slaBreaches) > 0) todayItems.push(item('support.sla_breaches', 'warning', Number(support.slaBreaches), '/ceo-overview'));

  const sourceIssues = list(decisionQueue?.sources).filter((source) => source.state === 'degraded');
  const watchItems = [
    ...infoOperations.map((entry) => item(entry.code, entry.severity, entry.count, entry.href, entry.entityIds)),
    ...(sourceIssues.length ? [item('decision.source_degraded', 'info', sourceIssues.length, '/ceo-security', sourceIssues.map((source) => source.entityId))] : []),
  ];
  const sort = (rows) => rows.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] || b.count - a.count || a.code.localeCompare(b.code));
  return {
    version: CEO_DAILY_BRIEFING_VERSION,
    generatedAt: new Date(now).toISOString(),
    state: nowItems.length ? 'critical' : todayItems.length ? 'attention' : 'clear',
    metrics: {
      critical: nowItems.reduce((sum, entry) => sum + entry.count, 0),
      today: todayItems.reduce((sum, entry) => sum + entry.count, 0),
      decisions: decisions.length,
      sourcesAvailable: cockpit?.metrics?.sourcesAvailable || 0,
      sourcesRegistered: cockpit?.metrics?.sourcesRegistered || 0,
      openReceipts: cockpit?.metrics?.openReceipts || 0,
    },
    sections: {
      now: sort(nowItems).slice(0, 8),
      today: sort(todayItems).slice(0, 10),
      watch: sort(watchItems).slice(0, 8),
    },
    sources: {
      operations: cockpit ? 'available' : 'degraded',
      decisions: decisionQueue ? 'available' : 'degraded',
      dashboard: dashboard ? 'available' : 'degraded',
    },
    invariants: {
      directEntityDatabaseWrites: false,
      decisionsExecutedInOwningEntity: true,
      aiDecisionMaking: false,
      inventedFacts: false,
      financialMetricsCombined: false,
    },
  };
}
