// ============================================================
// RBAC v2.1 — 7 vai trò theo ma trận trong KE-HOACH-ERP-V2.md
// DIRECTOR luôn có toàn quyền (xử lý trong canRead/Write/Delete).
// scope(user) → điều kiện WHERE; sanitize(row, user) → che trường.
// ============================================================
import { hasAny, rolesOf, isDirector } from './perm';

const ALL = ['PM', 'AM', 'ACCOUNTANT', 'HR', 'LEAD', 'STAFF']; // + DIRECTOR ngầm định

export const RESOURCES = {
  clients: {
    model: 'client', read: ALL, write: ['AM'], del: [],
    orderBy: { name: 'asc' },
    // Chỉ AM / PM / Kế toán / GĐ thấy thông tin liên hệ thương mại
    sanitize: (row, user) => hasAny(user, ['AM', 'PM', 'ACCOUNTANT'])
      ? row : { id: row.id, name: row.name, industry: row.industry },
  },
  leads: {
    model: 'lead', read: ['AM'], write: ['AM'], del: [],
    orderBy: { createdAt: 'desc' },
    // AM chỉ thấy lead mình phụ trách hoặc chưa gán; GĐ thấy tất cả
    scope: user => isDirector(user) ? {} : { OR: [{ ownerId: user.id }, { ownerId: null }] },
  },
  services: {
    model: 'service', read: ALL, write: ['AM'], del: ['AM'],
    orderBy: { name: 'asc' },
  },
  quotes: {
    model: 'quote', read: ['AM', 'PM', 'ACCOUNTANT'], write: ['AM'], del: [],
    orderBy: { date: 'desc' },
  },
  projects: {
    model: 'project', read: ALL, write: ['PM'], del: [],
    orderBy: { deadline: 'asc' },
  },
  tasks: {
    model: 'task', read: ALL, write: ALL, del: ['PM', 'LEAD'],
    orderBy: { dueDate: 'asc' },
    // STAFF/AM chỉ sửa task của mình; LEAD sửa task nhóm; PM/GĐ tất cả
    canWriteRow: (row, user) => hasAny(user, ['PM']) || row.assigneeId === user.id
      || (rolesOf(user).includes('LEAD') && row.assigneeId !== null),
    filterUpdate: (data, user) => {
      if (!hasAny(user, ['PM', 'LEAD'])) { const { assigneeId, ...rest } = data; return rest; }
      return data;
    },
  },
  timelogs: {
    model: 'timeLog', read: ALL, write: ALL, del: ALL,
    orderBy: { date: 'desc' },
    // Own → LEAD thấy nhóm → PM/Kế toán/HR/GĐ thấy tất cả
    scope: user => {
      if (hasAny(user, ['PM', 'ACCOUNTANT', 'HR'])) return {};
      if (rolesOf(user).includes('LEAD') && user.teamId) return { user: { teamId: user.teamId } };
      return { userId: user.id };
    },
    canWriteRow: (row, user) => hasAny(user, ['PM']) || row.userId === user.id,
    beforeCreate: (data, user) => hasAny(user, ['PM', 'LEAD', 'HR']) ? data : { ...data, userId: user.id },
  },
  invoices: {
    model: 'invoice', read: ['ACCOUNTANT', 'AM'], write: ['ACCOUNTANT'], del: [],
    orderBy: { date: 'desc' },
  },
  transactions: {
    model: 'transaction', read: ['ACCOUNTANT'], write: ['ACCOUNTANT'], del: [],
    orderBy: { date: 'desc' },
  },
  vendors: {
    model: 'vendor', read: ['ACCOUNTANT', 'PM'], write: ['ACCOUNTANT', 'PM'], del: [],
    orderBy: { name: 'asc' },
  },
  vendorbills: {
    model: 'vendorBill', read: ['ACCOUNTANT', 'PM'], write: ['ACCOUNTANT', 'PM'], del: [],
    orderBy: { date: 'desc' },
  },
  contracts: {
    model: 'contract', read: ['ACCOUNTANT', 'AM', 'PM'], write: ['ACCOUNTANT'], del: [],
    orderBy: { endDate: 'asc' },
  },
  leaves: {
    model: 'leave', read: ALL, write: ALL, del: ['HR'],
    orderBy: { from: 'desc' },
    scope: user => {
      if (hasAny(user, ['HR'])) return {};
      if (rolesOf(user).includes('LEAD') && user.teamId) return { OR: [{ userId: user.id }, { user: { teamId: user.teamId } }] };
      return { userId: user.id };
    },
    beforeCreate: (data, user) => hasAny(user, ['HR']) ? { ...data, status: data.status || 'pending' } : { ...data, userId: user.id, status: 'pending' },
    // Trạng thái chỉ đổi qua máy phê duyệt (hoặc HR/GĐ)
    filterUpdate: (data, user) => {
      if (!hasAny(user, ['HR'])) { const { status, ...rest } = data; return rest; }
      return data;
    },
  },
  teams: {
    model: 'team', read: ALL, write: ['HR'], del: [],
    orderBy: { name: 'asc' },
  },
  users: {
    model: 'user', read: ALL, write: [], del: [], // ghi qua /api/users riêng
    orderBy: { name: 'asc' },
    sanitize: (row, user) => {
      const { passwordHash, ...safe } = row;
      if (isDirector(user) || hasAny(user, ['HR', 'ACCOUNTANT']) || row.id === user.id) return safe;
      const { salary, ...pub } = safe;
      return pub;
    },
  },
  assets: {
    model: 'asset', read: ALL, write: ['HR'], del: [],
    orderBy: { name: 'asc' },
    sanitize: (row, user) => {
      if (hasAny(user, ['HR', 'ACCOUNTANT'])) return row;
      const { price, ...pub } = row;
      return pub;
    },
  },
  activities: {
    model: 'activity', read: ['AM'], write: ['AM'], del: ['AM'],
    orderBy: { date: 'asc' },
  },
  attendance: {
    model: 'attendance', read: ALL, write: ALL, del: ['HR'],
    orderBy: { date: 'desc' },
    scope: user => {
      if (hasAny(user, ['HR'])) return {};
      if (rolesOf(user).includes('LEAD') && user.teamId) return {}; // lead xem cả nhóm (lọc client-side theo team)
      return { userId: user.id };
    },
    beforeCreate: (data, user) => hasAny(user, ['HR']) ? data : { ...data, userId: user.id },
    canWriteRow: (row, user) => hasAny(user, ['HR']) || row.userId === user.id,
  },
  candidates: {
    model: 'candidate', read: ['HR'], write: ['HR'], del: ['HR'],
    orderBy: { createdAt: 'desc' },
  },
  budgets: {
    model: 'budget', read: ['ACCOUNTANT'], write: ['ACCOUNTANT'], del: ['ACCOUNTANT'],
    orderBy: { category: 'asc' },
  },
  okrs: {
    model: 'okr', read: ALL, write: ALL, del: ['HR', 'PM'],
    orderBy: { quarter: 'desc' },
    // Ai cũng cập nhật tiến độ OKR của mình; tạo/sửa mục tiêu người khác cần PM/HR/GĐ
    canWriteRow: (row, user) => hasAny(user, ['PM', 'HR']) || row.userId === user.id || row.userId === null,
  },
  nps: {
    model: 'npsResponse', read: ['AM', 'PM'], write: ['AM'], del: ['AM'],
    orderBy: { date: 'desc' },
  },
  tickets: {
    model: 'ticket', read: ALL, write: ALL, del: ['AM', 'PM'],
    orderBy: { createdAt: 'desc' },
  },
  audit: {
    model: 'auditLog', read: [], write: [], del: [], // chỉ DIRECTOR
    orderBy: { at: 'desc' },
  },
};

export function canRead(res, user) { const c = RESOURCES[res]; return !!c && (isDirector(user) || hasAny(user, c.read)); }
export function canWrite(res, user) { const c = RESOURCES[res]; return !!c && (isDirector(user) || hasAny(user, c.write)); }
export function canDelete(res, user) { const c = RESOURCES[res]; return !!c && (isDirector(user) || hasAny(user, c.del)); }
