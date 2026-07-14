// ============================================================
// v3.3: Event bus — bắn webhook ra ngoài + chạy rule tự động IF/THEN
// Gọi từ API sau mỗi create/update/delete. Automation lỗi thì nuốt lỗi,
// KHÔNG được làm hỏng request chính.
// ============================================================
import crypto from 'crypto';
import { prisma } from './prisma';
import { rolesOf } from './perm';

/* ---------------- v3.5: Thông báo trong app (chuông) ---------------- */
export async function notify(userIds, text, route) {
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
  if (!ids.length) return;
  await prisma.notification.createMany({
    data: ids.map(userId => ({ userId, text, route: route || null })),
  }).catch(() => {});
}

// Người đang giữ vai trò (kể cả Giám đốc — duyệt được mọi bước)
export async function usersWithRole(role) {
  const users = await prisma.user.findMany({ where: { status: 'active' } });
  return users.filter(u => { const r = rolesOf(u); return r.includes(role) || r.includes('DIRECTOR'); });
}

const parse = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
// Điền template: {field} lấy giá trị từ bản ghi
const fill = (tpl, row) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => row?.[k] ?? '');
const daysFromNow = n => { const d = new Date(); d.setDate(d.getDate() + n); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };

/* ---------------- Điều kiện IF ---------------- */
const OPS = {
  '=': (a, b) => String(a ?? '') === String(b),
  '!=': (a, b) => String(a ?? '') !== String(b),
  '>': (a, b) => +a > +b,
  '>=': (a, b) => +a >= +b,
  '<': (a, b) => +a < +b,
  '<=': (a, b) => +a <= +b,
  contains: (a, b) => String(a ?? '').toLowerCase().includes(String(b ?? '').toLowerCase()),
};
function matches(conds, row, old) {
  return conds.every(c => {
    const v = row?.[c.field];
    if (c.op === 'changed') return old ? String(old[c.field] ?? '') !== String(v ?? '') : true;
    return OPS[c.op] ? OPS[c.op](v, c.value) : false;
  });
}

/* ---------------- Hành động THEN ---------------- */
async function runAction(a, row, user, rule) {
  if (a.type === 'chat') { // nhắn vào kênh chung
    const conv = await prisma.conversation.findFirst({ where: { type: 'general' } });
    if (conv) await prisma.message.create({
      data: { convId: conv.id, senderId: user?.id || 'system', content: `🤖 [${rule.name}] ${fill(a.template, row)}` },
    });
  }
  if (a.type === 'task') { // tạo công việc
    await prisma.task.create({
      data: {
        title: fill(a.title, row), assigneeId: a.assigneeId || null,
        priority: a.priority || 'medium',
        dueDate: a.dueDays !== undefined && a.dueDays !== '' ? daysFromNow(+a.dueDays) : null,
        note: `Tạo tự động bởi rule "${rule.name}"`,
      },
    });
  }
  if (a.type === 'webhook' && a.url) { // gọi thẳng 1 URL
    await deliver(a.url, null, `rule.${rule.id}`, { rule: rule.name, data: row });
  }
}

/* ---------------- Gửi 1 webhook (timeout 5s, ký HMAC nếu có secret) ---------------- */
async function deliver(url, secret, eventName, payload) {
  const body = JSON.stringify({ event: eventName, at: new Date().toISOString(), ...payload });
  const headers = { 'Content-Type': 'application/json', 'X-Event': eventName };
  if (secret) headers['X-Signature'] = crypto.createHmac('sha256', secret).update(body).digest('hex');
  try {
    const res = await fetch(url, { method: 'POST', headers, body, signal: AbortSignal.timeout(5000) });
    return String(res.status);
  } catch (e) {
    return 'lỗi: ' + String(e.message || e).slice(0, 100);
  }
}

async function fireWebhooks(resource, eventName, payload) {
  const hooks = await prisma.webhook.findMany({ where: { active: true } });
  const match = hooks.filter(h => {
    const evs = parse(h.events);
    return evs.includes('*') || evs.includes(eventName) || evs.includes(resource + '.*');
  });
  await Promise.allSettled(match.map(async h => {
    const status = await deliver(h.url, h.secret, eventName, payload);
    await prisma.webhook.update({ where: { id: h.id }, data: { lastStatus: `${status} · ${new Date().toLocaleString('vi-VN')}` } }).catch(() => {});
  }));
}

async function runRules(resource, event, row, old, user) {
  const rules = await prisma.rule.findMany({ where: { active: true, resource } });
  for (const r of rules.filter(x => x.event === 'any' || x.event === event)) {
    if (!matches(parse(r.conditions), row, old)) continue;
    for (const a of parse(r.actions)) {
      try { await runAction(a, row, user, r); } catch {}
    }
    await prisma.auditLog.create({
      data: { userId: user?.id || 'system', userName: user?.name || 'hệ thống', action: 'rule', entity: resource, refId: row?.id || null, detail: `Rule "${r.name}" đã chạy` },
    }).catch(() => {});
  }
}

/* ---------------- v3.5: automation hệ thống (cố định, không cần rule) ---------------- */
const ONBOARD_ITEMS = [
  'Ký hợp đồng lao động + nhận hồ sơ',
  'Tạo tài khoản ERP + email công ty',
  'Chuẩn bị laptop / thiết bị làm việc',
  'Thêm vào Kênh chung + nhóm làm việc',
  'Giới thiệu team + chỉ định người hướng dẫn',
  'Hướng dẫn chấm công, nghỉ phép, quy trình nội bộ',
];

