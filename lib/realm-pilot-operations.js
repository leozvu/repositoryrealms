import { randomUUID } from 'node:crypto';
import { isDirector, rolesOf } from './perm.js';
import { RealmOperationError } from './realm-operation.js';
import {
  applyRealmPilotConfigInTransaction,
  normalizeRealmPilotConfig,
  parseRealmPilotConfig,
  publicRealmPilotConfig,
  realmPilotDecision,
} from './realm-pilot.js';
import { loadRealmLaunchReadiness } from './realm-readiness.js';
import { buildRealmPilotRehearsalGate, requireValidRealmPilotRehearsal } from './realm-pilot-rehearsal.js';
import { buildRealmChaosReadiness } from './realm-chaos-readiness.js';

export const REALM_PILOT_WAVE_STATUSES = Object.freeze([
  'draft',
  'awaiting_approval',
  'active',
  'paused',
  'completed',
]);
export const REALM_PILOT_WAVE_MIN_DAYS = 7;
export const REALM_PILOT_WAVE_MAX_DAYS = 14;
export const REALM_PILOT_WAVE_LIMIT = 20;
export const REALM_PILOT_CANARY_WINDOW_MINUTES = 90;
export const REALM_PILOT_INCIDENT_LIMIT = 40;
export const REALM_PILOT_INCIDENT_CATEGORIES = Object.freeze([
  { id: 'realm_access', label: 'Realm không truy cập được', detail: 'Cohort không thể mở Realm nhưng ERP vẫn phải tiếp tục hoạt động.', defaultSeverity: 'critical' },
  { id: 'sync_integrity', label: 'Nghi ngờ lệch dữ liệu', detail: 'Dữ liệu hiển thị giữa Realm và ERP cần được kiểm tra tính toàn vẹn.', defaultSeverity: 'critical' },
  { id: 'erp_fallback', label: 'ERP fallback gặp lỗi', detail: 'Đường quay về ERP không đạt; incident luôn được nâng lên critical.', defaultSeverity: 'critical' },
  { id: 'communications', label: 'Liên lạc gián đoạn', detail: 'Presence, proximity hoặc thông báo vận hành đang suy giảm.', defaultSeverity: 'warning' },
  { id: 'tavern_fulfillment', label: 'Tavern fulfillment bị chậm', detail: 'Luồng đổi thưởng cần theo dõi nhưng không làm thay đổi Gold ledger.', defaultSeverity: 'warning' },
  { id: 'performance_degradation', label: 'Hiệu năng suy giảm', detail: 'Trải nghiệm chậm hoặc không ổn định ở mức cần theo dõi.', defaultSeverity: 'warning' },
]);

const STATUS_SET = new Set(REALM_PILOT_WAVE_STATUSES);
const OPEN_STATUSES = new Set(['draft', 'awaiting_approval', 'active', 'paused']);
const ACTIVATION_STATE_SET = new Set(['watching', 'cleared', 'rolled_back']);
const INCIDENT_STATUS_SET = new Set(['open', 'monitoring', 'resolved']);
const INCIDENT_SEVERITY_SET = new Set(['warning', 'critical']);
const INCIDENT_CATEGORY_MAP = new Map(REALM_PILOT_INCIDENT_CATEGORIES.map((category) => [category.id, category]));
const DEFAULT_OPERATIONS = Object.freeze({ version: 0, waves: Object.freeze([]), incidents: Object.freeze([]) });

function requireDirector(user) {
  if (!isDirector(user)) {
    throw new RealmOperationError('Chỉ Giám đốc được vận hành Realm pilot.', 403, 'realm_pilot_operations_forbidden');
  }
}

