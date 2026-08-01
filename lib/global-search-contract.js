import { realmRecordHref } from '@/lib/realm-business-bridge';

// Shared presentation contract for the ERP Ctrl+K overlay and the Realm v2
// full-page search. Both clients still read the same authorized /api/data
// resources and open the same canonical record routes.
export const GLOBAL_SEARCH_GROUPS = Object.freeze([
  { res: 'clients', label: 'Khách hàng', icon: 'clients', text: (row) => [row.name, row.contact, row.industry, row.phone], title: (row) => row.name, sub: (row) => row.industry || '', href: (row) => `/clients/${row.id}` },
  { res: 'leads', label: 'Khách tiềm năng', icon: 'leads', text: (row) => [row.name, row.company, row.phone, row.email], title: (row) => row.company || row.name, sub: (row) => row.name, href: (row) => realmRecordHref('lead', row.id) },
  { res: 'projects', label: 'Dự án', icon: 'projects', text: (row) => [row.name, row.service], title: (row) => row.name, sub: (row) => row.service || '', href: (row) => realmRecordHref('project', row.id) },
  { res: 'tasks', label: 'Công việc', icon: 'tasks', text: (row) => [row.title, row.note], title: (row) => row.title, sub: (row) => row.status, href: (row) => realmRecordHref('task', row.id) },
  { res: 'invoices', label: 'Hóa đơn', icon: 'invoices', text: (row) => [row.code], title: (row) => row.code, sub: (row) => row.date, href: () => '/invoices' },
  { res: 'tickets', label: 'Ticket', icon: 'check', text: (row) => [row.code, row.title], title: (row) => `${row.code}: ${row.title}`, sub: (row) => row.status, href: () => '/tickets' },
  { res: 'vendors', label: 'Nhà cung cấp', icon: 'wallet', text: (row) => [row.name, row.type], title: (row) => row.name, sub: (row) => row.type || '', href: () => '/vendors' },
  { res: 'contracts', label: 'Hợp đồng', icon: 'shield', text: (row) => [row.code, row.partner], title: (row) => `${row.code} — ${row.partner}`, sub: (row) => row.endDate || '', href: () => '/contracts' },
  { res: 'users', label: 'Nhân sự', icon: 'staff', text: (row) => [row.name, row.email, row.title], title: (row) => row.name, sub: (row) => row.title || '', href: (row) => realmRecordHref('staff', row.id) },
]);

export function searchGroupRows(group, rows, query, limit = 8) {
  const needle = String(query || '').trim().toLocaleLowerCase('vi');
  if (needle.length < 2) return [];
  return (Array.isArray(rows) ? rows : [])
    .filter((row) => group.text(row).filter(Boolean).join(' ').toLocaleLowerCase('vi').includes(needle))
    .slice(0, limit);
}
