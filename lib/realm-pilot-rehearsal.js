import { randomUUID } from 'node:crypto';
import { isDirector, rolesOf } from './perm.js';
import { RealmOperationError } from './realm-operation.js';
import { normalizeRealmPilotConfig, parseRealmPilotConfig, publicRealmPilotConfig } from './realm-pilot.js';
import { loadRealmLaunchReadiness } from './realm-readiness.js';

export const REALM_REHEARSAL_TTL_HOURS = 24;
export const REALM_REHEARSAL_LIMIT = 12;
export const REALM_REHEARSAL_STATUSES = Object.freeze(['draft', 'awaiting_approval', 'sealed']);
export const REALM_REHEARSAL_SCENARIOS = Object.freeze([
  Object.freeze({ id: 'cross-surface-contact', label: 'Liên hệ chéo ERP ↔ Realm', detail: 'Người dùng ERP nhận được liên hệ từ Realm và phản hồi qua cùng notification/message hiện có.' }),
  Object.freeze({ id: 'record-deep-links', label: 'Deep link record ERP', detail: 'Task, Lead và Project mở đúng route ERP; không tạo bản sao record trong Realm.' }),
  Object.freeze({ id: 'guild-support-bridge', label: 'Guild Support → Ticket ERP', detail: 'Phản hồi tạo Ticket, notification và audit mà không sao chép dữ liệu nghiệp vụ riêng tư.' }),
  Object.freeze({ id: 'kill-switch-rehearsal', label: 'Rehearsal kill switch', detail: 'Đã xác minh đường về /dashboard, giữ nguyên ledger, Ticket, record và migration.' }),
  Object.freeze({ id: 'mobile-accessibility', label: 'Mobile & accessibility', detail: '375px/landscape không tràn ngang; keyboard focus và touch target tối thiểu 44px.' }),
]);

const STATUS_SET = new Set(REALM_REHEARSAL_STATUSES);
const SCENARIO_IDS = new Set(REALM_REHEARSAL_SCENARIOS.map((scenario) => scenario.id));
const DEFAULT_REHEARSALS = Object.freeze({ version: 0, runs: Object.freeze([]) });

function requireDirector(user) {
  if (!isDirector(user)) {
    throw new RealmOperationError('Chỉ Giám đốc được vận hành launch rehearsal.', 403, 'realm_rehearsal_forbidden');
  }
}

