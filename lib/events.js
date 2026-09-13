// ============================================================
// v3.3: Event bus — bắn webhook ra ngoài + chạy rule tự động IF/THEN
// Legacy emitEvent remains best-effort after commit. Converted commands instead
// enqueueEvent(tx, ...) atomically; the outbox worker uses processDurableEvent.
// ============================================================
import crypto from 'crypto';
import { prisma } from './prisma.js';
import { rolesOf } from './perm.js';
import { publishRealmChange, safelyPublishRealmChange } from './realm-change-feed.js';
import { normalizeNotificationDraft, notificationRecordRoute } from './notification-inbox.js';
import { awardGoldForTask } from './gold-earning-admin.js';
import { enqueueWebhook, OutboxError, outboxErrorCode } from './event-outbox.js';

/* ---------------- v3.5: Thông báo trong app (chuông) ---------------- */
export async function notify(userIds, text, route, options = {}) {
  const db = options.db || prisma;
  const ids = [...new Set((Array.isArray(userIds) ? userIds : [userIds]).filter(Boolean))];
  if (!ids.length) return;
  try {
    const notification = normalizeNotificationDraft(text, route);
    await db.notification.createMany({
      data: ids.map(userId => ({ userId, ...notification })),
    });
    const publish = options.db ? publishRealmChange : safelyPublishRealmChange;
    await Promise.all(ids.map(audienceUserId => publish(db, {
      resource: 'notifications', action: 'create', audienceUserId,
    })));
  } catch (error) {
    if (options.db) throw error; // Explicit transaction: notification + receipt must commit together.
  }
}

// Người đang giữ vai trò (kể cả Giám đốc — duyệt được mọi bước)
export async function usersWithRole(role, { db = prisma } = {}) {
  const users = await db.user.findMany({ where: { status: 'active' } });
  return users.filter(u => { const r = rolesOf(u); return r.includes(role) || r.includes('DIRECTOR'); });
}

