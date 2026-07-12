// Hệ vai trò v2.1 — dùng chung client + server (không import prisma)
// DIRECTOR luôn có toàn quyền. Một user giữ nhiều vai trò → cộng quyền.
export const ROLES = ['DIRECTOR', 'PM', 'AM', 'ACCOUNTANT', 'HR', 'LEAD', 'STAFF'];
export const ROLE_LABEL = {
  DIRECTOR: 'Giám đốc', PM: 'Quản lý dự án', AM: 'Account/Sales', ACCOUNTANT: 'Kế toán',
  HR: 'HR', LEAD: 'Trưởng nhóm', STAFF: 'Nhân viên', MANAGER: 'Quản lý (cũ)',
};

// Chuẩn hóa: nhận user từ session hoặc DB row; MANAGER cũ = PM+AM+ACCOUNTANT
export function rolesOf(user) {
  let r = user?.roles;
  if (typeof r === 'string') { try { r = JSON.parse(r); } catch { r = null; } }
  if (!Array.isArray(r) || !r.length) r = user?.role ? [user.role] : ['STAFF'];
  if (r.includes('MANAGER')) r = [...new Set([...r.filter(x => x !== 'MANAGER'), 'PM', 'AM', 'ACCOUNTANT'])];
  return r;
}
export const isDirector = u => rolesOf(u).includes('DIRECTOR');
export const hasAny = (u, allowed) => {
  const r = rolesOf(u);
  return r.includes('DIRECTOR') || allowed.some(a => r.includes(a));
};

// Nhóm quyền dùng ở giao diện (server enforce riêng trong registry)
export const P = {
  crmWrite: ['AM'],              // leads, khách hàng, báo giá, bảng giá
  opsWrite: ['PM'],              // dự án, tạo/xóa công việc
  taskManage: ['PM', 'LEAD'],
  financeView: ['ACCOUNTANT'],   // hóa đơn, thu chi, NCC, báo cáo tài chính
  hrWrite: ['HR'],               // hồ sơ nhân sự, nghỉ phép, tài sản
  salaryView: ['HR', 'ACCOUNTANT'],
  timesheetManage: ['PM', 'LEAD', 'HR'],
};
