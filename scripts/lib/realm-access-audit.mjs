import fs from 'node:fs';
import path from 'node:path';
import { REALM_SURFACE_POLICIES, createRealmAccessManifest } from '../../lib/realm-access.js';

const employee = (role, extra = {}) => ({ id: `${role.toLowerCase()}-audit`, name: role, role, roles: [role], userType: 'employee', ...extra });
const keys = (manifest) => Object.entries(manifest.surfaces).filter(([, access]) => access.allowed).map(([key]) => key);

const ROLE_SCENARIOS = [
  ['DIRECTOR', employee('DIRECTOR'), ['personal', 'quests', 'guild', 'campaigns', 'embassy', 'rewards', 'economy', 'treasury']],
  ['PM', employee('PM'), ['personal', 'quests', 'guild', 'campaigns', 'rewards', 'economy', 'treasury']],
  ['AM', employee('AM'), ['personal', 'quests', 'guild', 'campaigns', 'embassy', 'treasury']],
  ['ACCOUNTANT', employee('ACCOUNTANT'), ['personal', 'quests', 'guild', 'campaigns', 'treasury']],
  ['HR', employee('HR'), ['personal', 'quests', 'guild', 'campaigns', 'rewards', 'economy', 'treasury']],
  ['LEAD', employee('LEAD', { teamId: 'team-audit' }), ['personal', 'quests', 'guild', 'campaigns', 'rewards', 'economy', 'treasury']],
  ['STAFF', employee('STAFF'), ['personal', 'quests', 'guild', 'campaigns', 'treasury']],
  ['FREELANCER', { ...employee('FREELANCER'), userType: 'freelancer' }, []],
];

const MODULE_SCENARIOS = [
  ['staff-none', employee('STAFF'), [], ['personal', 'treasury']],
  ['staff-tasks', employee('STAFF'), ['tasks'], ['personal', 'quests', 'guild', 'treasury']],
  ['am-sales-tasks', employee('AM'), ['sales', 'tasks'], ['personal', 'quests', 'guild', 'embassy', 'treasury']],
  ['pm-delivery', employee('PM'), ['delivery'], ['personal', 'campaigns', 'treasury']],
  ['lead-team-tasks', employee('LEAD', { teamId: 'team-audit' }), ['tasks'], ['personal', 'quests', 'guild', 'rewards', 'economy', 'treasury']],
];

const ENFORCEMENT_CONTRACTS = [
  { id: 'authenticated-bootstrap', source: 'app/(app)/realm/page.jsx', signals: ['if (!user) return null', 'loadRealmCompanyModules(prisma)', 'initialBridge={initialBridge}'] },
  { id: 'snapshot-modules', source: 'lib/realm-erp-adapter.js', signals: ['const tasksEnabled = modOn(\'tasks\', modules)', 'createRealmErpBridge({ user, tasks, modules })'] },
  { id: 'claim-module-guard', source: 'lib/realm-erp-adapter.js', signals: ["'realm_tasks_module_disabled'", "if (!modOn('tasks', modules))"] },
  { id: 'guild-api', source: 'app/api/realm-demo/guild/route.js', signals: ["realmSurfaceDecision(user, 'guild'", 'if (!access.allowed)'] },
  { id: 'rewards-api', source: 'app/api/realm-demo/rewards/route.js', signals: ["realmSurfaceDecision(user, 'rewards'", 'if (!access.allowed)'] },
  { id: 'economy-api', source: 'app/api/realm-demo/economy/route.js', signals: ["realmSurfaceDecision(user, 'economy'", 'if (!access.allowed)'] },
  { id: 'embassy-api', source: 'app/api/realm-demo/embassy/route.js', signals: ["realmSurfaceDecision(user, 'embassy'", 'if (!access.allowed)'] },
  { id: 'war-room-api', source: 'app/api/realm-demo/war-room/route.js', signals: ["realmSurfaceDecision(user, 'campaigns'", 'if (!access.allowed)'] },
  { id: 'world-navigation', source: 'components/realm/RealmOffice.jsx', signals: ['realmAccessForPanel(businessBridge?.access, item.id)', 'disabled={!access.allowed}'] },
  { id: 'ledger-navigation', source: 'components/realm/RealmOffice.jsx', signals: ['realmAccessForSurface(accessManifest, tab.key)', 'title={!access.allowed ? access.reason'] },
  { id: 'locked-portals', source: 'components/realm/RealmOffice.jsx', signals: ['businessBridge?.unavailablePortals', 'aria-disabled="true"'] },
];

function sameKeys(actual, expected) {
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function markdownTable(rows, columns) {
  const clean = (value) => String(Array.isArray(value) ? value.join(', ') : value ?? '').replaceAll('|', '\\|').replaceAll('\n', ' ');
  return [
    `| ${columns.map(([label]) => label).join(' | ')} |`,
    `| ${columns.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${columns.map(([, key]) => clean(row[key])).join(' | ')} |`),
  ].join('\n');
}