function cleanText(value, max = 120) {
  return String(value ?? '')
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeIso(value) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function finiteCount(value) {
  const count = Number(value);
  return Number.isFinite(count) ? Math.max(0, Math.round(count)) : 0;
}

function normalizeActivation(value) {
  if (!value || typeof value !== 'object') return null;
  const state = ACTIVATION_STATE_SET.has(value.state) ? value.state : 'watching';
  return {
    state,
    startedAt: safeIso(value.startedAt),
    checkpointDueAt: safeIso(value.checkpointDueAt),
    clearedAt: safeIso(value.clearedAt),
    clearedById: cleanText(value.clearedById, 100) || null,
    clearedByName: cleanText(value.clearedByName, 100) || null,
    rolledBackAt: safeIso(value.rolledBackAt),
    decisionNote: cleanText(value.decisionNote, 240) || null,
    baseline: value.baseline && typeof value.baseline === 'object'
      ? {
          eligibleUsers: finiteCount(value.baseline.eligibleUsers),
          fallbackUsers: finiteCount(value.baseline.fallbackUsers),
          blockers: finiteCount(value.baseline.blockers),
          unresolvedFeedback: finiteCount(value.baseline.unresolvedFeedback),
          blockedFeedback: finiteCount(value.baseline.blockedFeedback),
          capturedAt: safeIso(value.baseline.capturedAt),
        }
      : null,
  };
}

function normalizeIncident(value) {
  if (!value || typeof value !== 'object') return null;
  const id = cleanText(value.id, 100);
  const waveId = cleanText(value.waveId, 100);
  const category = INCIDENT_CATEGORY_MAP.has(value.category) ? value.category : null;
  if (!id || !waveId || !category) return null;
  const categoryMeta = INCIDENT_CATEGORY_MAP.get(category);
  const severity = categoryMeta.defaultSeverity === 'critical'
    ? 'critical'
    : INCIDENT_SEVERITY_SET.has(value.severity) ? value.severity : categoryMeta.defaultSeverity;
  const status = INCIDENT_STATUS_SET.has(value.status) ? value.status : 'open';
  return {
    id,
    waveId,
    category,
    severity,
    status,
    policyVersion: finiteCount(value.policyVersion),
    openedAt: safeIso(value.openedAt),
    monitoringAt: safeIso(value.monitoringAt),
    resolvedAt: safeIso(value.resolvedAt),
    rollbackTriggered: value.rollbackTriggered === true,
    resolution: ['contained_in_erp', 'verified_recovery'].includes(value.resolution) ? value.resolution : null,
    snapshot: value.snapshot && typeof value.snapshot === 'object'
      ? {
          eligibleUsers: finiteCount(value.snapshot.eligibleUsers),
          fallbackUsers: finiteCount(value.snapshot.fallbackUsers),
          blockers: finiteCount(value.snapshot.blockers),
          unresolvedFeedback: finiteCount(value.snapshot.unresolvedFeedback),
          blockedFeedback: finiteCount(value.snapshot.blockedFeedback),
          capturedAt: safeIso(value.snapshot.capturedAt),
        }
      : null,
  };
}

function normalizeStoredWave(value = {}) {
  const id = cleanText(value.id, 100);
  const status = STATUS_SET.has(value.status) ? value.status : 'draft';
  if (!id) return null;
  return {
    id,
    name: cleanText(value.name, 80) || 'Realm pilot wave',
    status,
    policyVersion: finiteCount(value.policyVersion),
    cohortStrategy: value.cohortStrategy === 'members' ? 'members' : 'roles',
    eligibleUsers: finiteCount(value.eligibleUsers),
    fallbackUsers: finiteCount(value.fallbackUsers),
    durationDays: Math.max(REALM_PILOT_WAVE_MIN_DAYS, Math.min(REALM_PILOT_WAVE_MAX_DAYS, finiteCount(value.durationDays) || REALM_PILOT_WAVE_MIN_DAYS)),
    plannedStartAt: safeIso(value.plannedStartAt),
    plannedEndAt: safeIso(value.plannedEndAt),
    createdAt: safeIso(value.createdAt),
    updatedAt: safeIso(value.updatedAt),
    createdById: cleanText(value.createdById, 100) || null,
    createdByName: cleanText(value.createdByName, 100) || 'Director',
    submittedAt: safeIso(value.submittedAt),
    submittedById: cleanText(value.submittedById, 100) || null,
    submittedByName: cleanText(value.submittedByName, 100) || null,
    activatedAt: safeIso(value.activatedAt),
    approvedById: cleanText(value.approvedById, 100) || null,
    approvedByName: cleanText(value.approvedByName, 100) || null,
    rehearsalId: cleanText(value.rehearsalId, 100) || null,
    rehearsalExpiresAt: safeIso(value.rehearsalExpiresAt),
    activation: normalizeActivation(value.activation),
    pausedAt: safeIso(value.pausedAt),
    completedAt: safeIso(value.completedAt),
    decisionNote: cleanText(value.decisionNote, 240) || null,
    finalReport: value.finalReport && typeof value.finalReport === 'object'
      ? {
          recommendation: ['go', 'hold', 'no_go'].includes(value.finalReport.recommendation) ? value.finalReport.recommendation : 'hold',
          observedDays: finiteCount(value.finalReport.observedDays),
          unresolvedFeedback: finiteCount(value.finalReport.unresolvedFeedback),
          blockedFeedback: finiteCount(value.finalReport.blockedFeedback),
          openIncidents: finiteCount(value.finalReport.openIncidents),
          criticalIncidents: finiteCount(value.finalReport.criticalIncidents),
          generatedAt: safeIso(value.finalReport.generatedAt),
        }
      : null,
  };
}

export function normalizeRealmPilotOperations(value = {}) {
  const waves = Array.isArray(value?.waves)
    ? value.waves.map(normalizeStoredWave).filter(Boolean).slice(0, REALM_PILOT_WAVE_LIMIT)
    : [];
  const incidents = Array.isArray(value?.incidents)
    ? value.incidents.map(normalizeIncident).filter(Boolean).slice(0, REALM_PILOT_INCIDENT_LIMIT)
    : [];
  return {
    version: Number.isInteger(value?.version) ? Math.max(0, value.version) : 0,
    waves,
    incidents,
  };
}

export function parseRealmPilotOperations(settingJson) {
  try {
    const setting = JSON.parse(settingJson || '{}');
    return normalizeRealmPilotOperations(setting?.realmPilotOperations);
  } catch {
    return normalizeRealmPilotOperations(DEFAULT_OPERATIONS);
  }
}

function waveSnapshot(policy, metrics) {
  return {
    policyVersion: policy.version,
    cohortStrategy: policy.cohortStrategy,
    eligibleUsers: finiteCount(metrics?.eligibleUsers),
    fallbackUsers: Math.max(0, finiteCount(metrics?.cohort?.available) - finiteCount(metrics?.eligibleUsers)),
  };
}

function currentWave(operations) {
  return operations.waves.find((wave) => OPEN_STATUSES.has(wave.status)) || operations.waves[0] || null;
}

function elapsedDays(wave, now) {
  const start = new Date(wave?.activatedAt || '');
  if (Number.isNaN(start.getTime())) return 0;
  return Math.max(0, Math.floor((now.getTime() - start.getTime()) / 86_400_000));
}

function incidentSnapshot(readiness, now) {
  const available = finiteCount(readiness?.metrics?.cohort?.available);
  const eligible = finiteCount(readiness?.metrics?.eligibleUsers);
  return {
    eligibleUsers: eligible,
    fallbackUsers: Math.max(0, available - eligible),
    blockers: finiteCount(readiness?.summary?.blockers),
    unresolvedFeedback: finiteCount(readiness?.summary?.unresolvedFeedback),
    blockedFeedback: finiteCount(readiness?.summary?.blockedFeedback),
    capturedAt: now.toISOString(),
  };
}

function timelineEvent(id, at, type, label, detail, tone = 'neutral') {
  const timestamp = safeIso(at);
  return timestamp ? { id, at: timestamp, type, label, detail, tone } : null;
}

export function buildRealmPilotIncidentCommand({ operations, wave, policy, readiness, now = new Date() } = {}) {
  const normalized = normalizeRealmPilotOperations(operations || DEFAULT_OPERATIONS);
  const incidents = normalized.incidents
    .filter((incident) => wave && incident.waveId === wave.id)
    .map((incident) => {
      const category = INCIDENT_CATEGORY_MAP.get(incident.category);
      return {
        ...incident,
        categoryLabel: category.label,
        categoryDetail: category.detail,
        canMonitor: incident.status === 'open' && ['active', 'paused'].includes(wave?.status),
        canResolve: incident.status === 'monitoring' && ['active', 'paused'].includes(wave?.status),
      };
    });
  const unresolved = incidents.filter((incident) => incident.status !== 'resolved');
  const criticalOpen = unresolved.filter((incident) => incident.severity === 'critical').length;
  const warningOpen = unresolved.filter((incident) => incident.severity === 'warning').length;
  const events = [
    timelineEvent(`wave:${wave?.id}:created`, wave?.createdAt, 'wave_created', 'Wave được tạo', 'Bắt đầu record vận hành tổng hợp.'),
    timelineEvent(`wave:${wave?.id}:submitted`, wave?.submittedAt, 'wave_submitted', 'Wave gửi duyệt', 'Maker–checker được kích hoạt.'),
    timelineEvent(`wave:${wave?.id}:activated`, wave?.activatedAt, 'wave_activated', 'Cohort được kích hoạt', 'Canary 90 phút bắt đầu; ERP vẫn là fallback.', 'success'),
    timelineEvent(`wave:${wave?.id}:canary`, wave?.activation?.clearedAt, 'canary_cleared', 'Canary checkpoint đạt', 'Cohort giữ nguyên, không tự mở rộng.', 'success'),
    timelineEvent(`wave:${wave?.id}:rollback`, wave?.activation?.rolledBackAt, 'rollback', 'Rollback về ERP', 'Kill switch đóng Realm, dữ liệu được giữ nguyên.', 'critical'),
    timelineEvent(`wave:${wave?.id}:completed`, wave?.completedAt, 'wave_completed', 'Wave hoàn tất', 'Go/No-go snapshot đã được khóa.'),
    ...incidents.flatMap((incident) => [
      timelineEvent(`incident:${incident.id}:open`, incident.openedAt, 'incident_opened', `${incident.severity === 'critical' ? 'Critical' : 'Warning'} · ${incident.categoryLabel}`, incident.rollbackTriggered ? 'Đã tự động rollback về ERP trong cùng transaction.' : 'Go/No-go giữ ở HOLD cho tới khi incident được khống chế.', incident.severity),
      timelineEvent(`incident:${incident.id}:monitor`, incident.monitoringAt, 'incident_monitoring', `Đang theo dõi · ${incident.categoryLabel}`, 'Operator xác nhận incident đang được kiểm soát.', 'warning'),
      timelineEvent(`incident:${incident.id}:resolved`, incident.resolvedAt, 'incident_resolved', `Đã khống chế · ${incident.categoryLabel}`, incident.resolution === 'contained_in_erp' ? 'Đóng incident trong trạng thái ERP fallback.' : 'Live readiness đã được xác minh lại.', 'success'),
    ]),
  ].filter(Boolean).sort((left, right) => new Date(right.at).getTime() - new Date(left.at).getTime()).slice(0, 16);
  const state = criticalOpen > 0 ? 'critical' : warningOpen > 0 ? 'degraded' : 'stable';
  return {
    state,
    label: state === 'critical' ? 'Critical · ERP fallback' : state === 'degraded' ? 'Đang theo dõi' : 'Ổn định',
    canReport: wave?.status === 'active' && policy?.mode === 'pilot',
    categories: REALM_PILOT_INCIDENT_CATEGORIES,
    incidents,
    timeline: events,
    summary: {
      total: incidents.length,
      open: incidents.filter((incident) => incident.status === 'open').length,
      monitoring: incidents.filter((incident) => incident.status === 'monitoring').length,
      resolved: incidents.filter((incident) => incident.status === 'resolved').length,
      criticalOpen,
      warningOpen,
      rollbackTriggered: incidents.filter((incident) => incident.rollbackTriggered).length,
    },
    readiness: {
      ready: readiness?.ready === true,
      blockers: finiteCount(readiness?.summary?.blockers),
      blockedFeedback: finiteCount(readiness?.summary?.blockedFeedback),
    },
    generatedAt: now.toISOString(),
    privacy: { aggregateOnly: true, rosterIncluded: false, actorHistoryIncluded: false, performanceTracking: false, durationTracking: false },
  };
}

export function buildRealmPilotGoNoGoReport({ wave, readiness, incidentCommand, now = new Date() } = {}) {
  if (!wave) {
    return {
      available: false,
      recommendation: 'hold',
      label: 'Chưa có wave để đánh giá',
      observedDays: 0,
      observationWindow: { minimumDays: REALM_PILOT_WAVE_MIN_DAYS, maximumDays: REALM_PILOT_WAVE_MAX_DAYS, status: 'not_started' },
      criteria: [],
      privacy: { aggregateOnly: true, performanceTracking: false, durationTracking: false },
    };
  }
  const observed = elapsedDays(wave, now);
  const readinessReady = readiness?.ready === true;
  const blockedFeedback = finiteCount(readiness?.summary?.blockedFeedback);
  const openIncidents = finiteCount(incidentCommand?.summary?.open) + finiteCount(incidentCommand?.summary?.monitoring);
  const criticalIncidents = finiteCount(incidentCommand?.summary?.criticalOpen);
  const minimumObserved = observed >= REALM_PILOT_WAVE_MIN_DAYS;
  const criteria = [
    { id: 'observation-window', label: `Quan sát tối thiểu ${REALM_PILOT_WAVE_MIN_DAYS} ngày`, passed: minimumObserved, detail: `${observed} ngày đã ghi nhận theo mốc kích hoạt wave.` },
    { id: 'release-readiness', label: 'Release readiness không có blocker', passed: readinessReady, detail: readinessReady ? 'Mọi blocking gate hiện đều đạt.' : `${finiteCount(readiness?.summary?.blockers)} blocking gate chưa đạt.` },
    { id: 'blocked-feedback', label: 'Không có phản hồi mức bị chặn', passed: blockedFeedback === 0, detail: `${blockedFeedback} blocker đang mở.` },
    { id: 'erp-fallback', label: 'ERP vẫn là fallback mặc định', passed: readiness?.gates?.find((gate) => gate.id === 'erp-fallback')?.passed === true, detail: 'Kết quả lấy từ live readiness, không suy luận từ lịch sử cá nhân.' },
    { id: 'critical-incidents', label: 'Không có incident critical đang mở', passed: criticalIncidents === 0, detail: `${criticalIncidents} incident critical chưa khép lại.` },
    { id: 'incident-review', label: 'Incident review đã hoàn tất', passed: openIncidents === 0, detail: `${openIncidents} incident đang mở hoặc theo dõi.` },
  ];
  const hardStop = !readinessReady || blockedFeedback > 0 || criticalIncidents > 0;
  const recommendation = hardStop ? 'no_go' : minimumObserved && openIncidents === 0 ? 'go' : 'hold';
  return {
    available: minimumObserved || hardStop,
    recommendation,
    label: recommendation === 'go' ? 'GO · Có thể đề xuất wave kế tiếp' : recommendation === 'no_go' ? 'NO-GO · Dừng mở rộng' : 'HOLD · Tiếp tục quan sát',
    observedDays: observed,
    observationWindow: {
      minimumDays: REALM_PILOT_WAVE_MIN_DAYS,
      maximumDays: REALM_PILOT_WAVE_MAX_DAYS,
      status: observed < REALM_PILOT_WAVE_MIN_DAYS ? 'collecting' : observed <= REALM_PILOT_WAVE_MAX_DAYS ? 'ready' : 'overdue',
    },
    criteria,
    generatedAt: now.toISOString(),
    privacy: { aggregateOnly: true, performanceTracking: false, durationTracking: false },
  };
}

function activationBaseline(readiness, now) {
  const available = finiteCount(readiness?.metrics?.cohort?.available);
  const eligible = finiteCount(readiness?.metrics?.eligibleUsers);
  return {
    eligibleUsers: eligible,
    fallbackUsers: Math.max(0, available - eligible),
    blockers: finiteCount(readiness?.summary?.blockers),
    unresolvedFeedback: finiteCount(readiness?.summary?.unresolvedFeedback),
    blockedFeedback: finiteCount(readiness?.summary?.blockedFeedback),
    capturedAt: now.toISOString(),
  };
}

function activationWindow(startedAt) {
  const start = new Date(startedAt || '');
  if (Number.isNaN(start.getTime())) return null;
  return new Date(start.getTime() + REALM_PILOT_CANARY_WINDOW_MINUTES * 60_000).toISOString();
}

export function buildRealmPilotActivationGuard({ wave, policy, readiness, now = new Date() } = {}) {
  const activation = normalizeActivation(wave?.activation) || (wave?.activatedAt
    ? normalizeActivation({ state: 'watching', startedAt: wave.activatedAt, checkpointDueAt: activationWindow(wave.activatedAt) })
    : null);
  const startedAt = activation?.startedAt || safeIso(wave?.activatedAt);
  const checkpointDueAt = activation?.checkpointDueAt || activationWindow(startedAt);
  const checkpoint = checkpointDueAt ? new Date(checkpointDueAt) : null;
  const remainingMinutes = checkpoint && !Number.isNaN(checkpoint.getTime())
    ? Math.max(0, Math.ceil((checkpoint.getTime() - now.getTime()) / 60_000))
    : REALM_PILOT_CANARY_WINDOW_MINUTES;
  const erpFallback = readiness?.gates?.find((gate) => gate.id === 'erp-fallback')?.passed === true;
  const criteria = [
    { id: 'wave-active', label: 'Pilot wave đang active', passed: wave?.status === 'active', detail: wave?.status === 'active' ? 'Invitation đã phát hành qua ERP Notification.' : 'Canary guard chỉ chạy trên wave active.' },
    { id: 'policy-bound', label: 'Policy không drift', passed: policy?.mode === 'pilot' && wave?.policyVersion === policy?.version, detail: `Wave v${finiteCount(wave?.policyVersion)} · policy v${finiteCount(policy?.version)}.` },
    { id: 'live-readiness', label: 'Live readiness sạch', passed: readiness?.ready === true, detail: `${finiteCount(readiness?.summary?.blockers)} blocking gate hiện tại.` },
    { id: 'blocked-feedback', label: 'Không có feedback bị chặn', passed: finiteCount(readiness?.summary?.blockedFeedback) === 0, detail: `${finiteCount(readiness?.summary?.blockedFeedback)} feedback mức blocked đang mở.` },
    { id: 'erp-fallback', label: 'ERP fallback sẵn sàng', passed: erpFallback, detail: 'Người dùng luôn có đường quay lại ERP · CRM.' },
  ];
  const healthy = criteria.every((criterion) => criterion.passed);
  let state = 'not_started';
  if (activation?.state === 'rolled_back' || wave?.status === 'paused') state = 'rolled_back';
  else if (activation?.state === 'cleared') state = 'cleared';
  else if (wave?.status === 'active' && !healthy) state = 'blocked';
  else if (wave?.status === 'active' && remainingMinutes === 0) state = 'ready';
  else if (wave?.status === 'active') state = 'watching';
  const labels = {
    not_started: 'Chưa bắt đầu',
    watching: `Đang quan sát · còn ${remainingMinutes} phút`,
    ready: 'Sẵn sàng xác nhận',
    blocked: 'Guardrail bị chặn',
    cleared: 'Canary đã đạt',
    rolled_back: 'Đã rollback về ERP',
  };
  return {
    state,
    label: labels[state],
    healthy,
    canClear: state === 'ready',
    canRollback: wave?.status === 'active',
    windowMinutes: REALM_PILOT_CANARY_WINDOW_MINUTES,
    startedAt,
    checkpointDueAt,
    remainingMinutes,
    criteria,
    baseline: activation?.baseline || null,
    clearedAt: activation?.clearedAt || null,
    clearedByName: activation?.clearedByName || null,
    rolledBackAt: activation?.rolledBackAt || null,
    decisionNote: activation?.decisionNote || null,
    privacy: { aggregateOnly: true, rosterIncluded: false, performanceTracking: false, durationTracking: false },
  };
}

export function buildRealmPilotOperationAlerts({ policy, operations, readiness, rehearsal, activationGuard, incidentCommand, now = new Date() } = {}) {
  const wave = currentWave(operations || DEFAULT_OPERATIONS);
  const alerts = [];
  if (!readiness?.ready) {
    alerts.push({ id: 'readiness-blocked', severity: 'critical', title: 'Readiness đang chặn rollout', detail: `${finiteCount(readiness?.summary?.blockers)} blocking gate cần xử lý trước khi kích hoạt hoặc mở rộng.` });
  }
  if (finiteCount(readiness?.summary?.blockedFeedback) > 0) {
    alerts.push({ id: 'blocked-feedback', severity: 'critical', title: 'Có nhân sự bị chặn', detail: `${finiteCount(readiness.summary.blockedFeedback)} phản hồi mức blocked đang mở trong Guild Support.` });
  }
  if (policy.mode === 'pilot' && !rehearsal?.readyForWave) {
    alerts.push({ id: 'rehearsal-required', severity: 'warning', title: 'Launch rehearsal chưa được niêm phong', detail: rehearsal?.reason || 'Cần maker–checker rehearsal trước khi gửi hoặc kích hoạt pilot wave.' });
  }
  if (wave && wave.policyVersion !== policy.version && wave.status !== 'completed') {
    alerts.push({ id: 'policy-drift', severity: 'warning', title: 'Wave không còn khớp policy', detail: `Wave khóa ở policy v${wave.policyVersion}; policy hiện tại là v${policy.version}. Hãy đóng wave cũ và tạo wave mới.` });
  }
  if (wave?.status === 'active' && wave.plannedEndAt && new Date(wave.plannedEndAt).getTime() < now.getTime()) {
    alerts.push({ id: 'wave-overdue', severity: 'warning', title: 'Wave đã qua ngày kết thúc dự kiến', detail: 'Tạo báo cáo Go/No-go rồi hoàn tất hoặc tạm dừng wave.' });
  }
  if (activationGuard?.state === 'blocked') {
    alerts.push({ id: 'canary-blocked', severity: 'critical', title: 'Canary guardrail đang chặn', detail: 'Không xác nhận activation; xử lý blocker hoặc rollback ngay về ERP.' });
  }
  if (activationGuard?.state === 'ready') {
    alerts.push({ id: 'canary-checkpoint-ready', severity: 'warning', title: 'Canary checkpoint đã đến hạn', detail: 'Director cần review số liệu tổng hợp rồi xác nhận hoặc rollback.' });
  }
  if (finiteCount(incidentCommand?.summary?.criticalOpen) > 0) {
    alerts.push({ id: 'critical-incident-open', severity: 'critical', title: 'Incident critical đang mở', detail: 'Kill switch đã đưa cohort về ERP; không tái kích hoạt hoặc hoàn tất wave trước khi incident được khống chế.' });
  } else if (finiteCount(incidentCommand?.summary?.warningOpen) > 0) {
    alerts.push({ id: 'warning-incident-open', severity: 'warning', title: 'Incident đang được theo dõi', detail: 'Go/No-go giữ ở HOLD cho đến khi incident review hoàn tất.' });
  }
  if (!wave && policy.mode === 'pilot') {
    alerts.push({ id: 'wave-missing', severity: 'info', title: 'Policy pilot chưa có wave vận hành', detail: 'Tạo một wave 7–14 ngày để có owner, cửa sổ đánh giá và điểm dừng rõ ràng.' });
  }
  if (policy.mode === 'off') {
    alerts.push({ id: 'kill-switch-active', severity: 'info', title: 'Realm đang dùng kill switch', detail: 'ERP · CRM tiếp tục hoạt động; dữ liệu Realm và migration được giữ nguyên.' });
  }
  return alerts;
}

function publicWave(wave, user) {
  if (!wave) return null;
  return {
    ...wave,
    canApprove: wave.status === 'awaiting_approval' && wave.submittedById !== user.id,
    submittedByMe: wave.submittedById === user.id,
    privacy: { aggregateOnly: true, rosterIncluded: false },
  };
}

export async function loadRealmPilotOperationsDashboard(db, sessionUser, { now = new Date(), notificationDelivery = null } = {}) {
  requireDirector(sessionUser);
  const setting = await db.setting.findUnique({ where: { id: 1 }, select: { json: true } });
  const settingValue = parseSetting(setting);
  const policy = parseRealmPilotConfig(setting?.json);
  const operations = parseRealmPilotOperations(setting?.json);
  const approvalTimeoutCutoff = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const [readiness, pendingLaunchApprovals, timedOutLaunchApprovals] = await Promise.all([
    loadRealmLaunchReadiness(db, policy, now),
    db.approval.count({ where: { type: 'realm_launch', status: 'pending' } }),
    db.approval.count({ where: { type: 'realm_launch', status: 'pending', createdAt: { lte: approvalTimeoutCutoff } } }),
  ]);
  const wave = currentWave(operations);
  const rehearsal = buildRealmPilotRehearsalGate(settingValue, policy, now, wave?.rehearsalId || null);
  const activationGuard = buildRealmPilotActivationGuard({ wave, policy, readiness, now });
  const incidentCommand = buildRealmPilotIncidentCommand({ operations, wave, policy, readiness, now });
  const report = buildRealmPilotGoNoGoReport({ wave, readiness, incidentCommand, now });
  return {
    source: 'erp',
    operations: {
      version: operations.version,
      waves: operations.waves.map((item) => publicWave(item, sessionUser)),
      currentWave: publicWave(wave, sessionUser),
    },
    policy: publicRealmPilotConfig(policy),
    metrics: readiness.metrics,
    readiness: {
      ready: readiness.ready,
      status: readiness.status,
      summary: readiness.summary,
      gates: readiness.gates,
      evaluatedAt: readiness.evaluatedAt,
    },
    launchApprovals: { pending: finiteCount(pendingLaunchApprovals), timedOut: finiteCount(timedOutLaunchApprovals) },
    rehearsal,
    activationGuard,
    incidentCommand,
    alerts: buildRealmPilotOperationAlerts({ policy, operations, readiness, rehearsal, activationGuard, incidentCommand, now }),
    report: wave?.finalReport ? { ...report, ...wave.finalReport, available: true } : report,
    chaosReadiness: buildRealmChaosReadiness({
      metrics: readiness.metrics,
      policy,
      readiness,
      approvalTimeouts: timedOutLaunchApprovals,
      notificationDelivery,
    }),
    notificationDelivery,
    privacy: { aggregateOnly: true, rosterIncluded: false, performanceTracking: false, durationTracking: false },
  };
}

function validateExpectedVersion(operations, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== operations.version) {
    throw new RealmOperationError('Bảng vận hành vừa được cập nhật. Hãy tải lại trước khi thao tác.', 409, 'realm_pilot_operations_version_conflict');
  }
}

