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
async function systemAutomations(resource, event, row, old, user) {
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