export function buildRealmAccessAudit(root) {
  const policyKeys = REALM_SURFACE_POLICIES.map((policy) => policy.key);
  const failedPolicies = REALM_SURFACE_POLICIES.filter((policy) => !policy.key || !policy.label || !Array.isArray(policy.roles)
    || policyKeys.filter((key) => key === policy.key).length !== 1);
  const roleScenarios = ROLE_SCENARIOS.map(([id, user, expected]) => {
    const actual = keys(createRealmAccessManifest({ user, modules: null }));
    return { type: 'role', id, modules: 'legacy-defaults', expected, actual, status: sameKeys(actual, expected) ? 'verified' : 'failed' };
  });
  const moduleScenarios = MODULE_SCENARIOS.map(([id, user, modules, expected]) => {
    const actual = keys(createRealmAccessManifest({ user, modules }));
    return { type: 'module', id, modules, expected, actual, status: sameKeys(actual, expected) ? 'verified' : 'failed' };
  });
  const enforcementContracts = ENFORCEMENT_CONTRACTS.map((contract) => {
    const sourcePath = path.join(root, contract.source);
    const source = fs.existsSync(sourcePath) ? fs.readFileSync(sourcePath, 'utf8') : '';
    const missingSignals = contract.signals.filter((signal) => !source.includes(signal));
    return { ...contract, missingSignals, status: missingSignals.length ? 'failed' : 'verified' };
  });
  return {
    schemaVersion: 1,
    summary: {
      surfacePolicies: REALM_SURFACE_POLICIES.length,
      failedPolicies: failedPolicies.length,
      roleScenarios: roleScenarios.length,
      verifiedRoleScenarios: roleScenarios.filter((row) => row.status === 'verified').length,
      moduleScenarios: moduleScenarios.length,
      verifiedModuleScenarios: moduleScenarios.filter((row) => row.status === 'verified').length,
      enforcementContracts: enforcementContracts.length,
      verifiedEnforcementContracts: enforcementContracts.filter((row) => row.status === 'verified').length,
    },
    policies: REALM_SURFACE_POLICIES,
    failedPolicies: failedPolicies.map((policy) => policy.key),
    roleScenarios,
    moduleScenarios,
    enforcementContracts,
  };
}

function accessMatrixCsv(result) {
  const columns = ['type', 'id', 'modules', 'expected', 'actual', 'status'];
  const rows = [...result.roleScenarios, ...result.moduleScenarios];
  return `${columns.map(csvCell).join(',')}\n${rows.map((row) => columns.map((column) => csvCell(row[column])).join(',')).join('\n')}\n`;
}

function phase5ReportMarkdown(result) {
  const s = result.summary;
  const policies = result.policies.map((policy) => ({ ...policy, roles: policy.roles.join(', ') || 'DIRECTOR' }));
  return `# Phase 5 — Realm session access & RBAC parity\n\n` +
    `Phase 5 chiếu quyền của session ERP và cấu hình module vào Realm trước khi người dùng mở một surface; API gốc vẫn là lớp cưỡng chế cuối cùng.\n\n` +
    `## Kết quả\n\n` +
    `- Surface policies: **${s.surfacePolicies}**\n` +
    `- Role scenarios: **${s.verifiedRoleScenarios}/${s.roleScenarios}**\n` +
    `- Module scenarios: **${s.verifiedModuleScenarios}/${s.moduleScenarios}**\n` +
    `- Server/UI enforcement contracts: **${s.verifiedEnforcementContracts}/${s.enforcementContracts}**\n` +
    `- Failed policies: **${s.failedPolicies}**\n\n` +
    `## Surface policy\n\n${markdownTable(policies, [['Surface', 'label'], ['Key', 'key'], ['Vai trò', 'roles'], ['Module', 'module']])}\n\n` +
    `## Ma trận vai trò\n\n${markdownTable(result.roleScenarios, [['Scenario', 'id'], ['Expected', 'expected'], ['Actual', 'actual'], ['Status', 'status']])}\n\n` +
    `## Ma trận module\n\n${markdownTable(result.moduleScenarios, [['Scenario', 'id'], ['Modules', 'modules'], ['Expected', 'expected'], ['Actual', 'actual'], ['Status', 'status']])}\n\n` +
    `## Enforcement\n\n` +
    `- Snapshot ERP mang access manifest được sinh từ session, role, team và Setting.modules.\n` +
    `- Endpoint Guild, Rewards, Economy, Embassy và War Room kiểm tra cùng surface policy trước khi query nghiệp vụ.\n` +
    `- Claim Quest bị chặn khi module Tasks tắt; snapshot không trả Task trong trạng thái đó.\n` +
    `- Realm navigation, ledger tabs và portal cards hiện trạng thái khóa kèm lý do thay vì tạo no-op.\n\n` +
    `## Regression gate\n\nChạy \`npm run audit:realm:access:check\`. Gate thất bại nếu policy trùng/thiếu, ma trận role-module lệch hoặc evidence server/UI bị mất.\n`;
}

export function renderRealmAccessArtifacts(result) {
  return {
    'access-verification.json': `${JSON.stringify(result, null, 2)}\n`,
    'access-matrix.csv': accessMatrixCsv(result),
    'PHASE-5-REPORT.md': `${phase5ReportMarkdown(result)}\n`,
  };
}