function cleanText(value, max = 160) {
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

function normalizeCheck(value = {}, scenarioId) {
  const result = ['pending', 'passed', 'failed'].includes(value.result) ? value.result : 'pending';
  return {
    id: scenarioId,
    result,
    evidence: cleanText(value.evidence, 240) || null,
    updatedAt: safeIso(value.updatedAt),
  };
}

function normalizeStoredRun(value = {}) {
  const id = cleanText(value.id, 100);
  if (!id) return null;
  const suppliedChecks = new Map(
    (Array.isArray(value.checks) ? value.checks : [])
      .filter((check) => SCENARIO_IDS.has(check?.id))
      .map((check) => [check.id, check]),
  );
  return {
    id,
    name: cleanText(value.name, 80) || 'Realm launch rehearsal',
    status: STATUS_SET.has(value.status) ? value.status : 'draft',
    policyVersion: Math.max(0, Number.isInteger(value.policyVersion) ? value.policyVersion : 0),
    checks: REALM_REHEARSAL_SCENARIOS.map((scenario) => normalizeCheck(suppliedChecks.get(scenario.id), scenario.id)),
    createdAt: safeIso(value.createdAt),
    updatedAt: safeIso(value.updatedAt),
    createdById: cleanText(value.createdById, 100) || null,
    createdByName: cleanText(value.createdByName, 100) || 'Director',
    submittedAt: safeIso(value.submittedAt),
    submittedById: cleanText(value.submittedById, 100) || null,
    submittedByName: cleanText(value.submittedByName, 100) || null,
    sealedAt: safeIso(value.sealedAt),
    sealedById: cleanText(value.sealedById, 100) || null,
    sealedByName: cleanText(value.sealedByName, 100) || null,
    expiresAt: safeIso(value.expiresAt),
    decisionNote: cleanText(value.decisionNote, 240) || null,
  };
}

export function normalizeRealmPilotRehearsals(value = {}) {
  return {
    version: Number.isInteger(value?.version) ? Math.max(0, value.version) : 0,
    runs: Array.isArray(value?.runs)
      ? value.runs.map(normalizeStoredRun).filter(Boolean).slice(0, REALM_REHEARSAL_LIMIT)
      : [],
  };
}

export function parseRealmPilotRehearsals(settingJson) {
  try {
    const setting = JSON.parse(settingJson || '{}');
    return normalizeRealmPilotRehearsals(setting?.realmPilotRehearsal);
  } catch {
    return normalizeRealmPilotRehearsals(DEFAULT_REHEARSALS);
  }
}

function parseSetting(row) {
  try { return JSON.parse(row?.json || '{}'); } catch { return {}; }
}

function latestValidSealedRun(rehearsals, policy, now, expectedId = null) {
  const nowMs = now.getTime();
  return rehearsals.runs.find((run) => (
    run.status === 'sealed'
    && run.policyVersion === policy.version
    && (!expectedId || run.id === expectedId)
    && run.expiresAt
    && new Date(run.expiresAt).getTime() > nowMs
    && run.checks.every((check) => check.result === 'passed')
  )) || null;
}

export function buildRealmPilotRehearsalGate(settingValue, policyValue, now = new Date(), expectedId = null) {
  const setting = settingValue && typeof settingValue === 'object' ? settingValue : {};
  const policy = normalizeRealmPilotConfig(policyValue || setting.realmPilot);
  const rehearsals = normalizeRealmPilotRehearsals(setting.realmPilotRehearsal);
  const sealed = latestValidSealedRun(rehearsals, policy, now, expectedId);
  const latestSealed = rehearsals.runs.find((run) => run.status === 'sealed') || null;
  let reason = 'Chưa có rehearsal được Director thứ hai niêm phong.';
  if (latestSealed && latestSealed.policyVersion !== policy.version) reason = `Rehearsal khóa ở policy v${latestSealed.policyVersion}; policy hiện tại là v${policy.version}.`;
  else if (latestSealed?.expiresAt && new Date(latestSealed.expiresAt).getTime() <= now.getTime()) reason = 'Rehearsal đã quá thời hạn 24 giờ; cần chạy lại trước khi kích hoạt wave.';
  return {
    readyForWave: Boolean(sealed),
    rehearsalId: sealed?.id || null,
    sealedAt: sealed?.sealedAt || null,
    expiresAt: sealed?.expiresAt || null,
    policyVersion: policy.version,
    reason: sealed ? 'Rehearsal đã niêm phong, còn hiệu lực và khớp policy hiện tại.' : reason,
    privacy: { aggregateOnly: true, rosterIncluded: false, performanceTracking: false, durationTracking: false },
  };
}

export function requireValidRealmPilotRehearsal(setting, policy, now = new Date(), expectedId = null) {
  const gate = buildRealmPilotRehearsalGate(setting, policy, now, expectedId);
  if (!gate.readyForWave) {
    throw new RealmOperationError(gate.reason, 409, expectedId ? 'realm_rehearsal_stale' : 'realm_rehearsal_required');
  }
  return gate;
}

const REMEDIATION = Object.freeze({
  schema: { action: 'Xác minh health/schema staging và migration đã apply.', target: '/realm-demo' },
  'controlled-cohort': { action: 'Dùng Controlled Launch để chọn Pilot theo cohort.', target: '/settings#realm-pilot-title' },
  'cohort-members': { action: 'Chọn cohort vai trò hoặc thành viên đang active.', target: '/settings#realm-pilot-title' },
  'erp-fallback': { action: 'Đặt giao diện mặc định về ERP · CRM.', target: '/settings#realm-pilot-title' },
  'realm-office': { action: 'Bật feature flag Văn phòng Realm.', target: '/settings#realm-pilot-title' },
  'guild-support': { action: 'Bật Guild Support trước khi mời cohort.', target: '/settings#realm-pilot-title' },
  'blocking-feedback': { action: 'Xử lý Ticket mức blocked tại Guild Support.', target: '/settings#realm-feedback-operations-title' },
  tavern: { action: 'Tavern có thể mở sau; đây là khuyến nghị, không chặn Office pilot.', target: '/settings#realm-pilot-title' },
});

export function buildRealmRehearsalRemediation(readiness = {}) {
  return (readiness.gates || []).map((gate) => ({
    id: gate.id,
    label: gate.label,
    detail: gate.detail,
    passed: gate.passed === true,
    blocking: gate.blocking === true,
    action: REMEDIATION[gate.id]?.action || 'Kiểm tra lại cấu hình và chạy preflight.',
    target: REMEDIATION[gate.id]?.target || '/settings#realm-pilot-title',
  }));
}

function directorDirectory(users = []) {
  const directors = users.filter((user) => user.status === 'active' && user.userType === 'employee' && rolesOf(user).includes('DIRECTOR'));
  return { count: directors.length, ids: directors.map((user) => user.id) };
}

function checksSummary(run) {
  const checks = run?.checks || REALM_REHEARSAL_SCENARIOS.map((scenario) => normalizeCheck({}, scenario.id));
  return {
    total: checks.length,
    passed: checks.filter((check) => check.result === 'passed').length,
    failed: checks.filter((check) => check.result === 'failed').length,
    pending: checks.filter((check) => check.result === 'pending').length,
  };
}

function publicRun(run, user) {
  if (!run) return null;
  const summary = checksSummary(run);
  return {
    id: run.id,
    name: run.name,
    status: run.status,
    policyVersion: run.policyVersion,
    checks: run.checks.map((check) => ({
      ...check,
      ...REALM_REHEARSAL_SCENARIOS.find((scenario) => scenario.id === check.id),
    })),
    summary,
    createdAt: run.createdAt,
    updatedAt: run.updatedAt,
    createdByName: run.createdByName,
    submittedAt: run.submittedAt,
    submittedByName: run.submittedByName,
    sealedAt: run.sealedAt,
    sealedByName: run.sealedByName,
    expiresAt: run.expiresAt,
    decisionNote: run.decisionNote,
    canEdit: run.status === 'draft' && run.createdById === user.id,
    canApprove: run.status === 'awaiting_approval' && run.submittedById !== user.id,
    submittedByMe: run.submittedById === user.id,
    privacy: { operationalEvidenceOnly: true, rosterIncluded: false },
  };
}

export async function loadRealmPilotRehearsalDashboard(db, sessionUser, { now = new Date() } = {}) {
  requireDirector(sessionUser);
  const [row, users] = await Promise.all([
    db.setting.findUnique({ where: { id: 1 }, select: { json: true } }),
    db.user.findMany({ where: { status: 'active', userType: 'employee' }, select: { id: true, role: true, roles: true, status: true, userType: true } }),
  ]);
  const setting = parseSetting(row);
  const policy = parseRealmPilotConfig(row?.json);
  const rehearsals = normalizeRealmPilotRehearsals(setting.realmPilotRehearsal);
  const readiness = await loadRealmLaunchReadiness(db, policy, now);
  const directory = directorDirectory(users);
  const currentRun = rehearsals.runs.find((run) => ['draft', 'awaiting_approval'].includes(run.status)) || null;
  const gate = buildRealmPilotRehearsalGate(setting, policy, now);
  const manual = checksSummary(currentRun);
  const autoChecks = [
    { id: 'policy-pilot', label: 'Policy ở chế độ pilot', passed: policy.mode === 'pilot', detail: policy.mode === 'pilot' ? `Policy v${policy.version} đã khóa cohort.` : 'Controlled Launch chưa đưa policy về pilot.' },
    { id: 'live-readiness', label: 'Live readiness đạt', passed: readiness.ready, detail: readiness.ready ? 'Không còn blocking gate.' : `${readiness.summary.blockers} blocking gate chưa đạt.` },
    { id: 'two-directors', label: 'Có checker độc lập', passed: directory.count >= 2, detail: `${directory.count} Director active; cần tối thiểu 2.` },
  ];
  const publicPolicy = publicRealmPilotConfig(policy);
  return {
    source: 'erp',
    rehearsals: {
      version: rehearsals.version,
      currentRun: publicRun(currentRun, sessionUser),
      runs: rehearsals.runs.map((run) => publicRun(run, sessionUser)),
    },
    policy: {
      mode: publicPolicy.mode,
      defaultSurface: publicPolicy.defaultSurface,
      cohortStrategy: publicPolicy.cohortStrategy,
      version: publicPolicy.version,
      onboardingVersion: publicPolicy.onboardingVersion,
      features: publicPolicy.features,
    },
    readiness: { ready: readiness.ready, status: readiness.status, summary: readiness.summary, evaluatedAt: readiness.evaluatedAt },
    autoChecks,
    manualChecks: manual,
    directorCount: directory.count,
    gate,
    remediation: buildRealmRehearsalRemediation(readiness),
    canCreate: policy.mode === 'pilot' && !currentRun,
    readyToSubmit: Boolean(currentRun) && currentRun.status === 'draft' && currentRun.createdById === sessionUser.id && manual.passed === manual.total && readiness.ready && directory.count >= 2 && currentRun.policyVersion === policy.version,
    privacy: { aggregateOnly: true, rosterIncluded: false, performanceTracking: false, durationTracking: false, evidenceScope: 'operational-attestation' },
  };
}

function validateExpectedVersion(rehearsals, expectedVersion) {
  if (!Number.isInteger(expectedVersion) || expectedVersion !== rehearsals.version) {
    throw new RealmOperationError('Launch rehearsal vừa được cập nhật. Hãy tải lại trước khi thao tác.', 409, 'realm_rehearsal_version_conflict');
  }
}

function requireRun(rehearsals, runId) {
  const index = rehearsals.runs.findIndex((run) => run.id === cleanText(runId, 100));
  if (index < 0) throw new RealmOperationError('Không tìm thấy launch rehearsal.', 404, 'realm_rehearsal_not_found');
  return { index, run: rehearsals.runs[index] };
}

function replaceRun(rehearsals, index, run) {
  const runs = [...rehearsals.runs];
  runs[index] = normalizeStoredRun(run);
  return { ...rehearsals, runs };
}

async function persistRehearsals(tx, setting, rehearsals, user, action, run, detail) {
  const next = { ...rehearsals, version: rehearsals.version + 1, runs: rehearsals.runs.slice(0, REALM_REHEARSAL_LIMIT) };
  const json = JSON.stringify({ ...setting, realmPilotRehearsal: next });
  await tx.setting.upsert({ where: { id: 1 }, create: { id: 1, json }, update: { json } });
  const summary = checksSummary(run);
  await tx.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name || 'Director',
      action,
      entity: 'realm_pilot_rehearsal',
      refId: run.id,
      detail: `${detail}; rehearsal ${run.id}; status ${run.status}; policy v${run.policyVersion}; checks ${summary.passed}/${summary.total}; no roster; no record content`,
    },
  });
  return next;
}