function parseSetting(row) {
  try { return JSON.parse(row?.json || '{}'); } catch { return {}; }
}

async function persistOperations(tx, setting, operations, user, action, wave, detail) {
  const next = {
    ...operations,
    version: operations.version + 1,
    waves: operations.waves.slice(0, REALM_PILOT_WAVE_LIMIT),
    incidents: (operations.incidents || []).slice(0, REALM_PILOT_INCIDENT_LIMIT),
  };
  const json = JSON.stringify({ ...setting, realmPilotOperations: next });
  await tx.setting.upsert({ where: { id: 1 }, create: { id: 1, json }, update: { json } });
  await tx.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name || 'Director',
      action,
      entity: 'realm_pilot_operations',
      refId: wave.id,
      detail: `${detail}; wave ${wave.id}; status ${wave.status}; canary ${wave.activation?.state || 'not_started'}; incidents ${finiteCount(next.incidents?.length)}; policy v${wave.policyVersion}; eligible ${wave.eligibleUsers}; fallback ${wave.fallbackUsers}; no roster`,
    },
  });
  return next;
}

function requireWave(operations, waveId) {
  const index = operations.waves.findIndex((wave) => wave.id === cleanText(waveId, 100));
  if (index < 0) throw new RealmOperationError('Không tìm thấy pilot wave.', 404, 'realm_pilot_wave_not_found');
  return { index, wave: operations.waves[index] };
}