async function systemAutomations(resource, event, row, old, user) {
  // Ứng viên chuyển "Nhận việc" → tự tạo checklist onboarding + báo HR
  if (resource === 'candidates' && event === 'update' && row?.stage === 'hired' && old?.stage !== 'hired') {
    await prisma.onboarding.create({
      data: {
        name: row.name, candidateId: row.id, position: row.position || null,
        items: JSON.stringify(ONBOARD_ITEMS.map(text => ({ text, done: false }))),
      },
    });
    const hrs = await usersWithRole('HR');
    await notify(hrs.map(u => u.id).filter(id => id !== user?.id),
      `🎉 ${row.name} nhận việc${row.position ? ' (' + row.position + ')' : ''} — checklist onboarding đã tạo sẵn`, '/recruitment');
  }
  // Gán việc → báo người được gán (trừ khi tự gán cho mình)
  if (resource === 'tasks' && row?.assigneeId && row.assigneeId !== user?.id
    && (event === 'create' || (event === 'update' && old?.assigneeId !== row.assigneeId))) {
    await notify(row.assigneeId, `Bạn được gán việc: ${row.title}`, '/tasks');
  }
  // Ticket khẩn được gán → báo người xử lý
  if (resource === 'tickets' && row?.assigneeId && row.assigneeId !== user?.id
    && (event === 'create' || (event === 'update' && old?.assigneeId !== row.assigneeId))) {
    await notify(row.assigneeId, `Bạn được giao ticket ${row.code}: ${row.title}`, '/tickets');
  }
  // v3.7: bình luận trên việc → báo người phụ trách việc đó
  if (resource === 'taskcomments' && event === 'create' && row?.taskId) {
    const task = await prisma.task.findUnique({ where: { id: row.taskId } });
    if (task?.assigneeId && task.assigneeId !== user?.id) {
      await notify(task.assigneeId, `${user?.name || 'Ai đó'} bình luận việc "${task.title}": ${String(row.content).slice(0, 60)}`, '/tasks');
    }
  }
  // v3.7: việc định kỳ hoàn thành → tự tạo kỳ sau
  if (resource === 'tasks' && event === 'update' && row?.recur && row.status === 'done' && old?.status !== 'done') {
    const days = row.recur === 'weekly' ? 7 : 30;
    const base = row.dueDate ? new Date(row.dueDate + 'T00:00:00') : new Date();
    base.setDate(base.getDate() + days);
    const nextDue = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}-${String(base.getDate()).padStart(2, '0')}`;
    await prisma.task.create({
      data: {
        title: row.title, projectId: row.projectId, assigneeId: row.assigneeId,
        priority: row.priority, status: 'todo', dueDate: nextDue, recur: row.recur,
        note: row.note, checklist: JSON.stringify(JSON.parse(row.checklist || '[]').map(c => ({ ...c, done: false }))),
      },
    });
    if (row.assigneeId) await notify(row.assigneeId, `Việc định kỳ "${row.title}" đã tạo kỳ tiếp theo (hạn ${nextDue})`, '/tasks');
  }

  // v3.10: lịch sử công việc — ghi lại thay đổi quan trọng
  if (resource === 'tasks' && row?.id) {
    const S = { todo: 'Cần làm', doing: 'Đang làm', review: 'Chờ duyệt', done: 'Hoàn thành' };
    const P = { low: 'Thấp', medium: 'Trung bình', high: 'Cao' };
    const events = [];
    if (event === 'create') events.push('Tạo việc');
    else if (event === 'update' && old) {
      if (old.status !== row.status) events.push(`Trạng thái: ${S[old.status] || old.status} → ${S[row.status] || row.status}`);
      if (old.assigneeId !== row.assigneeId) events.push('Đổi người phụ trách');
      if (old.dueDate !== row.dueDate) events.push(`Đổi hạn: ${old.dueDate || '—'} → ${row.dueDate || '—'}`);
      if (old.priority !== row.priority) events.push(`Ưu tiên: ${P[old.priority] || old.priority} → ${P[row.priority] || row.priority}`);
      if (old.phaseId !== row.phaseId) events.push('Chuyển giai đoạn');
    }
    for (const text of events) {
      await prisma.taskEvent.create({ data: { taskId: row.id, userId: user?.id || null, userName: user?.name || 'hệ thống', text } }).catch(() => {});
    }
  }

  // v3.10: tiến độ dự án tự động — tính lại khi task thay đổi
  if (resource === 'tasks' && row?.projectId) {
    const proj = await prisma.project.findUnique({ where: { id: row.projectId } }).catch(() => null);
    if (proj?.autoProgress) {
      const pt = await prisma.task.findMany({ where: { projectId: proj.id } });
      const totalEst = pt.reduce((s, t) => s + (t.estHours || 0), 0);
      let pct;
      if (totalEst > 0) pct = Math.round(pt.filter(t => t.status === 'done').reduce((s, t) => s + (t.estHours || 0), 0) / totalEst * 100);
      else pct = pt.length ? Math.round(pt.filter(t => t.status === 'done').length / pt.length * 100) : 0;
      if (pct !== proj.progress) await prisma.project.update({ where: { id: proj.id }, data: { progress: pct } }).catch(() => {});
    }
  }
}

/* ---------------- Điểm vào duy nhất ---------------- */
// Không await ở nơi gọi cũng an toàn: mọi lỗi đều được nuốt tại đây.
export async function emitEvent(resource, event, row, old, user) {
  try {
    await systemAutomations(resource, event, row, old, user);
    await runRules(resource, event, row, old, user); // rule chạy trước webhook (nhanh, DB local)
    await fireWebhooks(resource, `${resource}.${event}`, { resource, data: row, by: user?.name || 'api' });
  } catch {}
}
