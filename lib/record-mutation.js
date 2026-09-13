import { enqueueEvent } from './event-outbox.js';

function conflict() {
  const error = new Error('Bản ghi vừa thay đổi. Hãy tải lại trước khi lưu hoặc xóa.');
  error.code = 'record_write_conflict'; error.status = 409;
  return error;
}

// Every committed generic mutation has its audit and delivery intent in the same
// transaction. Approval interception uses this transaction too, including its after hook.
export async function commitRecordMutation(db, { resource, event, cfg, row = null, data, user, interceptWrite }) {
  return db.$transaction(async tx => {
    // Session ERP and API-key edits both expire existing Team Work snapshots.
    // Registry strips client-owned execution metadata before this shared boundary.
    if (resource === 'tasks' && event === 'update') {
      data = { ...data, workVersion: { increment: 1 } };
      if (Object.hasOwn(data, 'status')) {
        if (data.status !== 'blocked') { data.blockReason = null; data.blockedAt = null; }
        if (data.status !== 'waiting') data.waitingReason = null;
        data.completedAt = data.status === 'done' ? new Date() : null;
      }
    }
    const interception = event !== 'delete' && interceptWrite
      ? await interceptWrite(resource, row, data, user, { db: tx }) : null;
    if (interception?.block) return { blocked: true, notice: interception.block, row: null };
    const patch = interception?.data || data;
    let changed;
    if (event === 'create') changed = await tx[cfg.model].create({ data: patch });
    else if (event === 'update') {
      if (cfg.writeWhere) {
        if ((await tx[cfg.model].updateMany({ where: cfg.writeWhere(row), data: patch })).count !== 1) throw conflict();
        changed = await tx[cfg.model].findUnique({ where: { id: row.id } });
      } else changed = await tx[cfg.model].update({ where: { id: row.id }, data: patch });
    } else if (event === 'delete') {
      if (cfg.writeWhere) {
        if ((await tx[cfg.model].deleteMany({ where: cfg.writeWhere(row) })).count !== 1) throw conflict();
      } else await tx[cfg.model].delete({ where: { id: row.id } });
      changed = row;
    } else throw new Error('Unsupported record mutation');
    const notice = interception?.after ? await interception.after(changed) : null;
    if (interception?.after) changed = await tx[cfg.model].findUnique({ where: { id: changed.id } });
    await tx.auditLog.create({ data: {
      userId: user.id, userName: user.name, action: event, entity: resource, refId: changed.id || null,
      detail: changed.name || changed.title || changed.code || null,
    } });
    await enqueueEvent(tx, { resource, event, row: changed, old: event === 'update' ? row : null, user });
    return { row: changed, notice, blocked: false };
  });
}