const parse = s => { try { return JSON.parse(s || '[]'); } catch { return []; } };
// Điền template: {field} lấy giá trị từ bản ghi
const fill = (tpl, row) => String(tpl || '').replace(/\{(\w+)\}/g, (_, k) => row?.[k] ?? '');
const daysFromNow = (n, now = new Date()) => { const d = new Date(now); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

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
async function runAction(a, row, user, rule, ctx = {}) {
  const db = ctx.db || prisma;
  if (a.type === 'chat') { // nhắn vào kênh chung
    const conv = await db.conversation.findFirst({ where: { type: 'general' } });
    if (conv) await db.message.create({
      data: { convId: conv.id, senderId: user?.id || 'system', content: `🤖 [${rule.name}] ${fill(a.template, row)}` },
    });
  }
  if (a.type === 'task') { // tạo công việc
    await db.task.create({
      data: {
        title: fill(a.title, row), assigneeId: a.assigneeId || null,
        priority: a.priority || 'medium',
        dueDate: a.dueDays !== undefined && a.dueDays !== '' ? daysFromNow(+a.dueDays, ctx.now) : null,
        note: `Tạo tự động bởi rule "${rule.name}"`,
      },
    });
  }
  if (a.type === 'webhook' && a.url) { // gọi thẳng 1 URL
    if (ctx.job) {
      await enqueueWebhook(db, ctx.job, {
        deliveryKey: `rule:${rule.id}:${ctx.actionIndex}`, url: a.url, eventName: `rule.${rule.id}`,
        body: JSON.stringify({ event: `rule.${rule.id}`, at: ctx.now.toISOString(), rule: rule.name, data: row }),
      });
    } else await deliver(a.url, null, `rule.${rule.id}`, { rule: rule.name, data: row });
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
    return outboxErrorCode(e);
  }
}

async function fireWebhooks(resource, eventName, payload, ctx = {}) {
  const db = ctx.db || prisma;
  const hooks = await db.webhook.findMany({ where: { active: true } });
  const match = hooks.filter(h => {
    const evs = parse(h.events);
    return evs.includes('*') || evs.includes(eventName) || evs.includes(resource + '.*');
  });
  if (ctx.job) {
    for (const h of match) await enqueueWebhook(db, ctx.job, {
      deliveryKey: `webhook:${h.id}`, hookId: h.id, url: h.url, eventName,
      body: JSON.stringify({ event: eventName, at: ctx.now.toISOString(), ...payload }),
    });
    return;
  }
  await Promise.allSettled(match.map(async h => {
    const status = await deliver(h.url, h.secret, eventName, payload);
    await db.webhook.update({ where: { id: h.id }, data: { lastStatus: `${status} · ${new Date().toLocaleString('vi-VN')}` } }).catch(() => {});
  }));
}

async function runRules(resource, event, row, old, user, ctx = {}) {
  const db = ctx.db || prisma;
  const rules = await db.rule.findMany({ where: { active: true, resource } });
  for (const r of rules.filter(x => x.event === 'any' || x.event === event)) {
    if (!matches(parse(r.conditions), row, old)) continue;
    for (const [actionIndex, a] of parse(r.actions).entries()) {
      try { await runAction(a, row, user, r, { ...ctx, actionIndex }); } catch (error) { if (ctx.db) throw error; }
    }
    await db.auditLog.create({
      data: { userId: user?.id || 'system', userName: user?.name || 'hệ thống', action: 'rule', entity: resource, refId: row?.id || null, detail: `Rule "${r.name}" ${ctx.job ? 'đã xử lý nội bộ; webhook được xếp hàng riêng' : 'đã chạy'}` },
    }).catch(error => { if (ctx.db) throw error; });
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

async function systemAutomations(resource, event, row, old, user, ctx = {}) {
  const db = ctx.db || prisma;
  const now = ctx.now || new Date();
  const sendNotification = (ids, text, route) => notify(ids, text, route, ctx.db ? { db } : {});
  // Ứng viên chuyển "Nhận việc" → tự tạo checklist onboarding + báo HR
  if (resource === 'candidates' && event === 'update' && row?.stage === 'hired' && old?.stage !== 'hired') {
    await db.onboarding.create({
      data: {
        name: row.name, candidateId: row.id, position: row.position || null,
        items: JSON.stringify(ONBOARD_ITEMS.map(text => ({ text, done: false }))),
      },
    });
    const hrs = await usersWithRole('HR', { db });
    await sendNotification(hrs.map(u => u.id).filter(id => id !== user?.id),
      `🎉 ${row.name} nhận việc${row.position ? ' (' + row.position + ')' : ''} — checklist onboarding đã tạo sẵn`, '/recruitment');
  }
  // Gán việc → báo người được gán (trừ khi tự gán cho mình)
  if (resource === 'tasks' && row?.assigneeId && row.assigneeId !== user?.id
    && (event === 'create' || (event === 'update' && old?.assigneeId !== row.assigneeId))) {
    await sendNotification(row.assigneeId, `Bạn được gán việc: ${row.title}`, notificationRecordRoute('tasks', row.id));
  }
  // v3.41 (Chương 2): việc xong ĐÚNG HẠN → tự cộng Gold cho người làm. Không bao giờ chặn
  // luồng nghiệp vụ: lỗi Gold chỉ ghi log, việc vẫn hoàn thành bình thường.
  if (resource === 'tasks' && event === 'update' && row?.status === 'done' && old?.status !== 'done') {
    try {
      const result = await awardGoldForTask(row, old, { db, now });
      if (result?.awarded) {
        await sendNotification(row.assigneeId, `⭐ +${result.awarded} Gold — hoàn thành đúng hạn: ${row.title}`, '/realm');
      }
    } catch (error) { if (ctx.db) throw error; console.error('gold_award_task_failed', outboxErrorCode(error)); }
  }
  // Ticket khẩn được gán → báo người xử lý
  if (resource === 'tickets' && row?.assigneeId && row.assigneeId !== user?.id
    && (event === 'create' || (event === 'update' && old?.assigneeId !== row.assigneeId))) {
    await sendNotification(row.assigneeId, `Bạn được giao ticket ${row.code}: ${row.title}`, notificationRecordRoute('tickets', row.id));
  }
  // v3.7: bình luận trên việc → báo người phụ trách việc đó + v3.12: @mention
  if (resource === 'taskcomments' && event === 'create' && row?.taskId) {
    const task = await db.task.findUnique({ where: { id: row.taskId } });
    if (task?.assigneeId && task.assigneeId !== user?.id) {
      await sendNotification(task.assigneeId, `${user?.name || 'Ai đó'} bình luận việc "${task.title}": ${String(row.content).slice(0, 60)}`, notificationRecordRoute('tasks', task.id));
    }
    // v3.12: @tên → nhắc người được nhắc (bỏ dấu tiếng Việt khi so khớp)
    const strip = s => s.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase();
    const mentions = String(row.content).match(/@([^\s@,.:;!?]{2,})/g);
    if (mentions) {
      const all = await db.user.findMany({ where: { status: 'active' }, select: { id: true, name: true } });
      const hit = new Set();
      for (const mraw of mentions) {
        const token = strip(mraw.slice(1));
        all.forEach(u => {
          const nm = strip(u.name);
          if (nm.replace(/\s+/g, '').includes(token) || nm.split(/\s+/).some(w => w.startsWith(token))) hit.add(u.id);
        });
      }
      const targets = [...hit].filter(id => id !== user?.id && id !== task?.assigneeId);
      if (targets.length) await sendNotification(targets, `${user?.name || 'Ai đó'} nhắc bạn trong việc "${task?.title || ''}": ${String(row.content).slice(0, 60)}`, notificationRecordRoute('tasks', task?.id));
    }
  }
  // Phase 6: Director/AM tạo lịch chăm sóc từ Royal Embassy thì người đang
  // phụ trách Lead trên ERP nguyên bản cũng nhận được tín hiệu ngay.
  if (resource === 'activities' && event === 'create' && row?.refType === 'lead' && row?.refId) {
    const lead = await db.lead.findUnique({ where: { id: row.refId }, select: { ownerId: true, company: true, name: true } });
    if (lead?.ownerId && lead.ownerId !== user?.id) {
      await sendNotification(lead.ownerId, `${user?.name || 'Ai đó'} lên lịch follow-up “${String(row.title || '').slice(0, 60)}” cho ${lead.company || lead.name || 'Lead'}`, notificationRecordRoute('leads', row.refId));
    }
  }
  // v3.12: tuổi việc — set statusSince khi tạo hoặc đổi trạng thái
  if (resource === 'tasks' && (event === 'create' || (event === 'update' && old && old.status !== row.status))) {
    const today = now.toISOString().slice(0, 10);
    if (row.statusSince !== today) {
      // A delayed occurrence must not overwrite a more recent status transition.
      const where = ctx.db ? { id: row.id, status: row.status, ...(row.updatedAt ? { updatedAt: new Date(row.updatedAt) } : {}) } : { id: row.id };
      const update = ctx.db ? db.task.updateMany({ where, data: { statusSince: today } }) : db.task.update({ where, data: { statusSince: today } });
      await update.catch(error => { if (ctx.db) throw error; });
    }
  }
  // v3.7: việc định kỳ hoàn thành → tự tạo kỳ sau
  if (resource === 'tasks' && event === 'update' && row?.recur && row.status === 'done' && old?.status !== 'done') {
    const days = row.recur === 'weekly' ? 7 : 30;
    const base = row.dueDate ? new Date(row.dueDate + 'T00:00:00Z') : new Date(now);
    base.setUTCDate(base.getUTCDate() + days);
    const nextDue = base.toISOString().slice(0, 10);
    const nextTask = await db.task.create({
      data: {
        title: row.title, projectId: row.projectId, assigneeId: row.assigneeId,
        priority: row.priority, status: 'todo', dueDate: nextDue, recur: row.recur,
        note: row.note, checklist: JSON.stringify(JSON.parse(row.checklist || '[]').map(c => ({ ...c, done: false }))),
      },
    });
    if (row.assigneeId) await sendNotification(row.assigneeId, `Việc định kỳ "${row.title}" đã tạo kỳ tiếp theo (hạn ${nextDue})`, notificationRecordRoute('tasks', nextTask.id));
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
      await db.taskEvent.create({ data: { taskId: row.id, userId: user?.id || null, userName: user?.name || 'hệ thống', text } }).catch(error => { if (ctx.db) throw error; });
    }
  }

  // v3.10: tiến độ dự án tự động — tính lại khi task thay đổi
  if (resource === 'tasks' && row?.projectId) {
    const proj = await db.project.findUnique({ where: { id: row.projectId } }).catch(error => { if (ctx.db) throw error; return null; });
    if (proj?.autoProgress) {
      const pt = await db.task.findMany({ where: { projectId: proj.id } });
      const totalEst = pt.reduce((s, t) => s + (t.estHours || 0), 0);
      let pct;
      if (totalEst > 0) pct = Math.round(pt.filter(t => t.status === 'done').reduce((s, t) => s + (t.estHours || 0), 0) / totalEst * 100);
      else pct = pt.length ? Math.round(pt.filter(t => t.status === 'done').length / pt.length * 100) : 0;
      if (pct !== proj.progress) await db.project.update({ where: { id: proj.id }, data: { progress: pct } }).catch(error => { if (ctx.db) throw error; });
    }
  }
}

/* ---------------- Điểm vào duy nhất ---------------- */
// Không await ở nơi gọi cũng an toàn: mọi lỗi đều được nuốt tại đây — automation hỏng
// KHÔNG được làm hỏng thao tác chính của người dùng.
//
// v3.13: nhưng "nuốt" không có nghĩa là "giấu". Trước đây `catch {}` trống trơn: việc lặp
// không sinh kỳ sau, tiến độ dự án đứng im, checklist onboarding không tạo, webhook không
// bắn — người dùng vẫn thấy "Đã lưu" và không ai biết gì cho tới khi phát hiện thiếu dữ liệu
// vài ngày sau. Nay mỗi nhánh tự bắt lỗi riêng (một nhánh hỏng không chặn nhánh sau) và
// ghi vào Nhật ký hệ thống để Giám đốc còn nhìn thấy.
async function step(name, fn, resource, row, user) {
  try {
    await fn();
  } catch (e) {
    const errorCode = outboxErrorCode(e);
    console.error(`[automation] ${name} lỗi khi ${resource}:`, errorCode);
    await prisma.auditLog.create({
      data: {
        userId: user?.id || 'system', userName: user?.name || 'hệ thống',
        action: 'automation_error', entity: resource, refId: row?.id || null,
        detail: `Tự động hóa "${name}" lỗi: ${errorCode}`,
      },
    }).catch(() => {}); // ghi nhật ký mà cũng hỏng thì đành chịu, không được nổ tiếp
  }
}

export async function emitEvent(resource, event, row, old, user) {
  await step('Realm change feed', () => publishRealmChange(prisma, {
    resource,
    action: event,
    entityId: row?.id,
    actorId: user?.id,
  }), resource, row, user);
  await step('automation hệ thống', () => systemAutomations(resource, event, row, old, user), resource, row, user);
  await step('rule tự động', () => runRules(resource, event, row, old, user), resource, row, user); // rule trước webhook (nhanh, DB local)
  await step('webhook', () => fireWebhooks(resource, `${resource}.${event}`, { resource, data: row, by: user?.name || 'api' }), resource, row, user);
}

/** Durable worker entry point. Every local write uses tx and propagates failure;
 * the outbox processor commits these effects, HTTP fanout and its receipt together.
 * Rules/webhook subscriptions are resolved when this transaction first succeeds.
 * No recursive event emission for generated tasks, matching the legacy behavior. */
export async function processDurableEvent(tx, payload, job) {
  const { resource, event, row, old, user } = payload;
  const ctx = { db: tx, now: new Date(job.createdAt), job };
  // Feed cursors use publication time: a delayed occurrence must still appear
  // after a client's current cursor. Business dates below use occurrence time.
  await publishRealmChange(tx, { resource, action: event, entityId: row?.id, actorId: user?.id });
  await systemAutomations(resource, event, row, old, user, ctx);
  await runRules(resource, event, row, old, user, ctx);
  await fireWebhooks(resource, `${resource}.${event}`, { resource, data: row, by: user?.name || 'api' }, ctx);
}

/** HTTP acknowledgement is not a distributed transaction. Receivers must persist
 * X-Delivery-Id before applying effects and return success for an already-seen ID. */
export async function sendDurableWebhook(db, payload, job, { fetchImpl = fetch } = {}) {
  let url;
  try { url = new URL(payload.url); } catch { throw new OutboxError('OUTBOX_INVALID_URL', { permanent: true }); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new OutboxError('OUTBOX_INVALID_URL', { permanent: true });
  let secret = null;
  if (payload.hookId) {
    const hook = await db.webhook.findUnique({ where: { id: payload.hookId } });
    if (!hook?.active) throw new OutboxError('OUTBOX_TARGET_DISABLED', { permanent: true });
    if (hook.url !== payload.url) throw new OutboxError('OUTBOX_TARGET_CHANGED', { permanent: true });
    secret = hook.secret;
  }
  const headers = {
    'Content-Type': 'application/json', 'X-Event': payload.eventName,
    'X-Event-Id': job.occurrenceId, 'X-Delivery-Id': job.id,
    'X-Payload-Version': String(job.payloadVersion),
  };
  if (secret) headers['X-Signature'] = crypto.createHmac('sha256', secret).update(payload.body).digest('hex');
  const response = await fetchImpl(url.href, { method: 'POST', headers, body: payload.body, redirect: 'error', signal: AbortSignal.timeout(5000) });
  // Release response resources without retaining/logging a potentially sensitive body.
  await response.body?.cancel?.();
  if (!response.ok) {
    const permanent = response.status >= 400 && response.status < 500 && ![408, 425, 429].includes(response.status);
    throw new OutboxError(`HTTP_${response.status}`, { permanent });
  }
  if (payload.hookId) await db.webhook.update({ where: { id: payload.hookId }, data: { lastStatus: `${response.status} · ${new Date().toISOString()}` } }).catch(() => {});
}
