export const REALM_EXPERIENCE_VERSION = 1;
export const REALM_EXPERIENCE_STORAGE_KEY = 'crmegoric-realm-experience:v1';

export const REALM_EXPERIENCE_MODES = Object.freeze(['world', 'ledger']);
export const REALM_EXPERIENCE_PANELS = Object.freeze([
  'briefing',
  'quests',
  'command',
  'campaigns',
  'guild',
  'treasury',
  'shop',
  'chat',
  'party',
  'profile',
]);
export const REALM_EXPERIENCE_LEDGER_VIEWS = Object.freeze([
  'personal',
  'command',
  'guild',
  'rewards',
  'economy',
  'treasury',
]);
export const REALM_EXPERIENCE_JOURNEYS = Object.freeze(['guild', 'war', 'treasury', 'tavern']);
export const REALM_EXPERIENCE_EVENTS = Object.freeze([
  'realm_opened',
  'mode_changed',
  'journey_opened',
  'continuity_restored',
  'erp_handoff',
  'sync_degraded',
  'sync_recovered',
  'feedback_opened',
]);

const MODE_SET = new Set(REALM_EXPERIENCE_MODES);
const PANEL_SET = new Set(REALM_EXPERIENCE_PANELS);
const LEDGER_VIEW_SET = new Set(REALM_EXPERIENCE_LEDGER_VIEWS);
const JOURNEY_SET = new Set(REALM_EXPERIENCE_JOURNEYS);
const EVENT_SET = new Set(REALM_EXPERIENCE_EVENTS);
const SURFACE_SET = new Set(['realm', 'ledger', 'erp']);

function finiteCoordinate(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.max(0, Math.min(100, number)) : null;
}

export function realmJourneyForContext(context = {}) {
  if (context.mode === 'ledger') {
    if (context.ledgerView === 'guild') return 'guild';
    if (context.ledgerView === 'treasury') return 'tavern';
    return null;
  }
  if (context.panel === 'guild') return 'guild';
  if (context.panel === 'campaigns') return 'war';
  if (context.panel === 'treasury') return 'treasury';
  if (context.panel === 'shop') return 'tavern';
  return null;
}

export function normalizeRealmExperienceContext(value = {}) {
  const mode = MODE_SET.has(value?.mode) ? value.mode : 'world';
  const panel = PANEL_SET.has(value?.panel) ? value.panel : 'briefing';
  const ledgerView = LEDGER_VIEW_SET.has(value?.ledgerView) ? value.ledgerView : 'personal';
  const x = finiteCoordinate(value?.position?.x);
  const y = finiteCoordinate(value?.position?.y);
  const position = x === null || y === null ? null : { x, y };
  return {
    version: REALM_EXPERIENCE_VERSION,
    mode,
    panel,
    ledgerView,
    position,
  };
}

export function parseRealmExperienceContext(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw;
    if (!value || Number(value.version) !== REALM_EXPERIENCE_VERSION) return null;
    return normalizeRealmExperienceContext(value);
  } catch {
    return null;
  }
}

export function normalizeRealmExperienceEvent(value = {}) {
  const event = String(value?.event || '').trim();
  if (!EVENT_SET.has(event)) return null;
  const surface = SURFACE_SET.has(value?.surface) ? value.surface : 'realm';
  const journey = JOURNEY_SET.has(value?.journey) ? value.journey : null;
  return { event, surface, journey };
}

function fixedCounter(keys, source = {}) {
  return Object.fromEntries(keys.map((key) => [key, Math.max(0, Number(source?.[key]) || 0)]));
}

export function normalizeRealmExperienceTelemetry(value = {}) {
  return {
    version: REALM_EXPERIENCE_VERSION,
    totalEvents: Math.max(0, Number(value?.totalEvents) || 0),
    totals: fixedCounter(REALM_EXPERIENCE_EVENTS, value?.totals),
    surfaces: fixedCounter(['realm', 'ledger', 'erp'], value?.surfaces),
    journeys: fixedCounter(REALM_EXPERIENCE_JOURNEYS, value?.journeys),
    updatedAt: typeof value?.updatedAt === 'string' ? value.updatedAt : null,
  };
}

