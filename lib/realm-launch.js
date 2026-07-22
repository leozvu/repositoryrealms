import { isDirector } from './perm.js';
import { inspectRealmSchemaReadiness } from './realm-health.js';
import { RealmOperationError } from './realm-operation.js';
import {
  REALM_PILOT_MEMBER_LIMIT,
  loadRealmPilotMetrics,
  normalizeRealmPilotConfig,
  parseRealmPilotConfig,
} from './realm-pilot.js';
import { evaluateRealmLaunchReadiness, loadRealmLaunchReadiness } from './realm-readiness.js';
import {
  createRealmLaunchPreviewToken,
  realmLaunchPolicyDigest,
  verifyRealmLaunchPreviewToken,
} from './realm-launch-token.js';

async function validatePreviewDraft(db, rawPolicy, draft) {
  if (rawPolicy?.mode === 'pilot' && rawPolicy?.cohortStrategy === 'members' && Array.isArray(rawPolicy?.memberIds) && rawPolicy.memberIds.length > REALM_PILOT_MEMBER_LIMIT) {
    throw new RealmOperationError(`Cohort pilot tối đa ${REALM_PILOT_MEMBER_LIMIT} nhân sự.`, 400, 'realm_pilot_member_limit');
  }
  if (draft.mode === 'pilot' && draft.cohortStrategy === 'roles' && draft.roles.length === 0) {
    throw new RealmOperationError('Cohort pilot cần ít nhất một vai trò.', 400, 'realm_pilot_roles_required');
  }
  if (draft.mode === 'pilot' && draft.cohortStrategy === 'members' && draft.memberIds.length === 0) {
    throw new RealmOperationError('Cohort pilot cần ít nhất một nhân sự.', 400, 'realm_pilot_members_required');
  }
  if (draft.mode === 'pilot' && draft.cohortStrategy === 'members') {
    const activeMembers = await db.user.findMany({
      where: { id: { in: draft.memberIds }, status: 'active', userType: 'employee' },
      select: { id: true },
    });
    if (activeMembers.length !== draft.memberIds.length) {
      throw new RealmOperationError('Cohort chứa tài khoản không còn hợp lệ. Hãy tải lại danh sách nhân sự.', 409, 'realm_pilot_members_stale');
    }
  }
}

export async function createRealmLaunchPreview(db, sessionUser, rawPolicy, {
  secret,
  now = new Date(),
} = {}) {
  if (!isDirector(sessionUser)) {
    throw new RealmOperationError('Chỉ Giám đốc được chạy launch preview.', 403, 'realm_launch_admin_forbidden');
  }
  const draft = normalizeRealmPilotConfig(rawPolicy);
  const row = await db.setting.findUnique({ where: { id: 1 }, select: { json: true } });
  const currentPolicy = parseRealmPilotConfig(row?.json);
  if (draft.version !== currentPolicy.version) {
    throw new RealmOperationError('Chính sách Realm vừa được cập nhật. Hãy tải lại trước khi preview.', 409, 'realm_pilot_version_conflict');
  }
  await validatePreviewDraft(db, rawPolicy, draft);

  const [schema, currentMetrics, draftMetrics, unresolvedFeedback, blockedFeedback] = await Promise.all([
    inspectRealmSchemaReadiness(db),
    loadRealmPilotMetrics(db, currentPolicy, now),
    loadRealmPilotMetrics(db, draft, now),
    db.ticket.count({ where: { source: 'realm_pilot', status: { notIn: ['resolved', 'closed'] } } }),
    db.ticket.count({
      where: {
        source: 'realm_pilot',
        status: { notIn: ['resolved', 'closed'] },
        feedbackContext: { contains: '"impact":"blocked"' },
      },
    }),
  ]);
  const readiness = evaluateRealmLaunchReadiness({
    policy: draft,
    schema,
    metrics: draftMetrics,
    unresolvedFeedback,
    blockedFeedback,
  });
  const impact = {
    activeInternalUsers: draftMetrics.cohort.available,
    eligibleUsers: draftMetrics.eligibleUsers,
    fallbackUsers: Math.max(0, draftMetrics.cohort.available - draftMetrics.eligibleUsers),
    eligibleDelta: draftMetrics.eligibleUsers - currentMetrics.eligibleUsers,
    selected: draftMetrics.cohort.selected,
    strategy: draftMetrics.cohort.strategy,
  };
  const signed = createRealmLaunchPreviewToken({
    actorId: sessionUser.id,
    currentPolicy,
    draftPolicy: draft,
    readiness,
    impact,
    secret,
    now,
  });
  return {
    source: 'erp',
    token: signed.token,
    preview: {
      id: signed.previewId,
      issuedAt: new Date(signed.payload.issuedAt * 1000).toISOString(),
      expiresAt: new Date(signed.payload.expiresAt * 1000).toISOString(),
      policyVersion: currentPolicy.version,
      draftDigest: realmLaunchPolicyDigest(draft),
      risk: signed.payload.risk,
      impact,
      readiness,
      privacy: {
        aggregateOnly: true,
        rosterIncluded: false,
        performanceTracking: false,
        durationTracking: false,
      },
    },
  };
}

export async function verifyRealmLaunchApplication(db, sessionUser, {
  token,
  currentPolicy,
  draftPolicy,
  secret,
  now = new Date(),
}) {
  const preview = verifyRealmLaunchPreviewToken({
    token,
    actorId: sessionUser?.id,
    currentPolicy,
    draftPolicy,
    secret,
    now,
  });
  if (preview.risk === 'expansion') {
    const readiness = await loadRealmLaunchReadiness(db, draftPolicy, now);
    if (!readiness.ready) {
      throw new RealmOperationError('Preflight vừa xuất hiện blocker mới. Hãy xử lý và chạy lại dry-run.', 409, 'realm_launch_readiness_stale');
    }
  }
  return preview;
}