function replaceWave(operations, index, wave) {
  const waves = [...operations.waves];
  waves[index] = normalizeStoredWave(wave);
  return { ...operations, waves };
}

function requireIncident(operations, waveId, incidentId) {
  const index = (operations.incidents || []).findIndex((incident) => incident.id === cleanText(incidentId, 100) && incident.waveId === waveId);
  if (index < 0) throw new RealmOperationError('Không tìm thấy incident trong pilot wave này.', 404, 'realm_pilot_incident_not_found');
  return { index, incident: operations.incidents[index] };
}

function replaceIncident(operations, index, incident) {
  const incidents = [...(operations.incidents || [])];
  incidents[index] = normalizeIncident(incident);
  return { ...operations, incidents };
}

function plannedWindow(input, now) {
  const durationDays = Math.max(REALM_PILOT_WAVE_MIN_DAYS, Math.min(REALM_PILOT_WAVE_MAX_DAYS, finiteCount(input?.durationDays) || REALM_PILOT_WAVE_MIN_DAYS));
  const requestedStart = safeIso(input?.plannedStartAt);
  const start = requestedStart ? new Date(requestedStart) : now;
  const earliest = new Date(now.getTime() - 86_400_000);
  const latest = new Date(now.getTime() + 30 * 86_400_000);
  if (start < earliest || start > latest) {
    throw new RealmOperationError('Ngày bắt đầu wave phải nằm trong 30 ngày tới.', 400, 'realm_pilot_wave_start_invalid');
  }
  return {
    durationDays,
    plannedStartAt: start.toISOString(),
    plannedEndAt: new Date(start.getTime() + durationDays * 86_400_000).toISOString(),
  };
}