export function applyRealmExperienceTelemetryEvent(currentValue, eventValue, now = new Date()) {
  const event = normalizeRealmExperienceEvent(eventValue);
  if (!event) return null;
  const current = normalizeRealmExperienceTelemetry(currentValue);
  const next = {
    ...current,
    totalEvents: current.totalEvents + 1,
    totals: { ...current.totals, [event.event]: current.totals[event.event] + 1 },
    surfaces: { ...current.surfaces, [event.surface]: current.surfaces[event.surface] + 1 },
    journeys: { ...current.journeys },
    updatedAt: now.toISOString(),
  };
  if (event.journey) next.journeys[event.journey] += 1;
  return next;
}

export function evaluateRealmExperiencePilot({
  telemetry: telemetryValue,
  readiness = null,
  openFeedback = 0,
  blockedFeedback = 0,
} = {}) {
  const telemetry = normalizeRealmExperienceTelemetry(telemetryValue);
  const observedJourneys = REALM_EXPERIENCE_JOURNEYS.filter((journey) => telemetry.journeys[journey] > 0);
  const degraded = telemetry.totals.sync_degraded;
  const recovered = telemetry.totals.sync_recovered;
  const gates = [
    {
      id: 'repository-readiness',
      label: 'RepositoryRealms launch readiness',
      passed: readiness?.ready === true,
      blocking: true,
      detail: readiness?.ready ? 'Authorization, rollback và release gates hiện hữu đang xanh.' : 'Launch readiness hiện hữu còn blocker hoặc chưa tải được.',
    },
    {
      id: 'continuity-observed',
      label: 'Khôi phục đúng ngữ cảnh Realm',
      passed: telemetry.totals.continuity_restored > 0,
      blocking: true,
      detail: `${telemetry.totals.continuity_restored} lần restore đã được ghi nhận ở mức tổng hợp.`,
    },
    {
      id: 'erp-handoff-observed',
      label: 'Realm → ERP handoff hoạt động',
      passed: telemetry.totals.erp_handoff > 0,
      blocking: true,
      detail: `${telemetry.totals.erp_handoff} lần handoff đã được ghi nhận; không lưu record hoặc người dùng.`,
    },
    {
      id: 'four-journey-coverage',
      label: 'Bốn journey trọng yếu có evidence',
      passed: observedJourneys.length === REALM_EXPERIENCE_JOURNEYS.length,
      blocking: true,
      detail: `${observedJourneys.length}/${REALM_EXPERIENCE_JOURNEYS.length} journey đã được quan sát.`,
    },
    {
      id: 'degraded-recovery',
      label: 'Degraded UX có đường hồi phục',
      passed: degraded === 0 || recovered > 0,
      blocking: false,
      detail: degraded === 0 ? 'Chưa ghi nhận degraded sync trong cửa sổ tổng hợp.' : `${degraded} degraded · ${recovered} recovered.`,
    },
    {
      id: 'blocking-feedback',
      label: 'Không còn Guild Support blocker',
      passed: Number(blockedFeedback) === 0,
      blocking: true,
      detail: `${Number(openFeedback) || 0} phản hồi mở · ${Number(blockedFeedback) || 0} blocker.`,
    },
  ];
  const blockers = gates.filter((gate) => gate.blocking && !gate.passed);
  const advisories = gates.filter((gate) => !gate.blocking && !gate.passed);
  const status = blockers.length ? (telemetry.totalEvents ? 'blocked' : 'insufficient-data') : advisories.length ? 'attention' : 'ready';
  return {
    status,
    ready: blockers.length === 0,
    recommendedDecision: blockers.length ? 'hold-or-limited-pilot' : advisories.length ? 'continue-with-observation' : 'ready-for-approved-expansion',
    authoritativeLaunchGate: false,
    gates,
    summary: {
      passed: gates.filter((gate) => gate.passed).length,
      total: gates.length,
      blockers: blockers.length,
      advisories: advisories.length,
      observedJourneys: observedJourneys.length,
      totalEvents: telemetry.totalEvents,
      openFeedback: Number(openFeedback) || 0,
      blockedFeedback: Number(blockedFeedback) || 0,
    },
    telemetry,
    privacy: {
      aggregateOnly: true,
      userIdsStored: false,
      recordIdsStored: false,
      contentStored: false,
      durationTracking: false,
      performanceTracking: false,
    },
  };
}
