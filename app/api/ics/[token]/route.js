// v3.3: Feed iCalendar cá nhân — sự kiện tương tự trang Lịch, lọc theo vai trò.
// URL chứa token HMAC nên không cần đăng nhập (Google Calendar gọi định kỳ).
import { prisma } from '@/lib/prisma';
import { icsToken, buildICS } from '@/lib/ics';
import { rolesOf, hasAny } from '@/lib/perm';

export async function GET(req, { params }) {
  const users = await prisma.user.findMany({ where: { status: 'active' } });
  const user = users.find(u => icsToken(u.id) === params.token);
  if (!user) return new Response('not found', { status: 404 });
  const roles = rolesOf(user);
  const can = allowed => hasAny({ roles }, allowed);

  const [tasks, projects, milestones, leaves, activities, contracts, invoices] = await Promise.all([
    prisma.task.findMany({ where: { assigneeId: user.id, status: { not: 'done' } } }),
    prisma.project.findMany({ where: { status: { notIn: ['done'] } } }),
    prisma.milestone.findMany({ where: { done: false } }),
    prisma.leave.findMany({ where: { userId: user.id, status: 'approved' } }),
    prisma.activity.findMany({ where: { done: false } }),
    can(['ACCOUNTANT', 'AM', 'PM']) ? prisma.contract.findMany({ where: { status: 'active' } }) : [],
    can(['ACCOUNTANT', 'AM']) ? prisma.invoice.findMany({ where: { status: { notIn: ['paid', 'draft'] } } }) : [],
  ]);

  const events = [
    ...tasks.filter(t => t.dueDate).map(t => ({ id: 'task-' + t.id, date: t.dueDate, title: '✅ Hạn việc: ' + t.title })),
    ...projects.filter(p => p.deadline).map(p => ({ id: 'proj-' + p.id, date: p.deadline, title: '📁 Deadline dự án: ' + p.name })),
    ...milestones.map(m => ({ id: 'ms-' + m.id, date: m.date, title: '◆ Mốc: ' + m.name, desc: m.note })),
    ...leaves.map(l => ({ id: 'leave-' + l.id, date: l.from, endDate: l.to, title: '🌴 Nghỉ phép' })),
    ...activities.filter(a => a.date && (can(['AM']) || a.userId === user.id))
      .map(a => ({ id: 'act-' + a.id, date: a.date, title: '📞 ' + a.title })),
    ...contracts.filter(c => c.endDate).map(c => ({ id: 'ct-' + c.id, date: c.endDate, title: `📄 HĐ ${c.code} hết hạn (${c.partner})` })),
    ...invoices.filter(v => v.dueDate).map(v => ({ id: 'inv-' + v.id, date: v.dueDate, title: '💰 Hạn thu ' + v.code })),
  ];

  return new Response(buildICS(`Agency ERP — ${user.name}`, events), {
    headers: {
      'Content-Type': 'text/calendar; charset=utf-8',
      'Content-Disposition': 'attachment; filename="agency-erp.ics"',
      'Cache-Control': 'no-cache',
    },
  });
}
