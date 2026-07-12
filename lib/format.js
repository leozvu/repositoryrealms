// Helpers dùng chung client/server — giữ nguyên logic v1
export const money = n => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0)) + ' ₫';
export const moneyShort = n => {
  n = n || 0;
  if (Math.abs(n) >= 1e9) return (n / 1e9).toFixed(1).replace('.0', '') + ' tỷ';
  if (Math.abs(n) >= 1e6) return (n / 1e6).toFixed(1).replace('.0', '') + ' tr';
  if (Math.abs(n) >= 1e3) return (n / 1e3).toFixed(0) + ' k';
  return String(Math.round(n * 10) / 10);
};
export const fmtDate = d => d ? new Date(d + (d.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('vi-VN') : '—';
export const localISO = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
export const todayISO = () => localISO(new Date());
export const daysFromNow = n => { const d = new Date(); d.setDate(d.getDate() + n); return localISO(d); };
export const monthKey = d => (d || '').slice(0, 7);
export const thisMonth = () => todayISO().slice(0, 7);
export const initials = name => (name || '?').trim().split(/\s+/).map(w => w[0]).slice(-2).join('').toUpperCase();

export const parseItems = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
export const itemsTotal = doc => parseItems(doc.items).reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0);
export const docGrand = doc => Math.round(itemsTotal(doc) * (1 + (+doc.vat || 0) / 100));
export const paidOf = v => parseItems(v.payments).reduce((s, p) => s + (+p.amount || 0), 0);
export const remainOf = v => Math.max(0, docGrand(v) - paidOf(v));
export const hourRate = salary => Math.round((+salary || 0) / 176);

export const LEAD_STAGES = [
  { key: 'new', label: 'Mới', color: '#3B82F6' },
  { key: 'contacted', label: 'Đã liên hệ', color: '#7C3AED' },
  { key: 'proposal', label: 'Gửi đề xuất', color: '#D97706' },
  { key: 'negotiation', label: 'Thương lượng', color: '#DB2777' },
  { key: 'won', label: 'Thắng', color: '#059669' },
  { key: 'lost', label: 'Thua', color: '#94A3B8' },
];
export const TASK_COLS = [
  { key: 'todo', label: 'Cần làm', color: '#94A3B8' },
  { key: 'doing', label: 'Đang làm', color: '#3B82F6' },
  { key: 'review', label: 'Chờ duyệt', color: '#D97706' },
  { key: 'done', label: 'Hoàn thành', color: '#059669' },
];
export const BADGE = {
  project: { planning: ['Lên kế hoạch', 'b-gray'], active: ['Đang chạy', 'b-blue'], paused: ['Tạm dừng', 'b-amber'], done: ['Hoàn thành', 'b-green'] },
  task: { todo: ['Cần làm', 'b-gray'], doing: ['Đang làm', 'b-blue'], review: ['Chờ duyệt', 'b-amber'], done: ['Hoàn thành', 'b-green'] },
  priority: { low: ['Thấp', 'b-gray'], medium: ['Trung bình', 'b-blue'], high: ['Cao', 'b-red'] },
  quote: { draft: ['Nháp', 'b-gray'], sent: ['Đã gửi', 'b-blue'], accepted: ['Chấp nhận', 'b-green'], rejected: ['Từ chối', 'b-red'] },
  invoice: { draft: ['Nháp', 'b-gray'], sent: ['Đã gửi', 'b-blue'], paid: ['Đã thu', 'b-green'], overdue: ['Quá hạn', 'b-red'] },
  user: { active: ['Đang làm việc', 'b-green'], inactive: ['Đã nghỉ', 'b-gray'] },
  leave: { pending: ['Chờ duyệt', 'b-amber'], approved: ['Đã duyệt', 'b-green'], rejected: ['Từ chối', 'b-red'] },
  tx: { income: ['Thu', 'b-green'], expense: ['Chi', 'b-red'] },
  lead: Object.fromEntries(LEAD_STAGES.map(s => [s.key, [s.label, s.key === 'won' ? 'b-green' : s.key === 'lost' ? 'b-gray' : s.key === 'new' ? 'b-blue' : s.key === 'contacted' ? 'b-violet' : 'b-amber']])),
};
export { ROLE_LABEL } from './perm';

// AI Lead Score (0-100, rule-based): giá trị deal + chất lượng nguồn + độ đầy đủ
// thông tin + tiến độ pipeline − phạt deal để lâu không chốt
export function leadScore(l) {
  let s = 0;
  const v = +l.value || 0;
  s += v >= 150e6 ? 30 : v >= 80e6 ? 24 : v >= 40e6 ? 18 : v >= 15e6 ? 12 : v > 0 ? 6 : 0;
  s += ({ 'Giới thiệu': 20, 'Website': 15, 'Referral': 20, 'Facebook': 10, 'Instagram': 10, 'TikTok': 8 })[l.source] ?? 5;
  s += ({ new: 4, contacted: 9, proposal: 15, negotiation: 20 })[l.stage] ?? 0;
  if (l.email) s += 7;
  if (l.phone) s += 7;
  if (l.company) s += 6;
  if (l.ownerId) s += 5;
  if (l.note) s += 5;
  if (l.createdAt) {
    const age = (Date.now() - new Date(l.createdAt)) / 86400000;
    if (age > 30) s -= 15; else if (age > 14) s -= 8;
  }
  return Math.max(0, Math.min(100, s));
}
export const scoreColor = s => s >= 65 ? '#059669' : s >= 40 ? '#D97706' : '#94A3B8';
