// ============================================================
// AI Summary engine — phân tích toàn bộ dữ liệu và sinh nhận định
// (rule-based, chạy tức thời không cần API ngoài; LLM copilot là bước sau)
// Mỗi insight gắn roles[] — server lọc theo vai trò người xem.
// ============================================================
import { prisma } from './prisma.js';

const money = n => (Math.abs(n) >= 1e9 ? (n / 1e9).toFixed(1).replace('.0', '') + ' tỷ' : Math.round(n / 1e6) + ' triệu');
const todayISO = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const monthKeyOf = off => { const d = new Date(); d.setMonth(d.getMonth() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const parseItems = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const grand = v => Math.round(parseItems(v.items).reduce((s, it) => s + it.qty * it.price, 0) * (1 + (v.vat || 0) / 100));
const paidOf = v => parseItems(v.payments).reduce((s, p) => s + (+p.amount || 0), 0);

const FIN = ['DIRECTOR', 'ACCOUNTANT'];
const SALES = ['DIRECTOR', 'AM'];
const OPS = ['DIRECTOR', 'PM', 'LEAD'];

export async function buildInsights() {
  const [txs, invoices, leads, clients, projects, tasks, timeLogs, users, contracts, activities, tickets, bills, settingRow] = await Promise.all([
    prisma.transaction.findMany(), prisma.invoice.findMany(), prisma.lead.findMany(),
    prisma.client.findMany(), prisma.project.findMany(), prisma.task.findMany(),
    prisma.timeLog.findMany(), prisma.user.findMany({ where: { status: 'active' } }),
    prisma.contract.findMany(), prisma.activity.findMany(), prisma.ticket.findMany(), prisma.vendorBill.findMany(),
    prisma.setting.findUnique({ where: { id: 1 } }),
  ]);
  const settings = { monthlyTarget: 300000000, probNew: 10, probContacted: 20, probProposal: 40, probNegotiation: 60, ...(settingRow ? JSON.parse(settingRow.json) : {}) };
  const today = todayISO();
  const tm = monthKeyOf(0), lm = monthKeyOf(-1);
  const out = []; // {level: 'bad'|'warn'|'good'|'info', text, roles, route}
  const add = (level, text, roles, route) => out.push({ level, text, roles, route });

  /* ---- Doanh thu so tháng trước (cùng số ngày) ---- */
  const day = +today.slice(8, 10);
  const revTo = (k, d) => txs.filter(t => t.type === 'income' && t.date.startsWith(k) && +t.date.slice(8, 10) <= d).reduce((s, t) => s + t.amount, 0);
  const revNow = revTo(tm, day), revPrev = revTo(lm, day);
  if (revPrev > 0) {
    const pct = Math.round((revNow - revPrev) / revPrev * 100);
    if (pct <= -10) add('bad', `Doanh thu tháng này đang giảm ${-pct}% so với cùng kỳ tháng trước (${money(revNow)} vs ${money(revPrev)}).`, FIN, 'reports');
    else if (pct >= 10) add('good', `Doanh thu tháng này tăng ${pct}% so với cùng kỳ tháng trước — đạt ${money(revNow)}.`, FIN, 'reports');
  }

  /* ---- Hóa đơn quá hạn / công nợ ---- */
  const overdue = invoices.filter(v => !['paid', 'draft'].includes(v.status) && v.dueDate && v.dueDate < today && grand(v) - paidOf(v) > 0);
  if (overdue.length) {
    const total = overdue.reduce((s, v) => s + grand(v) - paidOf(v), 0);
    add('bad', `${overdue.length} hóa đơn quá hạn, tổng ${money(total)} chưa thu — cần nhắc nợ ngay.`, [...FIN, 'AM'], 'finplan');
  }
  const apDue = bills.filter(b => b.status !== 'paid' && b.dueDate && b.dueDate < today);
  if (apDue.length) add('warn', `${apDue.length} hóa đơn nhà cung cấp đã quá hạn trả — giữ uy tín với đối tác.`, FIN, 'vendors');

  /* ---- Khách nguy cơ churn ---- */
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - 45);
  const churn = clients.filter(c => {
    const hasActiveProject = projects.some(p => p.clientId === c.id && p.status === 'active');
    const hasOverdue = overdue.some(v => v.clientId === c.id);
    const recentAct = activities.some(a => a.refType === 'client' && a.refId === c.id && a.date && new Date(a.date) >= cutoff);
    const recentInv = invoices.some(v => v.clientId === c.id && new Date(v.date) >= cutoff);
    return hasOverdue || (!hasActiveProject && !recentAct && !recentInv);
  });
  if (churn.length) add('warn', `${churn.length} khách hàng có nguy cơ rời bỏ (nợ quá hạn hoặc >45 ngày không tương tác): ${churn.slice(0, 3).map(c => c.name).join(', ')}${churn.length > 3 ? '…' : ''}. Nên đặt lịch chăm sóc.`, SALES, 'clients');

  /* ---- Deadline & công việc trễ ---- */
  const lateTasks = tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < today);
  if (lateTasks.length) {
    const byAssignee = {};
    lateTasks.forEach(t => { const u = users.find(x => x.id === t.assigneeId); if (u) byAssignee[u.name] = (byAssignee[u.name] || 0) + 1; });
    const who = Object.entries(byAssignee).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([n, c]) => `${n} (${c})`).join(', ');
    add('bad', `${lateTasks.length} công việc đang trễ deadline${who ? ' — nhiều nhất: ' + who : ''}.`, OPS, 'tasks');
  }
  const lateProjects = projects.filter(p => p.status === 'active' && p.deadline && p.deadline < today);
  if (lateProjects.length) add('warn', `${lateProjects.length} dự án đã vượt deadline: ${lateProjects.map(p => p.name).slice(0, 2).join(', ')}.`, OPS, 'projects');

  /* ---- Ticket SLA ---- */
  const openTk = tickets.filter(t => !['resolved', 'closed'].includes(t.status));
  const slaBreach = openTk.filter(t => t.dueAt && new Date(t.dueAt) < new Date());
  if (slaBreach.length) add('bad', `${slaBreach.length}/${openTk.length} ticket hỗ trợ đã vỡ SLA — ưu tiên xử lý.`, [...SALES, 'PM'], 'tickets');
  else if (openTk.length) add('info', `${openTk.length} ticket hỗ trợ đang mở, chưa có ticket nào vỡ SLA.`, [...SALES, 'PM'], 'tickets');

  /* ---- Pipeline & conversion ---- */
  const openLeads = leads.filter(l => !['won', 'lost'].includes(l.stage));
  const pipelineVal = openLeads.reduce((s, l) => s + (l.value || 0), 0);
  const closed = leads.filter(l => ['won', 'lost'].includes(l.stage));
  const winRate = closed.length ? Math.round(leads.filter(l => l.stage === 'won').length / closed.length * 100) : null;
  if (openLeads.length) add('info', `Pipeline đang mở: ${openLeads.length} cơ hội trị giá ${money(pipelineVal)}${winRate !== null ? ` · tỷ lệ thắng lịch sử ${winRate}%` : ''}.`, SALES, 'leads');
  const stale = openLeads.filter(l => l.createdAt && (new Date(today) - new Date(l.createdAt)) / 86400000 > 14 && ['proposal', 'negotiation'].includes(l.stage));
  if (stale.length) add('warn', `${stale.length} deal ở giai đoạn đề xuất/thương lượng đã quá 14 ngày chưa chốt — nên follow-up.`, SALES, 'leads');
  /* ---- v3.4: lead mới quá 48h chưa ai chạm ---- */
  const coldNew = openLeads.filter(l => l.stage === 'new' && l.createdAt && (new Date(today) - new Date(l.createdAt)) / 86400000 > 2);
  if (coldNew.length) add('bad', `${coldNew.length} lead MỚI đã quá 48h chưa được liên hệ: ${coldNew.slice(0, 2).map(l => l.company || l.name).join(', ')}${coldNew.length > 2 ? '…' : ''} — phản hồi chậm là mất deal.`, SALES, 'leads');

  /* ---- v3.4: Dự báo doanh thu chốt tháng này (weighted theo xác suất giai đoạn) ---- */
  const PROB = { new: settings.probNew, contacted: settings.probContacted, proposal: settings.probProposal, negotiation: settings.probNegotiation };
  const fc = Math.round(openLeads.filter(l => l.expectedClose && l.expectedClose.slice(0, 7) === tm)
    .reduce((s, l) => s + (l.value || 0) * (PROB[l.stage] || 0) / 100, 0));
  if (fc > 0 && settings.monthlyTarget > 0) {
    const pct = Math.round(fc / settings.monthlyTarget * 100);
    add(pct >= 50 ? 'info' : 'warn', `Dự báo chốt thêm ${money(fc)} từ pipeline trong tháng này (${pct}% mục tiêu tháng)${pct < 50 ? ' — cần đẩy thêm deal' : ''}.`, SALES, 'leads');
  }

  /* ---- Utilization ---- */
  const wdElapsed = Math.max(1, Math.min(22, Math.round(day * 22 / 30)));
  const capacity = users.filter(u => (u.salary || 0) > 0).length * 8 * wdElapsed;
  const logged = timeLogs.filter(l => l.date.startsWith(tm)).reduce((s, l) => s + l.hours, 0);
  const util = capacity ? Math.round(logged / capacity * 100) : 0;
  if (capacity) {
    if (util < 40) add('warn', `Utilization tháng này mới ${util}% (${logged}h ghi nhận) — nhân sự đang rảnh hoặc quên log giờ.`, OPS, 'timesheet');
    else if (util > 90) add('warn', `Utilization ${util}% — team đang quá tải, cân nhắc tuyển thêm hoặc giãn deadline.`, OPS, 'timesheet');
    else add('info', `Utilization nhân sự tháng này: ${util}%.`, OPS, 'timesheet');
  }

  /* ---- Burn rate ---- */
  const last3 = [monthKeyOf(-1), monthKeyOf(-2), monthKeyOf(-3)];
  const burn = Math.round(last3.reduce((s, k) => s + txs.filter(t => t.type === 'expense' && t.date.startsWith(k)).reduce((x, t) => x + t.amount, 0), 0) / 3);
  const avgIn = Math.round(last3.reduce((s, k) => s + txs.filter(t => t.type === 'income' && t.date.startsWith(k)).reduce((x, t) => x + t.amount, 0), 0) / 3);
  if (burn) add(avgIn >= burn ? 'info' : 'warn', `Burn rate trung bình 3 tháng: chi ${money(burn)}/tháng, thu ${money(avgIn)}/tháng (${avgIn >= burn ? 'dòng tiền dương' : 'ÂM — cần tăng thu hoặc giảm chi'}).`, FIN, 'finplan');

  /* ---- Hợp đồng sắp hết hạn ---- */
  const soon = new Date(); soon.setDate(soon.getDate() + 30);
  const expiring = contracts.filter(c => c.status === 'active' && c.endDate && c.endDate >= today && new Date(c.endDate) <= soon);
  if (expiring.length) add('warn', `${expiring.length} hợp đồng hết hạn trong 30 ngày tới: ${expiring.map(c => c.code + ' (' + c.partner + ')').slice(0, 2).join(', ')} — chủ động đàm phán gia hạn.`, [...FIN, 'AM'], 'contracts');

  /* ---- v3.8: Sinh nhật trong 7 ngày tới ---- */
  const bdays = users.filter(u => {
    if (!u.birthday || u.birthday.length < 10) return false;
    const md = u.birthday.slice(5); // MM-DD
    for (let i = 0; i <= 7; i++) {
      const d = new Date(); d.setDate(d.getDate() + i);
      if (`${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}` === md) return true;
    }
    return false;
  });
  if (bdays.length) add('info', `🎂 Sinh nhật trong tuần: ${bdays.map(u => `${u.name} (${u.birthday.slice(8)}/${u.birthday.slice(5, 7)})`).join(', ')} — đừng quên chúc mừng!`, ['DIRECTOR', 'HR'], 'staff');

  /* ---- Lịch hẹn hôm nay ---- */
  const todayActs = activities.filter(a => !a.done && a.date === today);
  if (todayActs.length) add('info', `Hôm nay có ${todayActs.length} lịch hẹn/việc CRM: ${todayActs.map(a => a.title).slice(0, 2).join('; ')}.`, SALES, 'clients');

  return out;
}
