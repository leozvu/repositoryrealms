import { ROLES, isDirector, isFreelancer, rolesOf } from './perm.js';
import { RealmOperationError } from './realm-operation.js';

export const REALM_PILOT_MODES = Object.freeze(['off', 'pilot', 'open']);
export const REALM_WORKSPACE_PREFERENCES = Object.freeze(['auto', 'erp', 'realm']);
export const REALM_PILOT_FEATURES = Object.freeze(['office', 'tavern', 'feedback']);
export const REALM_PILOT_COHORT_STRATEGIES = Object.freeze(['members', 'roles']);
export const REALM_PILOT_MEMBER_LIMIT = 50;

export const DEFAULT_REALM_PILOT_CONFIG = Object.freeze({
  mode: 'open',
  defaultSurface: 'erp',
  cohortStrategy: 'roles',
  roles: Object.freeze([...ROLES]),
  memberIds: Object.freeze([]),
  features: Object.freeze({ office: true, tavern: true, feedback: true }),
  onboardingVersion: 1,
  version: 0,
});

const MODE_SET = new Set(REALM_PILOT_MODES);
const PREFERENCE_SET = new Set(REALM_WORKSPACE_PREFERENCES);
const ROLE_SET = new Set(ROLES);
const FEATURE_SET = new Set(REALM_PILOT_FEATURES);
const COHORT_STRATEGY_SET = new Set(REALM_PILOT_COHORT_STRATEGIES);

export function normalizeRealmWorkspacePreference(value) {
  const preference = String(value || '').trim().toLowerCase();
  return PREFERENCE_SET.has(preference) ? preference : 'auto';
}

export function normalizeRealmPilotConfig(value = {}) {
  const mode = MODE_SET.has(value?.mode) ? value.mode : DEFAULT_REALM_PILOT_CONFIG.mode;
  const defaultSurface = value?.defaultSurface === 'realm' ? 'realm' : 'erp';
  const cohortStrategy = COHORT_STRATEGY_SET.has(value?.cohortStrategy) ? value.cohortStrategy : DEFAULT_REALM_PILOT_CONFIG.cohortStrategy;
  const roles = [...new Set(Array.isArray(value?.roles) ? value.roles.filter((role) => ROLE_SET.has(role)) : ROLES)];
  const memberIds = [...new Set(Array.isArray(value?.memberIds)
    ? value.memberIds.map((id) => String(id || '').trim()).filter((id) => id && id.length <= 128)
    : [])].slice(0, REALM_PILOT_MEMBER_LIMIT);
  const features = Object.fromEntries(REALM_PILOT_FEATURES.map((feature) => [feature, value?.features?.[feature] !== false]));
  const onboardingVersion = Number.isInteger(value?.onboardingVersion)
    ? Math.max(1, Math.min(value.onboardingVersion, 99))
    : DEFAULT_REALM_PILOT_CONFIG.onboardingVersion;
  const version = Number.isInteger(value?.version) ? Math.max(0, value.version) : 0;
  return { mode, defaultSurface, cohortStrategy, roles, memberIds, features, onboardingVersion, version };
}

export function publicRealmPilotConfig(value = {}) {
  const { memberIds, ...config } = normalizeRealmPilotConfig(value);
  return { ...config, memberCount: memberIds.length };
}

export function realmPilotFeatureEnabled(configValue, feature) {
  if (!FEATURE_SET.has(feature)) return false;
  return normalizeRealmPilotConfig(configValue).features[feature];
}

export function parseRealmPilotConfig(settingJson) {
  try {
    const setting = JSON.parse(settingJson || '{}');
    return normalizeRealmPilotConfig(setting?.realmPilot);
  } catch {
    return normalizeRealmPilotConfig();
  }
}

export function realmPilotDecision(user, configValue, preferenceValue = user?.workspacePreference) {
  const config = normalizeRealmPilotConfig(configValue);
  const preference = normalizeRealmWorkspacePreference(preferenceValue);
  if (!user?.id) {
    return { allowed: false, code: 'unauthorized', reason: 'Cần đăng nhập ERP để dùng Realm.', preference: 'auto', resolvedSurface: 'erp', config };
  }
  if (isFreelancer(user)) {
    return { allowed: false, code: 'freelancer_forbidden', reason: 'Realm pilot chỉ dành cho nhân sự nội bộ.', preference, resolvedSurface: 'erp', config };
  }
  if (config.mode === 'off') {
    return { allowed: false, code: 'realm_pilot_disabled', reason: 'Realm đang tạm đóng theo kill switch của công ty.', preference, resolvedSurface: 'erp', config };
  }
  if (!config.features.office) {
    return { allowed: false, code: 'realm_office_disabled', reason: 'Văn phòng Realm đang tạm tắt; ERP vẫn hoạt động bình thường.', preference, resolvedSurface: 'erp', config };
  }
  const userRoles = rolesOf(user);
  const cohortMatch = config.cohortStrategy === 'members'
    ? config.memberIds.includes(user.id)
    : userRoles.some((role) => config.roles.includes(role));
  if (config.mode === 'pilot' && !cohortMatch) {
    return { allowed: false, code: 'realm_pilot_cohort_required', reason: 'Tài khoản này chưa thuộc cohort Realm pilot.', preference, resolvedSurface: 'erp', config };
  }
  const resolvedSurface = preference === 'auto' ? config.defaultSurface : preference;
  return {
    allowed: true,
    code: 'realm_pilot_granted',
    reason: 'Bạn có thể dùng Realm hoặc ERP và đổi lại bất kỳ lúc nào.',
    preference,
    resolvedSurface,
    config,
  };
}