export async function createRealmPilotWave(db, sessionUser, input = {}, { now = new Date(), idFactory = randomUUID } = {}) {
  requireDirector(sessionUser);
  const name = cleanText(input.name, 80);
  if (name.length < 3) throw new RealmOperationError('Tên wave cần ít nhất 3 ký tự.', 400, 'realm_pilot_wave_name_required');
  const window = plannedWindow(input, now);
  return db.$transaction(async (tx) => {
    const row = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
    const setting = parseSetting(row);
    const policy = normalizeRealmPilotConfig(setting.realmPilot);
    const operations = normalizeRealmPilotOperations(setting.realmPilotOperations);
    validateExpectedVersion(operations, input.expectedVersion);
    if (policy.mode !== 'pilot') {
      throw new RealmOperationError('Hãy đưa policy vào chế độ pilot qua controlled launch trước khi tạo wave.', 409, 'realm_pilot_wave_policy_required');
    }
    if (operations.waves.some((wave) => OPEN_STATUSES.has(wave.status))) {
      throw new RealmOperationError('Đang có một wave chưa hoàn tất. Hãy đóng wave đó trước.', 409, 'realm_pilot_wave_open_exists');
    }
    const readiness = await loadRealmLaunchReadiness(tx, policy, now);
    const wave = normalizeStoredWave({
      id: `rpw_${cleanText(idFactory(), 80)}`,
      name,
      status: 'draft',
      ...waveSnapshot(policy, readiness.metrics),
      ...window,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdById: sessionUser.id,
      createdByName: sessionUser.name,
    });
    const next = await persistOperations(tx, setting, { ...operations, waves: [wave, ...operations.waves] }, sessionUser, 'create', wave, 'Created pilot operations wave');
    return { operations: next, wave };
  }, { isolationLevel: 'Serializable' });
}

