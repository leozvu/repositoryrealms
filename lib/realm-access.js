import { ERP_ALL_ROLES } from './erp-navigation.js';
import { MODULE_GROUPS, modOn } from './modules.js';
import { ROLE_LABEL, hasAny, isFreelancer, rolesOf } from './perm.js';

const MODULE_LABELS = new Map(MODULE_GROUPS.map((item) => [item.mod, item.label]));

// Đây là policy trình bày của các surface trong Realm. API/Prisma vẫn là lớp
// quyết định cuối cùng; manifest giúp UI không mời người dùng vào một nơi chắc
// chắn sẽ bị server từ chối.
export const REALM_SURFACE_POLICIES = Object.freeze([
  { key: 'personal', label: 'Sổ nhân vật', roles: ERP_ALL_ROLES, module: null },
  { key: 'quests', label: 'Quest Board', roles: ERP_ALL_ROLES, module: 'tasks' },
  { key: 'command', label: 'Royal Command Center', roles: ERP_ALL_ROLES, module: 'tasks' },
  { key: 'guild', label: 'Guild Hall', roles: ERP_ALL_ROLES, module: 'tasks' },
  { key: 'campaigns', label: 'War Room', roles: ERP_ALL_ROLES, module: 'delivery' },
  { key: 'embassy', label: 'Royal Embassy', roles: ['AM'], module: 'sales' },
  { key: 'rewards', label: 'Hội đồng Gold', roles: ['PM', 'LEAD', 'HR'], module: 'tasks' },
  { key: 'economy', label: 'Đài quan sát Gold', roles: ['PM', 'LEAD', 'HR'], module: 'tasks', teamRequiredForLead: true },
  { key: 'treasury', label: 'Tavern', roles: ERP_ALL_ROLES, module: null },
]);

const SURFACE_BY_KEY = new Map(REALM_SURFACE_POLICIES.map((policy) => [policy.key, policy]));

function roleReason(roles) {
  const labels = roles.map((role) => ROLE_LABEL[role] || role).join(', ');
  return `Cần một trong các vai trò: ${labels}.`;
}

function moduleReason(module) {
  return `Phân hệ ${MODULE_LABELS.get(module) || module} đang tắt trong Cài đặt công ty.`;
}

function grantedDecision({ module = null, demo = false } = {}) {
  return {
    allowed: true,
    code: demo ? 'demo_access' : 'granted',
    reason: demo ? 'Demo staging mô phỏng đầy đủ surface.' : 'Được phép theo session ERP hiện tại.',
    module,
  };
}

export function realmPolicyDecision(user, policy, modules, { demo = false } = {}) {
  if (demo) return grantedDecision({ module: policy?.module || null, demo: true });
  if (!user?.id) return { allowed: false, code: 'unauthorized', reason: 'Cần đăng nhập ERP để mở khu vực này.', module: policy?.module || null };
  if (isFreelancer(user)) return { allowed: false, code: 'freelancer_forbidden', reason: 'Tài khoản freelancer không thuộc chương trình Realm nội bộ.', module: policy?.module || null };
  if (!policy) return { allowed: false, code: 'unknown_surface', reason: 'Khu vực Realm chưa có policy truy cập.', module: null };
  if (!hasAny(user, policy.roles || [])) {
    return { allowed: false, code: 'role_forbidden', reason: roleReason(policy.roles || []), module: policy.module || null };
  }
  if (!modOn(policy.module, modules)) {
    return { allowed: false, code: 'module_disabled', reason: moduleReason(policy.module), module: policy.module };
  }
  const roles = rolesOf(user);
  const leadOnly = roles.includes('LEAD') && !roles.some((role) => ['DIRECTOR', 'PM', 'HR'].includes(role));
  if (policy.teamRequiredForLead && leadOnly && !user.teamId) {
    return { allowed: false, code: 'team_scope_missing', reason: 'Trưởng nhóm cần được gắn Team trước khi xem dữ liệu Gold theo phạm vi.', module: policy.module || null };
  }
  return grantedDecision({ module: policy.module || null });
}

export function realmSurfaceDecision(user, surfaceKey, modules, options) {
  return realmPolicyDecision(user, SURFACE_BY_KEY.get(surfaceKey), modules, options);
}

export function realmRouteDecision(user, route, modules, options) {
  return realmPolicyDecision(user, {
    key: route?.key,
    roles: route?.roles || [],
    module: route?.module || route?.mod || null,
  }, modules, options);
}

export function createRealmAccessManifest({ user, modules = null, demo = false } = {}) {
  const surfaces = Object.fromEntries(REALM_SURFACE_POLICIES.map((policy) => [
    policy.key,
    {
      label: policy.label,
      ...realmPolicyDecision(user, policy, modules, { demo }),
    },
  ]));
  return {
    version: 1,
    source: demo ? 'demo' : 'erp-session',
    roles: demo ? ['DEMO'] : rolesOf(user),
    moduleMode: demo ? 'demo' : Array.isArray(modules) ? 'configured' : 'legacy-defaults',
    surfaces,
  };
}

export function realmPanelSurface(panel) {
  return ({ quests: 'quests', command: 'command', guild: 'guild', campaigns: 'campaigns', embassy: 'embassy', treasury: 'treasury', shop: 'treasury' })[panel] || null;
}

export function realmAccessForSurface(manifest, surfaceKey) {
  return manifest?.surfaces?.[surfaceKey] || grantedDecision();
}

export function realmAccessForPanel(manifest, panel) {
  const surface = realmPanelSurface(panel);
  return surface ? realmAccessForSurface(manifest, surface) : grantedDecision();
}

export function parseRealmCompanyModules(settingJson) {
  try {
    const parsed = JSON.parse(settingJson || '{}');
    return Array.isArray(parsed?.modules) ? parsed.modules : null;
  } catch {
    return null;
  }
}

export async function loadRealmCompanyModules(db) {
  const row = await db.setting.findUnique({ where: { id: 1 }, select: { json: true } });
  return parseRealmCompanyModules(row?.json);
}