export async function loadRealmPilotDecision(db, sessionUser) {
  if (!sessionUser?.id) return realmPilotDecision(null, null);
  const [setting, user] = await Promise.all([
    db.setting.findUnique({ where: { id: 1 }, select: { json: true } }),
    db.user.findUnique({
      where: { id: sessionUser.id },
      select: { id: true, name: true, role: true, roles: true, status: true, userType: true, workspacePreference: true },
    }),
  ]);
  if (!user || user.status !== 'active') {
    return { ...realmPilotDecision(null, parseRealmPilotConfig(setting?.json)), code: 'inactive_user', reason: 'Tài khoản không còn hoạt động.' };
  }
  return realmPilotDecision(user, parseRealmPilotConfig(setting?.json), user.workspacePreference);
}

export async function loadRealmPilotMetrics(db, configValue, now = new Date()) {
  const config = normalizeRealmPilotConfig(configValue);
  const activeAfter = new Date(now.getTime() - 90_000);
  const [users, sessions] = await Promise.all([
    db.user.findMany({
      where: { status: 'active', userType: 'employee' },
      select: { id: true, role: true, roles: true, userType: true, workspacePreference: true },
    }),
    db.collaborationPresenceSession.findMany({
      where: { lastSeen: { gte: activeAfter } },
      select: { userId: true, surface: true },
    }),
  ]);
  const eligible = users.filter((user) => realmPilotDecision(user, config, user.workspacePreference).allowed);
  const eligibleIds = new Set(eligible.map((user) => user.id));
  const preferences = { auto: 0, erp: 0, realm: 0 };
  for (const user of eligible) preferences[normalizeRealmWorkspacePreference(user.workspacePreference)] += 1;
  const onlineBySurface = { erp: new Set(), realm: new Set() };
  for (const session of sessions) {
    if (!eligibleIds.has(session.userId) || !onlineBySurface[session.surface]) continue;
    onlineBySurface[session.surface].add(session.userId);
  }
  return {
    eligibleUsers: eligible.length,
    cohort: {
      strategy: config.cohortStrategy,
      selected: config.cohortStrategy === 'members' ? config.memberIds.length : eligible.length,
      available: users.length,
    },
    preferences,
    online: {
      total: new Set([...onlineBySurface.erp, ...onlineBySurface.realm]).size,
      erp: onlineBySurface.erp.size,
      realm: onlineBySurface.realm.size,
    },
    privacy: {
      aggregateOnly: true,
      performanceTracking: false,
      durationTracking: false,
      source: 'workspace-preference-and-expiring-presence',
    },
  };
}

export async function loadRealmPilotDirectory(db) {
  const users = await db.user.findMany({
    where: { status: 'active', userType: 'employee' },
    orderBy: [{ name: 'asc' }, { id: 'asc' }],
    take: 500,
    select: { id: true, name: true, title: true, role: true, roles: true },
  });
  return users.map((user) => ({
    id: user.id,
    name: user.name,
    title: user.title || '',
    roles: rolesOf(user).filter((role) => ROLE_SET.has(role)),
  }));
}

export async function saveRealmWorkspacePreference(db, sessionUser, value) {
  const preference = normalizeRealmWorkspacePreference(value);
  if (!PREFERENCE_SET.has(String(value || '').trim().toLowerCase())) {
    throw new RealmOperationError('Lựa chọn giao diện không hợp lệ.', 400, 'realm_preference_invalid');
  }
  const decision = await loadRealmPilotDecision(db, sessionUser);
  if (preference === 'realm' && !decision.allowed) {
    throw new RealmOperationError(decision.reason, 403, decision.code);
  }
  await db.$transaction(async (tx) => {
    await tx.user.update({ where: { id: sessionUser.id }, data: { workspacePreference: preference } });
    await tx.auditLog.create({
      data: {
        userId: sessionUser.id,
        userName: sessionUser.name || 'ERP user',
        action: 'update',
        entity: 'realm_workspace_preference',
        refId: sessionUser.id,
        detail: `Workspace preference: ${preference}`,
      },
    });
  });
  return { ...decision, preference, resolvedSurface: preference === 'auto' ? decision.config.defaultSurface : preference };
}

