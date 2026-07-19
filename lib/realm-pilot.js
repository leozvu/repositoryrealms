import { ROLES, isDirector, isFreelancer, rolesOf } from './perm.js';
import { RealmOperationError } from './realm-operation.js';

export const REALM_PILOT_MODES = Object.freeze(['off', 'pilot', 'open']);
export const REALM_WORKSPACE_PREFERENCES = Object.freeze(['auto', 'erp', 'realm']);

export const DEFAULT_REALM_PILOT_CONFIG = Object.freeze({
  mode: 'open',
  defaultSurface: 'erp',
  roles: Object.freeze([...ROLES]),
});

const MODE_SET = new Set(REALM_PILOT_MODES);
const PREFERENCE_SET = new Set(REALM_WORKSPACE_PREFERENCES);
const ROLE_SET = new Set(ROLES);

export function normalizeRealmWorkspacePreference(value) {
  const preference = String(value || '').trim().toLowerCase();
  return PREFERENCE_SET.has(preference) ? preference : 'auto';
}

export function normalizeRealmPilotConfig(value = {}) {
  const mode = MODE_SET.has(value?.mode) ? value.mode : DEFAULT_REALM_PILOT_CONFIG.mode;
  const defaultSurface = value?.defaultSurface === 'realm' ? 'realm' : 'erp';
  const roles = [...new Set(Array.isArray(value?.roles) ? value.roles.filter((role) => ROLE_SET.has(role)) : ROLES)];
  return { mode, defaultSurface, roles };
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
  const userRoles = rolesOf(user);
  if (config.mode === 'pilot' && !userRoles.some((role) => config.roles.includes(role))) {
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

export async function saveRealmPilotConfig(db, sessionUser, value) {
  if (!isDirector(sessionUser)) throw new RealmOperationError('Chỉ Giám đốc được cấu hình Realm pilot.', 403, 'realm_pilot_admin_forbidden');
  const config = normalizeRealmPilotConfig(value);
  if (config.mode === 'pilot' && config.roles.length === 0) {
    throw new RealmOperationError('Cohort pilot cần ít nhất một vai trò.', 400, 'realm_pilot_roles_required');
  }
  await db.$transaction(async (tx) => {
    const row = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
    let current = {};
    try { current = JSON.parse(row?.json || '{}'); } catch { current = {}; }
    const json = JSON.stringify({ ...current, realmPilot: config });
    await tx.setting.upsert({ where: { id: 1 }, create: { id: 1, json }, update: { json } });
    await tx.auditLog.create({
      data: {
        userId: sessionUser.id,
        userName: sessionUser.name || 'Director',
        action: 'update',
        entity: 'realm_pilot',
        detail: `Mode ${config.mode}; default ${config.defaultSurface}; roles ${config.roles.join(',') || 'none'}`,
      },
    });
  }, { isolationLevel: 'Serializable' });
  return config;
}