async function eligibleMemberIds(tx, policy) {
  const users = await tx.user.findMany({
    where: { status: 'active', userType: 'employee' },
    select: { id: true, role: true, roles: true, userType: true, workspacePreference: true },
  });
  return users.filter((user) => realmPilotDecision(user, policy, user.workspacePreference).allowed).map((user) => user.id);
}

async function directorIds(tx, excludedId) {
  const users = await tx.user.findMany({
    where: { status: 'active', userType: 'employee' },
    select: { id: true, role: true, roles: true, userType: true },
  });
  return users.filter((user) => user.id !== excludedId && rolesOf(user).includes('DIRECTOR')).map((user) => user.id);
}

function createNotificationDrafts(userIds, text, route = '/settings') {
  const ids = [...new Set(userIds.filter(Boolean))];
  return ids.map((userId) => ({ userId, text: cleanText(text, 320), route }));
}

export async function deliverRealmPilotNotifications(db, drafts = []) {
  if (!drafts.length) return { state: 'not_required', attempted: 0, delivered: 0 };
  try {
    await db.notification.createMany({ data: drafts });
    return { state: 'delivered', attempted: drafts.length, delivered: drafts.length };
  } catch {
    return { state: 'degraded', attempted: drafts.length, delivered: 0, code: 'realm_notification_delivery_failed' };
  }
}