function validateRealmPilotConfigInput(sessionUser, value) {
  if (!isDirector(sessionUser)) throw new RealmOperationError('Chỉ Giám đốc được cấu hình Realm pilot.', 403, 'realm_pilot_admin_forbidden');
  if (value?.mode === 'pilot' && value?.cohortStrategy === 'members' && Array.isArray(value?.memberIds) && value.memberIds.length > REALM_PILOT_MEMBER_LIMIT) {
    throw new RealmOperationError(`Cohort pilot tối đa ${REALM_PILOT_MEMBER_LIMIT} nhân sự.`, 400, 'realm_pilot_member_limit');
  }
  const draft = normalizeRealmPilotConfig(value);
  if (draft.mode === 'pilot' && draft.cohortStrategy === 'roles' && draft.roles.length === 0) {
    throw new RealmOperationError('Cohort pilot cần ít nhất một vai trò.', 400, 'realm_pilot_roles_required');
  }
  if (draft.mode === 'pilot' && draft.cohortStrategy === 'members' && draft.memberIds.length === 0) {
    throw new RealmOperationError('Cohort pilot cần ít nhất một nhân sự.', 400, 'realm_pilot_members_required');
  }
  return draft;
}

export async function applyRealmPilotConfigInTransaction(tx, sessionUser, value, {
  requireLaunchPreview = false,
  verifyLaunchPreview = null,
  verifiedLaunchPreview = null,
} = {}) {
  const draft = validateRealmPilotConfigInput(sessionUser, value);
  const row = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
  let current = {};
  try { current = JSON.parse(row?.json || '{}'); } catch { current = {}; }
  const currentConfig = normalizeRealmPilotConfig(current.realmPilot);
  if (draft.version !== currentConfig.version) {
    throw new RealmOperationError('Chính sách Realm vừa được người khác cập nhật. Hãy tải lại trước khi lưu.', 409, 'realm_pilot_version_conflict');
  }
  if (draft.mode === 'pilot' && draft.cohortStrategy === 'members' && draft.memberIds.length) {
    const activeMembers = await tx.user.findMany({
      where: { id: { in: draft.memberIds }, status: 'active', userType: 'employee' },
      select: { id: true },
    });
    if (activeMembers.length !== draft.memberIds.length) {
      throw new RealmOperationError('Cohort chứa tài khoản không còn hợp lệ. Hãy tải lại danh sách nhân sự.', 409, 'realm_pilot_members_stale');
    }
  }
  if (requireLaunchPreview && draft.mode !== 'off' && !verifiedLaunchPreview && typeof verifyLaunchPreview !== 'function') {
    throw new RealmOperationError('Hãy chạy dry-run trước khi áp dụng chính sách.', 428, 'realm_launch_preview_required');
  }
  const launchPreview = draft.mode === 'off'
    ? null
    : verifiedLaunchPreview || (requireLaunchPreview
      ? await verifyLaunchPreview({ db: tx, currentPolicy: currentConfig, draftPolicy: draft })
      : null);
  const config = { ...draft, version: currentConfig.version + 1 };
  const json = JSON.stringify({ ...current, realmPilot: config });
  await tx.setting.upsert({ where: { id: 1 }, create: { id: 1, json }, update: { json } });
  await tx.auditLog.create({
    data: {
      userId: sessionUser.id,
      userName: sessionUser.name || 'Director',
      action: 'update',
      entity: 'realm_pilot',
      detail: `v${config.version}; mode ${config.mode}; default ${config.defaultSurface}; cohort ${config.cohortStrategy}; members ${config.memberIds.length}; roles ${config.roles.join(',') || 'none'}; features ${REALM_PILOT_FEATURES.filter((feature) => config.features[feature]).join(',') || 'none'}; launch ${draft.mode === 'off' ? 'kill-switch' : launchPreview?.previewId || 'legacy'}; risk ${draft.mode === 'off' ? 'emergency' : launchPreview?.risk || 'legacy'}; eligible ${launchPreview?.eligibleUsers ?? 'n/a'}; fallback ${launchPreview?.fallbackUsers ?? 'n/a'}; approval ${launchPreview?.approvalId || 'none'}; maker ${launchPreview?.requesterId || 'n/a'}`,
    },
  });
  return config;
}

export async function saveRealmPilotConfig(db, sessionUser, value, options = {}) {
  validateRealmPilotConfigInput(sessionUser, value);
  return db.$transaction(
    (tx) => applyRealmPilotConfigInTransaction(tx, sessionUser, value, options),
    { isolationLevel: 'Serializable' },
  );
}
