import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';
import { hasAny, rolesOf, ROLE_LABEL } from '@/lib/perm';

// ============================================================
// AI Copilot: gom dữ liệu công ty (LỌC THEO VAI TRÒ người hỏi)
// rồi gọi Claude API. Key lấy từ ANTHROPIC_API_KEY hoặc Cài đặt.
// ============================================================
const parseItems = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
const grand = v => Math.round(parseItems(v.items).reduce((s, it) => s + it.qty * it.price, 0) * (1 + (v.vat || 0) / 100));
const paidOf = v => parseItems(v.payments).reduce((s, p) => s + (+p.amount || 0), 0);
const mkey = off => { const d = new Date(); d.setMonth(d.getMonth() + off); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

async function buildContext(user) {
  const ctx = { hom_nay: new Date().toISOString().slice(0, 10), nguoi_hoi: { ten: user.name, vai_tro: rolesOf(user).map(r => ROLE_LABEL[r]) } };
  const [projects, tasks, users, tickets] = await Promise.all([
    prisma.project.findMany(), prisma.task.findMany(),
    prisma.user.findMany({ where: { status: 'active' }, select: { id: true, name: true, title: true } }),
    prisma.ticket.findMany({ where: { NOT: { status: 'closed' } } }),
  ]);
  ctx.nhan_su = users.map(u => `${u.name} (${u.title || ''})`);
  ctx.du_an = projects.map(p => ({ ten: p.name, trang_thai: p.status, tien_do: p.progress + '%', deadline: p.deadline }));
  ctx.cong_viec_tre = tasks.filter(t => t.status !== 'done' && t.dueDate && t.dueDate < ctx.hom_nay)
    .map(t => ({ viec: t.title, han: t.dueDate, nguoi: users.find(u => u.id === t.assigneeId)?.name }));
  ctx.ticket_mo = tickets.map(t => ({ ma: t.code, van_de: t.title, uu_tien: t.priority }));

  if (hasAny(user, ['ACCOUNTANT'])) {
    const [txs, invoices, bills] = await Promise.all([prisma.transaction.findMany(), prisma.invoice.findMany(), prisma.vendorBill.findMany({ where: { NOT: { status: 'paid' } } })]);
    const sum = (type, k) => txs.filter(t => t.type === type && t.date.startsWith(k)).reduce((s, t) => s + t.amount, 0);
    ctx.tai_chinh = {
      thang_nay: { doanh_thu: sum('income', mkey(0)), chi_phi: sum('expense', mkey(0)) },
      thang_truoc: { doanh_thu: sum('income', mkey(-1)), chi_phi: sum('expense', mkey(-1)) },
      hoa_don_chua_thu: invoices.filter(v => !['paid', 'draft'].includes(v.status)).map(v => ({ ma: v.code, con_lai: grand(v) - paidOf(v), han: v.dueDate, qua_han: v.dueDate < ctx.hom_nay })),
      no_phai_tra_ncc: bills.map(b => ({ ma: b.code, so_tien: b.amount, han: b.dueDate })),
      chi_theo_danh_muc_thang_nay: Object.entries(txs.filter(t => t.type === 'expense' && t.date.startsWith(mkey(0))).reduce((o, t) => { o[t.category || 'Khác'] = (o[t.category || 'Khác'] || 0) + t.amount; return o; }, {})),
    };
  }
  if (hasAny(user, ['AM'])) {
    const [leads, clients, invoices] = await Promise.all([prisma.lead.findMany(), prisma.client.findMany(), prisma.invoice.findMany()]);
    const revByClient = {};
    invoices.forEach(v => { const p = paidOf(v); if (p) revByClient[v.clientId] = (revByClient[v.clientId] || 0) + p; });
    ctx.crm = {
      pipeline: leads.filter(l => !['won', 'lost'].includes(l.stage)).map(l => ({ deal: l.company || l.name, gia_tri: l.value, giai_doan: l.stage, nguon: l.source })),
      ty_le_thang: (() => { const c = leads.filter(l => ['won', 'lost'].includes(l.stage)); return c.length ? Math.round(leads.filter(l => l.stage === 'won').length / c.length * 100) + '%' : 'chưa có'; })(),
      khach_hang: clients.map(c => ({ ten: c.name, nganh: c.industry, doanh_thu_da_thu: revByClient[c.id] || 0 })),
    };
  }
  if (hasAny(user, ['HR'])) {
    const full = await prisma.user.findMany({ where: { status: 'active' }, select: { name: true, salary: true, title: true } });
    ctx.luong = full.map(u => ({ ten: u.name, chuc_danh: u.title, luong: u.salary }));
  }
  return ctx;
}

export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const { messages } = await req.json();

  let apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    const row = await prisma.setting.findUnique({ where: { id: 1 } });
    apiKey = row ? JSON.parse(row.json).anthropicKey : null;
  }
  if (!apiKey) return NextResponse.json({ error: 'NO_KEY' }, { status: 400 });

  const ctx = await buildContext(user);
  const system = `Bạn là AI Copilot của hệ thống Agency ERP — trợ lý điều hành cho một marketing agency Việt Nam.
Trả lời NGẮN GỌN, bằng tiếng Việt, dùng số liệu THẬT từ dữ liệu bên dưới (định dạng tiền: 1.500.000đ hoặc 1,5 triệu).
Ngoài trả lời câu hỏi, bạn có thể: viết email/proposal/báo cáo theo yêu cầu, phân tích và khuyến nghị hành động.
Nếu dữ liệu không đủ để trả lời, nói rõ thiếu gì. KHÔNG bịa số liệu.
Người hỏi chỉ được xem dữ liệu đúng vai trò của họ — dữ liệu dưới đây đã được lọc sẵn, cứ dùng thoải mái.

DỮ LIỆU CÔNG TY (JSON):
${JSON.stringify(ctx)}`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-5', max_tokens: 1500, system,
        messages: (messages || []).slice(-10).map(m => ({ role: m.role, content: m.content })),
      }),
    });
    const json = await res.json();
    if (!res.ok) return NextResponse.json({ error: json.error?.message || 'Lỗi gọi Claude API' }, { status: 500 });
    await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'copilot', entity: 'ai', detail: (messages?.at(-1)?.content || '').slice(0, 80) } });
    return NextResponse.json({ reply: json.content?.[0]?.text || '(không có phản hồi)' });
  } catch (e) {
    return NextResponse.json({ error: 'Không kết nối được Claude API: ' + e.message }, { status: 500 });
  }
}