async function createNotifications(tx, userIds, text) {
  const ids = [...new Set(userIds.filter(Boolean))];
  if (!ids.length) return 0;
  await tx.notification.createMany({ data: ids.map((userId) => ({ userId, text: cleanText(text, 320), route: '/settings#realm-pilot-rehearsal-title' })) });
  return ids.length;
}

export async function createRealmPilotRehearsal(db, sessionUser, input = {}, { now = new Date(), idFactory = randomUUID } = {}) {
  requireDirector(sessionUser);
  const name = cleanText(input.name, 80);
  if (name.length < 3) throw new RealmOperationError('Tên rehearsal cần ít nhất 3 ký tự.', 400, 'realm_rehearsal_name_required');
  return db.$transaction(async (tx) => {
    const row = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
    const setting = parseSetting(row);
    const policy = normalizeRealmPilotConfig(setting.realmPilot);
    const rehearsals = normalizeRealmPilotRehearsals(setting.realmPilotRehearsal);
    validateExpectedVersion(rehearsals, input.expectedVersion);
    if (policy.mode !== 'pilot') throw new RealmOperationError('Hãy hoàn tất Controlled Launch về chế độ pilot trước khi rehearsal.', 409, 'realm_rehearsal_policy_required');
    if (rehearsals.runs.some((run) => ['draft', 'awaiting_approval'].includes(run.status))) {
      throw new RealmOperationError('Đang có một rehearsal chưa niêm phong.', 409, 'realm_rehearsal_open_exists');
    }
    const run = normalizeStoredRun({
      id: `rpr_${cleanText(idFactory(), 80)}`,
      name,
      status: 'draft',
      policyVersion: policy.version,
      createdAt: now.toISOString(),
      updatedAt: now.toISOString(),
      createdById: sessionUser.id,
      createdByName: sessionUser.name,
      checks: [],
    });
    const next = await persistRehearsals(tx, setting, { ...rehearsals, runs: [run, ...rehearsals.runs] }, sessionUser, 'create', run, 'Created launch rehearsal');
    return { rehearsals: next, run, notificationCount: 0 };
  }, { isolationLevel: 'Serializable' });
}

