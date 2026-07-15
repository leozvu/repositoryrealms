// v3.10: Bộ tính chỉ số vận hành dự án — chạy server-side để dùng lương (đơn giá giờ)
// mà không lộ lương cá nhân ra ngoài.
import { hourRate } from './format.js';

const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

// Tiến độ tự động: trọng số theo giờ ước lượng nếu có, không thì đếm task
export function computeProgress(tasks) {
  if (!tasks.length) return 0;
  const totalEst = tasks.reduce((s, t) => s + (t.estHours || 0), 0);
  if (totalEst > 0) {
    const doneEst = tasks.filter(t => t.status === 'done').reduce((s, t) => s + (t.estHours || 0), 0);
    return Math.round(doneEst / totalEst * 100);
  }
  return Math.round(tasks.filter(t => t.status === 'done').length / tasks.length * 100);
}

// Đơn giá giờ: freelancer dùng hourlyRate; nhân viên dùng lương÷176
export const rateOf = u => u?.userType === 'freelancer' ? (u.hourlyRate || 0) : hourRate(u?.salary || 0);

// Chi phí lao động = Σ(giờ log × đơn giá giờ người đó)
export function laborCost(timeLogs, usersById) {
  return Math.round(timeLogs.reduce((s, l) => s + l.hours * rateOf(usersById[l.userId]), 0));
}

// Sức khỏe dự án RAG: chọn tín hiệu tệ nhất
export function projectHealth({ project, tasks, loggedHours, cost }) {
  const today = todayISO();
  const active = project.status === 'active';
  const overdueTasks = tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today).length;
  const burnH = project.budgetHours > 0 ? loggedHours / project.budgetHours : 0;
  const overBudget = project.budget > 0 && cost > project.budget;
  const lateDeadline = active && project.deadline && project.deadline < today;
  const soon = project.deadline && project.deadline >= today && (new Date(project.deadline) - new Date(today)) / 86400000 <= 7;
  const progress = computeProgress(tasks);

  const reasons = [];
  let level = 'green';
  const bad = m => { level = 'red'; reasons.push(m); };
  const warn = m => { if (level !== 'red') level = 'amber'; reasons.push(m); };

  if (lateDeadline) bad('Đã trễ deadline');
  if (overBudget) bad('Vượt ngân sách chi phí');
  if (burnH > 1) bad(`Vượt ngân sách giờ (${Math.round(burnH * 100)}%)`);
  if (burnH > 0.8 && burnH <= 1) warn(`Sắp cạn giờ (${Math.round(burnH * 100)}%)`);
  if (soon && progress < 80) warn('Sát deadline mà tiến độ < 80%');
  if (overdueTasks) warn(`${overdueTasks} việc trễ hạn`);

  return { level, reasons };
}

// Gộp toàn bộ chỉ số cho 1 dự án
export function projectStats({ project, tasks, timeLogs, usersById, vendorBills, canSeeMoney }) {
  const pt = tasks.filter(t => t.projectId === project.id);
  const pl = timeLogs.filter(l => l.projectId === project.id);
  const loggedHours = Math.round(pl.reduce((s, l) => s + l.hours, 0) * 10) / 10;
  const estHours = Math.round(pt.reduce((s, t) => s + (t.estHours || 0), 0) * 10) / 10;
  const progress = computeProgress(pt);
  const labor = laborCost(pl, usersById);
  const vendor = (vendorBills || []).filter(b => b.projectId === project.id).reduce((s, b) => s + b.amount, 0);
  const cost = labor + vendor;
  const health = projectHealth({ project, tasks: pt, loggedHours, cost });
  const out = {
    id: project.id, progress, estHours, loggedHours,
    burnHours: project.budgetHours > 0 ? Math.round(loggedHours / project.budgetHours * 100) : null,
    taskDone: pt.filter(t => t.status === 'done').length, taskTotal: pt.length,
    taskOverdue: pt.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < todayISO()).length,
    health: health.level, healthReasons: health.reasons,
  };
  if (canSeeMoney) { out.cost = cost; out.labor = labor; out.vendor = vendor; out.budget = project.budget; out.margin = project.budget - cost; }
  return out;
}
