import { NextResponse } from 'next/server';
import bcrypt from 'bcryptjs';
import { prisma } from '@/lib/prisma';
import { currentUser } from '@/lib/auth';

// Import file JSON xuất từ bản offline v1 — chỉ DIRECTOR.
// Nhân sự v1 → tài khoản mới (mật khẩu tạm: doimatkhau), giữ nguyên mapping id qua bảng tra.
export async function POST(req) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: 'unauthorized', code: 'unauthorized' }, { status: 401 });
  const { isDirector } = await import('@/lib/perm');
  if (!isDirector(user)) return NextResponse.json({ error: 'forbidden' }, { status: 403 });
  const v1 = await req.json();
  if (!v1 || !Array.isArray(v1.clients)) return NextResponse.json({ error: 'File không đúng định dạng bản v1' }, { status: 400 });

  const stats = {};
  const userMap = {}, clientMap = {}, projectMap = {};
  const tempHash = await bcrypt.hash('doimatkhau', 10);

  // 1. Nhân sự → users
  for (const s of v1.staff || []) {
    const email = (s.email || `${s.id}@import.local`).toLowerCase();
    let u = await prisma.user.findUnique({ where: { email } });
    if (!u) u = await prisma.user.create({
      data: { email, name: s.name, passwordHash: tempHash, role: 'STAFF', title: s.role || null, phone: s.phone || null, salary: +s.salary || 0, status: s.status === 'active' ? 'active' : 'inactive' },
    });
    userMap[s.id] = u.id;
  }
  stats.users = Object.keys(userMap).length;

  // 2. Khách hàng
  for (const c of v1.clients || []) {
    const row = await prisma.client.create({ data: { name: c.name, contact: c.contact || null, email: c.email || null, phone: c.phone || null, industry: c.industry || null, address: c.address || null, note: c.note || null, createdAt: c.createdAt || null } });
    clientMap[c.id] = row.id;
  }
  stats.clients = Object.keys(clientMap).length;

  // 3. Leads, dịch vụ
  for (const l of v1.leads || []) await prisma.lead.create({ data: { name: l.name, company: l.company || null, email: l.email || null, phone: l.phone || null, source: l.source || null, value: +l.value || 0, stage: l.stage || 'new', ownerId: userMap[l.assigneeId] || null, note: l.note || null, createdAt: l.createdAt || null } });
  stats.leads = (v1.leads || []).length;
  for (const sv of v1.services || []) await prisma.service.create({ data: { name: sv.name, unit: sv.unit || null, price: +sv.price || 0, desc: sv.desc || null } });
  stats.services = (v1.services || []).length;

  // 4. Dự án
  for (const p of v1.projects || []) {
    const row = await prisma.project.create({ data: { name: p.name, clientId: clientMap[p.clientId] || null, service: p.service || null, budget: +p.budget || 0, status: p.status || 'planning', startDate: p.startDate || null, deadline: p.deadline || null, progress: +p.progress || 0 } });
    projectMap[p.id] = row.id;
  }
  stats.projects = Object.keys(projectMap).length;

  // 5. Công việc, giờ công
  for (const t of v1.tasks || []) await prisma.task.create({ data: { title: t.title, projectId: projectMap[t.projectId] || null, assigneeId: userMap[t.assigneeId] || null, priority: t.priority || 'medium', status: t.status || 'todo', dueDate: t.dueDate || null, note: t.note || null } });
  stats.tasks = (v1.tasks || []).length;
  for (const l of v1.timeLogs || []) {
    if (!userMap[l.staffId] || !projectMap[l.projectId]) continue;
    await prisma.timeLog.create({ data: { userId: userMap[l.staffId], projectId: projectMap[l.projectId], date: l.date, hours: +l.hours || 0, billable: !!l.billable, note: l.note || null } });
  }
  stats.timeLogs = (v1.timeLogs || []).length;

  // 6. Báo giá, hóa đơn, thu chi, nghỉ phép
  for (const q of v1.quotes || []) {
    if (!clientMap[q.clientId]) continue;
    await prisma.quote.create({ data: { code: q.code, clientId: clientMap[q.clientId], items: JSON.stringify(q.items || []), vat: +q.vat || 0, status: q.status || 'draft', date: q.date, note: q.note || null } });
  }
  stats.quotes = (v1.quotes || []).length;
  for (const v of v1.invoices || []) {
    if (!clientMap[v.clientId]) continue;
    await prisma.invoice.create({ data: { code: v.code, clientId: clientMap[v.clientId], projectId: projectMap[v.projectId] || null, items: JSON.stringify(v.items || []), vat: +v.vat || 0, status: v.status || 'draft', date: v.date, dueDate: v.dueDate || null, paidDate: v.paidDate || null, payments: JSON.stringify(v.payments || []), recurring: !!v.recurring, recGroup: v.recGroup || null } });
  }
  stats.invoices = (v1.invoices || []).length;
  for (const t of v1.transactions || []) await prisma.transaction.create({ data: { type: t.type, category: t.category || null, amount: +t.amount || 0, date: t.date, desc: t.desc || null, projectId: projectMap[t.projectId] || null } });
  stats.transactions = (v1.transactions || []).length;
  for (const l of v1.leaves || []) {
    if (!userMap[l.staffId]) continue;
    await prisma.leave.create({ data: { userId: userMap[l.staffId], from: l.from, to: l.to, type: l.type || 'annual', status: l.status || 'pending', note: l.note || null } });
  }
  stats.leaves = (v1.leaves || []).length;

  // 7. Cài đặt
  if (v1.settings) {
    const { theme, ...rest } = v1.settings;
    await prisma.setting.upsert({ where: { id: 1 }, create: { id: 1, json: JSON.stringify(rest) }, update: { json: JSON.stringify(rest) } });
  }

  await prisma.auditLog.create({ data: { userId: user.id, userName: user.name, action: 'import', entity: 'all', detail: JSON.stringify(stats) } });
  return NextResponse.json({ ok: true, stats, note: 'Tài khoản nhân sự import có mật khẩu tạm: doimatkhau' });
}