export async function transitionRealmPilotWave(db, sessionUser, input = {}, { now = new Date(), idFactory = randomUUID } = {}) {
  requireDirector(sessionUser);
  const action = cleanText(input.action, 30);
  if (!['submit', 'approve', 'reject', 'clear_activation', 'report_incident', 'monitor_incident', 'resolve_incident', 'pause', 'complete'].includes(action)) {
    throw new RealmOperationError('Hành động pilot wave không hợp lệ.', 400, 'realm_pilot_wave_action_invalid');
  }
  const transition = await db.$transaction(async (tx) => {
    let row = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
    let setting = parseSetting(row);
    let policy = normalizeRealmPilotConfig(setting.realmPilot);
    let operations = normalizeRealmPilotOperations(setting.realmPilotOperations);
    validateExpectedVersion(operations, input.expectedVersion);
    const { index, wave: storedWave } = requireWave(operations, input.waveId);
    let wave = { ...storedWave, updatedAt: now.toISOString() };
    let incident = null;
    const notifications = [];

    if (action === 'submit') {
      if (wave.status !== 'draft') throw new RealmOperationError('Chỉ wave nháp mới được gửi duyệt.', 409, 'realm_pilot_wave_transition_invalid');
      if (policy.mode !== 'pilot' || wave.policyVersion !== policy.version) {
        throw new RealmOperationError('Policy đã đổi; hãy đóng wave cũ và tạo wave mới.', 409, 'realm_pilot_wave_policy_stale');
      }
      const readiness = await loadRealmLaunchReadiness(tx, policy, now);
      if (!readiness.ready) throw new RealmOperationError('Readiness còn blocker; chưa thể gửi wave duyệt.', 409, 'realm_pilot_wave_readiness_blocked');
      const rehearsal = requireValidRealmPilotRehearsal(setting, policy, now);
      wave = {
        ...wave,
        status: 'awaiting_approval',
        ...waveSnapshot(policy, readiness.metrics),
        rehearsalId: rehearsal.rehearsalId,
        rehearsalExpiresAt: rehearsal.expiresAt,
        submittedAt: now.toISOString(),
        submittedById: sessionUser.id,
        submittedByName: sessionUser.name,
        decisionNote: null,
      };
      notifications.push(...createNotificationDrafts(await directorIds(tx, sessionUser.id), `Chờ bạn duyệt kích hoạt pilot wave “${wave.name}” (policy v${wave.policyVersion}).`));
    }

    if (action === 'approve') {
      if (wave.status !== 'awaiting_approval') throw new RealmOperationError('Wave không còn chờ duyệt.', 409, 'realm_pilot_wave_transition_invalid');
      if (wave.submittedById === sessionUser.id) throw new RealmOperationError('Director gửi wave không được tự duyệt.', 409, 'self_approval_forbidden');
      if (policy.mode !== 'pilot' || wave.policyVersion !== policy.version) {
        throw new RealmOperationError('Policy đã đổi; wave không thể kích hoạt.', 409, 'realm_pilot_wave_policy_stale');
      }
      const readiness = await loadRealmLaunchReadiness(tx, policy, now);
      if (!readiness.ready) throw new RealmOperationError('Readiness vừa xuất hiện blocker mới; wave chưa được kích hoạt.', 409, 'realm_pilot_wave_readiness_blocked');
      const rehearsal = requireValidRealmPilotRehearsal(setting, policy, now, wave.rehearsalId);
      wave = {
        ...wave,
        status: 'active',
        ...waveSnapshot(policy, readiness.metrics),
        rehearsalExpiresAt: rehearsal.expiresAt,
        activatedAt: now.toISOString(),
        approvedById: sessionUser.id,
        approvedByName: sessionUser.name,
        activation: {
          state: 'watching',
          startedAt: now.toISOString(),
          checkpointDueAt: activationWindow(now.toISOString()),
          baseline: activationBaseline(readiness, now),
        },
        decisionNote: cleanText(input.note, 240) || null,
      };
      notifications.push(...createNotificationDrafts(await eligibleMemberIds(tx, policy), `Pilot wave “${wave.name}” đã mở. Bạn có thể vào Realm hoặc tiếp tục dùng ERP · CRM bất kỳ lúc nào.`, '/realm'));
    }

    if (action === 'reject') {
      if (wave.status !== 'awaiting_approval') throw new RealmOperationError('Wave không còn chờ duyệt.', 409, 'realm_pilot_wave_transition_invalid');
      if (wave.submittedById === sessionUser.id) throw new RealmOperationError('Director gửi wave không được tự duyệt.', 409, 'self_approval_forbidden');
      wave = { ...wave, status: 'draft', submittedAt: null, submittedById: null, submittedByName: null, decisionNote: cleanText(input.note, 240) || 'Checker yêu cầu chỉnh sửa trước khi gửi lại.' };
    }

    if (action === 'clear_activation') {
      if (wave.status !== 'active') throw new RealmOperationError('Chỉ wave active mới có canary checkpoint.', 409, 'realm_pilot_canary_transition_invalid');
      if (policy.mode !== 'pilot' || wave.policyVersion !== policy.version) {
        throw new RealmOperationError('Policy đã drift; không thể xác nhận canary.', 409, 'realm_pilot_wave_policy_stale');
      }
      const readiness = await loadRealmLaunchReadiness(tx, policy, now);
      const guard = buildRealmPilotActivationGuard({ wave, policy, readiness, now });
      if (guard.state === 'watching') throw new RealmOperationError(`Canary cần quan sát đủ ${REALM_PILOT_CANARY_WINDOW_MINUTES} phút.`, 409, 'realm_pilot_canary_window_open');
      if (guard.state !== 'ready') throw new RealmOperationError('Canary guardrail còn blocker; hãy xử lý hoặc rollback về ERP.', 409, 'realm_pilot_canary_blocked');
      wave = {
        ...wave,
        activation: {
          ...(wave.activation || {}),
          state: 'cleared',
          clearedAt: now.toISOString(),
          clearedById: sessionUser.id,
          clearedByName: sessionUser.name,
          decisionNote: cleanText(input.note, 240) || 'Canary checkpoint đạt; tiếp tục wave trong cohort hiện tại.',
        },
      };
      notifications.push(...createNotificationDrafts(await directorIds(tx, sessionUser.id), `Canary checkpoint của pilot wave “${wave.name}” đã đạt; cohort hiện tại tiếp tục, chưa mở rộng tự động.`, '/settings#realm-pilot-operations-title'));
    }

    if (action === 'report_incident') {
      if (wave.status !== 'active' || policy.mode !== 'pilot') {
        throw new RealmOperationError('Chỉ wave active mới nhận incident mới.', 409, 'realm_pilot_incident_wave_inactive');
      }
      const category = INCIDENT_CATEGORY_MAP.get(cleanText(input.category, 40));
      if (!category) throw new RealmOperationError('Loại incident không hợp lệ.', 400, 'realm_pilot_incident_category_invalid');
      const severity = category.defaultSeverity === 'critical'
        ? 'critical'
        : INCIDENT_SEVERITY_SET.has(input.severity) ? input.severity : category.defaultSeverity;
      if ((operations.incidents || []).some((item) => item.waveId === wave.id && item.category === category.id && item.status !== 'resolved')) {
        throw new RealmOperationError('Incident cùng loại đang được xử lý.', 409, 'realm_pilot_incident_duplicate');
      }
      const readiness = await loadRealmLaunchReadiness(tx, policy, now);
      incident = normalizeIncident({
        id: `rpi_${cleanText(idFactory(), 80)}`,
        waveId: wave.id,
        category: category.id,
        severity,
        status: 'open',
        policyVersion: policy.version,
        openedAt: now.toISOString(),
        rollbackTriggered: severity === 'critical',
        snapshot: incidentSnapshot(readiness, now),
      });
      if (severity === 'critical') {
        const memberIds = await eligibleMemberIds(tx, policy);
        policy = await applyRealmPilotConfigInTransaction(tx, sessionUser, { ...policy, mode: 'off', version: policy.version });
        row = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
        setting = parseSetting(row);
        operations = normalizeRealmPilotOperations(setting.realmPilotOperations);
        validateExpectedVersion(operations, input.expectedVersion);
        wave = {
          ...wave,
          status: 'paused',
          pausedAt: now.toISOString(),
          decisionNote: `Incident critical · ${category.label}. Cohort đã rollback về ERP.`,
          activation: {
            ...(wave.activation || {}),
            state: 'rolled_back',
            rolledBackAt: now.toISOString(),
            decisionNote: `Incident critical · ${category.label}.`,
          },
        };
        notifications.push(...createNotificationDrafts(memberIds, `Pilot wave “${wave.name}” đã rollback về ERP do incident vận hành. Tiếp tục công việc trên ERP · CRM; dữ liệu được giữ nguyên.`, '/dashboard'));
      }
      notifications.push(...createNotificationDrafts(await directorIds(tx, sessionUser.id), `${severity === 'critical' ? 'Critical' : 'Warning'} incident trong pilot wave “${wave.name}”: ${category.label}.`, '/settings#realm-pilot-operations-title'));
      operations = { ...operations, incidents: [incident, ...(operations.incidents || [])].slice(0, REALM_PILOT_INCIDENT_LIMIT) };
    }

    if (action === 'monitor_incident' || action === 'resolve_incident') {
      if (!['active', 'paused'].includes(wave.status)) {
        throw new RealmOperationError('Wave hiện không cho phép cập nhật incident.', 409, 'realm_pilot_incident_wave_inactive');
      }
      const found = requireIncident(operations, wave.id, input.incidentId);
      incident = found.incident;
      if (action === 'monitor_incident') {
        if (incident.status !== 'open') throw new RealmOperationError('Incident không còn ở trạng thái mới.', 409, 'realm_pilot_incident_transition_invalid');
        incident = { ...incident, status: 'monitoring', monitoringAt: now.toISOString() };
      } else {
        if (incident.status !== 'monitoring') throw new RealmOperationError('Incident phải qua bước theo dõi trước khi khép lại.', 409, 'realm_pilot_incident_transition_invalid');
        const readiness = await loadRealmLaunchReadiness(tx, policy, now);
        const erpFallback = readiness?.gates?.find((gate) => gate.id === 'erp-fallback')?.passed === true;
        const containedInErp = wave.status === 'paused' && policy.mode === 'off' && erpFallback;
        const verifiedRecovery = wave.status === 'active' && readiness.ready === true && finiteCount(readiness.summary?.blockedFeedback) === 0;
        if (!containedInErp && !verifiedRecovery) {
          throw new RealmOperationError('Chưa xác minh được ERP fallback hoặc live readiness; incident phải tiếp tục theo dõi.', 409, 'realm_pilot_incident_resolution_blocked');
        }
        incident = { ...incident, status: 'resolved', resolvedAt: now.toISOString(), resolution: containedInErp ? 'contained_in_erp' : 'verified_recovery' };
      }
      operations = replaceIncident(operations, found.index, incident);
      notifications.push(...createNotificationDrafts(await directorIds(tx, sessionUser.id), `Incident “${INCIDENT_CATEGORY_MAP.get(incident.category).label}” đã chuyển sang ${incident.status === 'resolved' ? 'đã khống chế' : 'đang theo dõi'}.`, '/settings#realm-pilot-operations-title'));
    }

    if (action === 'pause' || action === 'complete') {
      const allowedStatuses = action === 'pause' ? ['active'] : ['draft', 'awaiting_approval', 'active', 'paused'];
      if (!allowedStatuses.includes(wave.status)) throw new RealmOperationError('Trạng thái wave không cho phép thao tác này.', 409, 'realm_pilot_wave_transition_invalid');
      const wasActive = wave.status === 'active';
      const memberIds = wasActive ? await eligibleMemberIds(tx, policy) : [];
      const readiness = await loadRealmLaunchReadiness(tx, policy, now);
      if (wasActive && policy.mode !== 'off') {
        policy = await applyRealmPilotConfigInTransaction(tx, sessionUser, { ...policy, mode: 'off', version: policy.version });
        row = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
        setting = parseSetting(row);
        operations = normalizeRealmPilotOperations(setting.realmPilotOperations);
        validateExpectedVersion(operations, input.expectedVersion);
      }
      if (action === 'pause') {
        const note = cleanText(input.note, 240) || 'Wave được tạm dừng; cohort quay về ERP.';
        wave = {
          ...wave,
          status: 'paused',
          pausedAt: now.toISOString(),
          decisionNote: note,
          activation: {
            ...(wave.activation || {}),
            state: 'rolled_back',
            rolledBackAt: now.toISOString(),
            decisionNote: note,
          },
        };
        notifications.push(...createNotificationDrafts(memberIds, `Pilot wave “${wave.name}” đang tạm dừng. Hãy tiếp tục công việc trên ERP · CRM; dữ liệu của bạn vẫn được giữ nguyên.`, '/dashboard'));
      } else {
        const incidentCommand = buildRealmPilotIncidentCommand({ operations, wave, policy, readiness, now });
        if (finiteCount(incidentCommand.summary.open) + finiteCount(incidentCommand.summary.monitoring) > 0) {
          throw new RealmOperationError('Còn incident chưa khép lại; chưa thể hoàn tất wave.', 409, 'realm_pilot_incident_open');
        }
        const report = buildRealmPilotGoNoGoReport({ wave, readiness, incidentCommand, now });
        wave = {
          ...wave,
          status: 'completed',
          completedAt: now.toISOString(),
          decisionNote: cleanText(input.note, 240) || report.label,
          finalReport: {
            recommendation: report.recommendation,
            observedDays: report.observedDays,
            unresolvedFeedback: finiteCount(readiness.summary?.unresolvedFeedback),
            blockedFeedback: finiteCount(readiness.summary?.blockedFeedback),
            openIncidents: 0,
            criticalIncidents: 0,
            generatedAt: now.toISOString(),
          },
        };
        if (wasActive) notifications.push(...createNotificationDrafts(memberIds, `Pilot wave “${wave.name}” đã hoàn tất. ERP · CRM là giao diện tiếp tục làm việc; dữ liệu Realm được giữ nguyên.`, '/dashboard'));
      }
    }

    operations = replaceWave(operations, index, wave);
    const next = await persistOperations(tx, setting, operations, sessionUser, action, wave, `${action} pilot wave; incident ${incident?.category || 'none'}; notifications queued ${notifications.length}`);
    return { operations: next, wave, incident, policy, notifications };
  }, { isolationLevel: 'Serializable' });
  const notificationDelivery = await deliverRealmPilotNotifications(db, transition.notifications);
  return {
    ...transition,
    notifications: undefined,
    notificationCount: notificationDelivery.delivered,
    notificationDelivery,
  };
}
