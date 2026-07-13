// v3.6: Báo cáo tổng hợp cho master dashboard đa doanh nghiệp.
// Chỉ API key mang vai trò DIRECTOR gọi được — trả KPI + insight của cả công ty.
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { apiUser } from '@/lib/apiauth';
import { buildInsights } from '@/lib/insights';

const parseItems = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const grand = v => Math.round(parseItems(v.items).reduce((s, it) => s + (+it.qty || 0) * (+it.price || 0), 0) * (1 + (+v.vat || 0) / 100));
const paidOf = v => parseItems(v.payments).reduce((s, p) => s + (+p.amount || 0), 0);
const mk = off => { const d = new Date(); d.setMonth(d.getMonth() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export async function GET(req) {
  const user = await apiUser(req);
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  if (!(user.roles || []).includes('DIRECTOR')) {
    return NextResponse.json({ error: 'forbidden — cần API key vai trò Giám đốc' }, { status: 403 });
  }

  const [settingRow, txs, invoices, leads, projects, clients, tickets, bills, headcount, insights] = await Promise.all([
    prisma.setting.findUnique({ where: { id: 1 } }),
    prisma.transaction.findMany(),
    prisma.invoice.findMany(),
    prisma.lead.findMany(),
    prisma.project.findMany(),
    prisma.client.findMany(),
    prisma.ticket.findMany(),
    prisma.vendorBill.findMany(),
    prisma.user.count({ where: { status: 'active' } }),
    buildInsights(),
  ]);
  const settings = settingRow ? JSON.parse(settingRow.json) : {};
  const tm = mk(0), lm = mk(-1);
  const sum = (arr, f) => arr.reduce((s, x) => s + f(x), 0);

  const revenue = sum(txs.filter(t => t.type === 'income' && t.date.startsWith(tm)), t => t.amount);
  const revenuePrev = sum(txs.filter(t => t.type === 'income' && t.date.startsWith(lm)), t => t.amount);
  const expense = sum(txs.filter(t => t.type === 'expense' && t.date.startsWith(tm)), t => t.amount);
  const ar = sum(invoices.filter(v => v.status !== 'draft'), v => Math.max(0, grand(v) - paidOf(v)));
  const ap = sum(bills.filter(b => b.status !== 'paid'), b => b.amount);
  const openLeads = leads.filter(l => !['won', 'lost'].includes(l.stage));
  const closed = leads.filter(l => ['won', 'lost'].includes(l.stage));
  const openTickets = tickets.filter(t => !['resolved', 'closed'].includes(t.status));

  return NextResponse.json({
    company: settings.company || 'Chưa đặt tên',
    at: new Date().toISOString(),
    month: tm,
    kpi: {
      revenue, revenuePrev, expense, profit: revenue - expense,
      monthlyTarget: settings.monthlyTarget || 0,
      ar, ap,
      pipelineValue: sum(openLeads, l => l.value || 0),
      pipelineCount: openLeads.length,
      winRate: closed.length ? Math.round(leads.filter(l => l.stage === 'won').length / closed.length * 100) : null,
      projectsActive: projects.filter(p => p.status === 'active').length,
      projectsLate: projects.filter(p => p.status === 'active' && p.deadline && p.deadline < new Date().toISOString().slice(0, 10)).length,
      clients: clients.length,
      ticketsOpen: openTickets.length,
      slaBreach: openTickets.filter(t => t.dueAt && new Date(t.dueAt) < new Date()).length,
      headcount,
    },
    insights: insights.filter(i => ['bad', 'warn'].includes(i.level)).slice(0, 6).map(i => ({ level: i.level, text: i.text })),
  });
}
