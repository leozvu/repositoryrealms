import { ERP_NAV } from './erp-navigation.js';
import { canRead, canWrite } from './registry.js';
import { repositoryRealmsContract } from './repository-realms.js';

const userFor = (role) => ({ id: `role-audit-${role.toLowerCase()}`, name: role, role, roles: [role], userType: 'employee' });

// Baseline tối thiểu theo trách nhiệm công việc. Đây không phải danh sách mọi
// quyền trong ERP; nó là contract chống regression cho những việc một vai trò
// hiển nhiên phải thực hiện được.
export const ROLE_CAPABILITY_REQUIREMENTS = Object.freeze([
  {
    role: 'DIRECTOR',
    read: ['clients', 'projects', 'tasks', 'invoices', 'contracts', 'assets', 'users'],
    write: ['clients', 'projects', 'tasks', 'invoices', 'contracts', 'assets'],
    nav: ['dashboard', 'tasks', 'projects', 'invoices', 'staff', 'reports'],
    actions: ['task.assign', 'task.delegate.create'],
  },
  {
    role: 'PM',
    read: ['projects', 'tasks', 'milestones', 'phases', 'vendors', 'contracts'],
    write: ['projects', 'tasks', 'milestones', 'phases', 'vendors', 'vendorbills', 'projecttemplates'],
    nav: ['portfolio', 'projects', 'tasks', 'teamwork', 'resources', 'templates', 'vendors', 'contracts'],
    actions: ['task.assign', 'task.delegate.create', 'task.reprioritize', 'task.block', 'task.unblock', 'task.escalate', 'task.split', 'task.merge'],
  },
  {
    role: 'AM',
    read: ['leads', 'clients', 'quotes', 'services', 'contacts', 'activities', 'invoices'],
    write: ['leads', 'clients', 'quotes', 'services', 'contacts', 'activities'],
    nav: ['leads', 'clients', 'quotes', 'services', 'invoices'],
    actions: [],
  },
  {
    role: 'ACCOUNTANT',
    read: ['invoices', 'transactions', 'budgets', 'commissions', 'vendorbills', 'contracts', 'payouts'],
    write: ['invoices', 'transactions', 'budgets', 'commissions', 'vendorbills', 'contracts', 'payouts'],
    nav: ['invoices', 'finance', 'finplan', 'commissions', 'vendors', 'contracts'],
    actions: [],
  },
  {
    role: 'HR',
    read: ['candidates', 'onboardings', 'leaves', 'attendance', 'teams', 'assets', 'holidays', 'reviews'],
    write: ['candidates', 'onboardings', 'leaves', 'attendance', 'teams', 'assets', 'holidays', 'reviews'],
    nav: ['staff', 'attendance', 'recruitment', 'reviews', 'assets', 'freelancers'],
    actions: [],
  },
  {
    role: 'LEAD',
    read: ['projects', 'tasks', 'quotes', 'contracts', 'vendors', 'clients', 'contacts'],
    write: ['projects', 'milestones', 'tasks', 'phases', 'vendors', 'vendorbills', 'rfqs', 'projectmembers', 'projecttemplates'],
    nav: ['portfolio', 'projects', 'tasks', 'teamwork', 'resources', 'templates', 'vendors', 'quotes', 'contracts', 'freelancers'],
    actions: ['task.assign', 'task.delegate.create', 'task.reprioritize', 'task.block', 'task.unblock', 'task.escalate', 'task.split', 'task.merge'],
  },
  {
    role: 'STAFF',
    read: ['tasks', 'timelogs', 'leaves', 'attendance', 'taskcomments'],
    write: ['tasks', 'timelogs', 'leaves', 'attendance', 'taskcomments'],
    nav: ['myday', 'tasks', 'timesheet', 'attendance'],
    actions: [],
  },
]);

function hasNav(key, user) {
  const item = ERP_NAV.find((entry) => entry.key === key);
  if (!item) return false;
  return user.roles.includes('DIRECTOR') || item.roles?.some((role) => user.roles.includes(role));
}

export function auditRoleCapabilities() {
  const checks = [];
  for (const requirement of ROLE_CAPABILITY_REQUIREMENTS) {
    const user = userFor(requirement.role);
    for (const resource of requirement.read) checks.push({ role: requirement.role, kind: 'read', capability: resource, ok: canRead(resource, user) });
    for (const resource of requirement.write) checks.push({ role: requirement.role, kind: 'write', capability: resource, ok: canWrite(resource, user) });
    for (const route of requirement.nav) checks.push({ role: requirement.role, kind: 'nav', capability: route, ok: hasNav(route, user) });
    for (const action of requirement.actions) checks.push({ role: requirement.role, kind: 'action', capability: action, ok: Boolean(repositoryRealmsContract(action)) });
  }
  return { requirements: ROLE_CAPABILITY_REQUIREMENTS, checks, failures: checks.filter((check) => !check.ok) };
}