export async function transitionRealmPilotRehearsal(db, sessionUser, input = {}, { now = new Date() } = {}) {
  requireDirector(sessionUser);
  const action = cleanText(input.action, 30);
  if (!['attest', 'submit', 'approve', 'reject'].includes(action)) {
    throw new RealmOperationError('Hành động launch rehearsal không hợp lệ.', 400, 'realm_rehearsal_action_invalid');
  }
  return db.$transaction(async (tx) => {
    const [row, users] = await Promise.all([
      tx.setting.findUnique({ where: { id: 1 }, select: { json: true } }),
      tx.user.findMany({ where: { status: 'active', userType: 'employee' }, select: { id: true, role: true, roles: true, status: true, userType: true } }),
    ]);
    const setting = parseSetting(row);
    const policy = normalizeRealmPilotConfig(setting.realmPilot);
    let rehearsals = normalizeRealmPilotRehearsals(setting.realmPilotRehearsal);
    validateExpectedVersion(rehearsals, input.expectedVersion);
    const { index, run: storedRun } = requireRun(rehearsals, input.runId);
    let run = { ...storedRun, updatedAt: now.toISOString() };
    const directory = directorDirectory(users);
    let notificationCount = 0;

    if (action === 'attest') {
      if (run.status !== 'draft' || run.createdById !== sessionUser.id) throw new RealmOperationError('Chỉ maker được cập nhật rehearsal nháp.', 409, 'realm_rehearsal_edit_forbidden');
      const scenarioId = cleanText(input.scenarioId, 80);
      if (!SCENARIO_IDS.has(scenarioId)) throw new RealmOperationError('Kịch bản rehearsal không hợp lệ.', 400, 'realm_rehearsal_scenario_invalid');
      const result = ['pending', 'passed', 'failed'].includes(input.result) ? input.result : 'pending';
      const evidence = cleanText(input.evidence, 240);
      if (result !== 'pending' && evidence.length < 8) throw new RealmOperationError('Evidence cần ít nhất 8 ký tự và không chứa dữ liệu cá nhân.', 400, 'realm_rehearsal_evidence_required');
      run = {
        ...run,
        checks: run.checks.map((check) => check.id === scenarioId ? { ...check, result, evidence: evidence || null, updatedAt: now.toISOString() } : check),
        decisionNote: null,
      };
    }

    if (action === 'submit') {
      if (run.status !== 'draft' || run.createdById !== sessionUser.id) throw new RealmOperationError('Chỉ maker được gửi rehearsal nháp.', 409, 'realm_rehearsal_submit_forbidden');
      if (policy.mode !== 'pilot' || run.policyVersion !== policy.version) throw new RealmOperationError('Policy đã đổi; cần tạo rehearsal mới.', 409, 'realm_rehearsal_policy_stale');
      if (!run.checks.every((check) => check.result === 'passed')) throw new RealmOperationError('Mọi kịch bản thủ công phải đạt trước khi gửi duyệt.', 409, 'realm_rehearsal_checks_incomplete');
      if (directory.count < 2) throw new RealmOperationError('Cần ít nhất hai Director active để niêm phong rehearsal.', 409, 'realm_rehearsal_checker_missing');
      const readiness = await loadRealmLaunchReadiness(tx, policy, now);
      if (!readiness.ready) throw new RealmOperationError('Live readiness còn blocker; rehearsal chưa thể gửi duyệt.', 409, 'realm_rehearsal_readiness_blocked');
      run = { ...run, status: 'awaiting_approval', submittedAt: now.toISOString(), submittedById: sessionUser.id, submittedByName: sessionUser.name, decisionNote: null };
      notificationCount = await createNotifications(tx, directory.ids.filter((id) => id !== sessionUser.id), `Chờ bạn niêm phong launch rehearsal “${run.name}” (policy v${run.policyVersion}).`);
    }

    if (action === 'approve') {
      if (run.status !== 'awaiting_approval') throw new RealmOperationError('Rehearsal không còn chờ duyệt.', 409, 'realm_rehearsal_transition_invalid');
      if (run.submittedById === sessionUser.id) throw new RealmOperationError('Maker không được tự niêm phong rehearsal.', 409, 'self_approval_forbidden');
      if (policy.mode !== 'pilot' || run.policyVersion !== policy.version) throw new RealmOperationError('Policy đã đổi; rehearsal không còn hợp lệ.', 409, 'realm_rehearsal_policy_stale');
      if (directory.count < 2 || !run.checks.every((check) => check.result === 'passed')) throw new RealmOperationError('Rehearsal không còn đủ điều kiện niêm phong.', 409, 'realm_rehearsal_stale');
      const readiness = await loadRealmLaunchReadiness(tx, policy, now);
      if (!readiness.ready) throw new RealmOperationError('Live readiness vừa xuất hiện blocker mới.', 409, 'realm_rehearsal_readiness_blocked');
      run = {
        ...run,
        status: 'sealed',
        sealedAt: now.toISOString(),
        sealedById: sessionUser.id,
        sealedByName: sessionUser.name,
        expiresAt: new Date(now.getTime() + REALM_REHEARSAL_TTL_HOURS * 3_600_000).toISOString(),
        decisionNote: cleanText(input.note, 240) || null,
      };
      notificationCount = await createNotifications(tx, [run.submittedById], `Launch rehearsal “${run.name}” đã được niêm phong trong ${REALM_REHEARSAL_TTL_HOURS} giờ.`);
    }

    if (action === 'reject') {
      if (run.status !== 'awaiting_approval') throw new RealmOperationError('Rehearsal không còn chờ duyệt.', 409, 'realm_rehearsal_transition_invalid');
      if (run.submittedById === sessionUser.id) throw new RealmOperationError('Maker không được tự trả rehearsal.', 409, 'self_approval_forbidden');
      const note = cleanText(input.note, 240);
      if (note.length < 5) throw new RealmOperationError('Cần ghi rõ lý do trả rehearsal.', 400, 'realm_rehearsal_rejection_note_required');
      run = { ...run, status: 'draft', submittedAt: null, submittedById: null, submittedByName: null, decisionNote: note };
      notificationCount = await createNotifications(tx, [storedRun.submittedById], `Launch rehearsal “${run.name}” đã được trả về nháp: ${note}`);
    }

    rehearsals = replaceRun(rehearsals, index, run);
    const next = await persistRehearsals(tx, setting, rehearsals, sessionUser, action, run, `${action} launch rehearsal`);
    return { rehearsals: next, run: normalizeStoredRun(run), notificationCount };
  }, { isolationLevel: 'Serializable' });
}
