import { rolesOf } from './perm.js';
import { RealmOperationError } from './realm-erp-adapter.js';
import { realmLoadoutSourceId } from './realm-inventory.js';
import {
  normalizeRealmRedemptionRequest,
  parseRealmRedemptionApproval,
  realmTreasuryItem,
  serializeRealmTreasuryDashboard,
} from './realm-treasury.js';

function requireRedemptionEntry(entry, userId, item, expectedType) {
  if (!entry || entry.userId !== userId || entry.type !== expectedType) {
    throw new RealmOperationError('Idempotency key đã được dùng cho thao tác khác.', 409, 'idempotency_conflict');
  }
  if (expectedType === 'shop_spend' && (entry.sourceType !== 'shop' || entry.sourceId !== item.id)) {
    throw new RealmOperationError('Idempotency key đã được dùng cho vật phẩm khác.', 409, 'idempotency_conflict');
  }
  return entry;
}

function requireLoadoutEntry(entry, userId, item, idempotencyKey) {
  if (
    !entry
    || entry.userId !== userId
    || entry.type !== 'loadout_equip'
    || entry.amount !== 0
    || entry.sourceType !== 'loadout'
    || entry.sourceId !== realmLoadoutSourceId(item, idempotencyKey)
  ) {
    throw new RealmOperationError('Idempotency key đã được dùng cho thao tác khác.', 409, 'idempotency_conflict');
  }
  return entry;
}

function checkerSteps(user, item) {
  const roles = rolesOf(user);
  if (roles.includes(item.approvalRole)) return [{ role: 'DIRECTOR', label: 'Director checker' }];
  return [{ role: item.approvalRole || 'HR', label: 'HR checker' }];
}

export async function loadRealmTreasuryDashboard(db, user) {
  const roles = rolesOf(user);
  const canFulfill = roles.includes('DIRECTOR') || roles.includes('HR');
  const [walletTotal, entries, approvals, keeperApprovalsRaw] = await Promise.all([
    db.realmGoldEntry.aggregate({
      where: { userId: user.id },
      _sum: { amount: true },
    }),
    db.realmGoldEntry.findMany({
      where: {
        userId: user.id,
        OR: [
          { type: 'shop_spend', sourceType: 'shop' },
          { type: 'loadout_equip', sourceType: 'loadout' },
        ],
      },
      select: { id: true, type: true, amount: true, sourceType: true, sourceId: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    }),
    db.approval.findMany({
      where: { requesterId: user.id, type: 'realm_redemption' },
      orderBy: { createdAt: 'desc' },
      take: 50,
    }),
    canFulfill ? db.approval.findMany({
      where: { type: 'realm_redemption', status: 'approved', requesterId: { not: user.id } },
      orderBy: { decidedAt: 'asc' },
      take: 50,
    }) : Promise.resolve([]),
  ]);
  const keeperApprovals = keeperApprovalsRaw.filter((approval) => {
    if (approval.requesterId === user.id) return false;
    const request = parseRealmRedemptionApproval(approval);
    const item = request ? realmTreasuryItem(request.itemId) : null;
    return Boolean(item && (roles.includes('DIRECTOR') || roles.includes(item.approvalRole || 'HR')));
  });
  const approvalIds = [...new Set([...approvals, ...keeperApprovals].map((approval) => approval.id).filter(Boolean))];
  const fulfillmentEntries = approvalIds.length ? await db.realmGoldEntry.findMany({
    where: { type: 'redemption_fulfillment', sourceType: 'approval', sourceId: { in: approvalIds } },
    select: { id: true, type: true, sourceType: true, sourceId: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  }) : [];
  return serializeRealmTreasuryDashboard({
    source: 'erp',
    wallet: Number(walletTotal?._sum?.amount || 0),
    entries,
    approvals,
    keeperApprovals,
    fulfillmentEntries,
    actor: { id: user.id, name: user.name, roleLabel: rolesOf(user).join(' + ') },
    permissions: { canRedeem: true, canDemoReview: false, canDemoFulfill: false, canFulfill },
  });
}

async function existingRedemption(tx, user, item, idempotencyKey) {
  const existing = await tx.realmGoldEntry.findUnique({ where: { idempotencyKey } });
  if (!existing) return null;
  requireRedemptionEntry(existing, user.id, item, item.kind === 'cosmetic' ? 'shop_spend' : 'redemption_hold');
  if (item.kind === 'cosmetic') return { type: 'fulfilled', entry: existing, approval: null, idempotent: true };
  const approval = await tx.approval.findFirst({ where: { type: 'realm_redemption', refId: existing.id, requesterId: user.id } });
  if (!approval) throw new RealmOperationError('Yêu cầu giữ Gold thiếu approval tương ứng.', 409, 'treasury_approval_missing');
  const request = parseRealmRedemptionApproval(approval);
  if (!request || request.itemId !== item.id) {
    throw new RealmOperationError('Idempotency key đã được dùng cho quyền lợi khác.', 409, 'idempotency_conflict');
  }
  return { type: 'pending', entry: existing, approval, idempotent: true };
}

async function requestRedemptionTx(tx, user, item, idempotencyKey, now) {
  const retry = await existingRedemption(tx, user, item, idempotencyKey);
  if (retry) return retry;
  const total = await tx.realmGoldEntry.aggregate({ where: { userId: user.id }, _sum: { amount: true } });
  const wallet = Number(total?._sum?.amount || 0);
  if (wallet < item.price) throw new RealmOperationError('Ví Gold không đủ cho yêu cầu này.', 409, 'treasury_insufficient_gold');

  if (item.kind === 'cosmetic') {
    const owned = await tx.realmGoldEntry.findFirst({
      where: { userId: user.id, type: 'shop_spend', sourceType: 'shop', sourceId: item.id },
    });
    if (owned) throw new RealmOperationError('Vật phẩm cosmetic này đã được mở khóa.', 409, 'treasury_item_owned');
    const entry = await tx.realmGoldEntry.create({
      data: {
        userId: user.id,
        type: 'shop_spend',
        amount: -item.price,
        renown: 0,
        label: `Đổi tại Tavern: ${item.name}`,
        sourceType: 'shop',
        sourceId: item.id,
        idempotencyKey,
      },
    });
    await tx.auditLog.create({
      data: { userId: user.id, userName: user.name, action: 'realm_treasury_redeem', entity: 'realm_gold', refId: entry.id, detail: `${item.name} · -${item.price} Gold` },
    });
    return { type: 'fulfilled', entry, approval: null, idempotent: false };
  }

  const pending = await tx.approval.findMany({
    where: { requesterId: user.id, type: 'realm_redemption', status: 'pending' },
    orderBy: { createdAt: 'desc' },
    take: 30,
  });
  if (pending.map(parseRealmRedemptionApproval).filter(Boolean).some((request) => request.itemId === item.id)) {
    throw new RealmOperationError('Quyền lợi này đã có yêu cầu chờ duyệt.', 409, 'treasury_request_pending');
  }
  const hold = await tx.realmGoldEntry.create({
    data: {
      userId: user.id,
      type: 'redemption_hold',
      amount: -item.price,
      renown: 0,
      label: `Giữ Gold chờ duyệt: ${item.name}`,
      sourceType: 'treasury_request',
      sourceId: idempotencyKey,
      idempotencyKey,
    },
  });
  const steps = checkerSteps(user, item).map((step) => ({ ...step, status: 'pending' }));
  const approval = await tx.approval.create({
    data: {
      type: 'realm_redemption',
      refId: hold.id,
      title: `Tavern · Duyệt đổi ${item.name} · ${item.price} Gold`,
      amount: item.price,
      payload: JSON.stringify({ version: 1, itemId: item.id, price: item.price, requesterId: user.id, holdEntryId: hold.id }),
      requesterId: user.id,
      requesterName: user.name,
      steps: JSON.stringify(steps),
      status: 'pending',
      createdAt: now,
    },
  });
  await tx.auditLog.create({
    data: { userId: user.id, userName: user.name, action: 'realm_treasury_request', entity: 'approvals', refId: approval.id, detail: `${item.name} · giữ ${item.price} Gold` },
  });
  return { type: 'pending', entry: hold, approval, idempotent: false };
}

export async function requestRealmTreasuryRedemption(db, user, input, now = new Date()) {
  const { item, idempotencyKey } = normalizeRealmRedemptionRequest(input);
  try {
    return await db.$transaction(
      (tx) => requestRedemptionTx(tx, user, item, idempotencyKey, now),
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    if (error?.code === 'P2002') {
      const existing = await db.realmGoldEntry.findUnique({ where: { idempotencyKey } });
      if (existing) {
        requireRedemptionEntry(existing, user.id, item, item.kind === 'cosmetic' ? 'shop_spend' : 'redemption_hold');
        const approval = item.kind === 'benefit'
          ? await db.approval.findFirst({ where: { type: 'realm_redemption', refId: existing.id, requesterId: user.id } })
          : null;
        if (item.kind === 'benefit') {
          const request = parseRealmRedemptionApproval(approval);
          if (!request || request.itemId !== item.id) {
            throw new RealmOperationError('Idempotency key đã được dùng cho quyền lợi khác.', 409, 'idempotency_conflict');
          }
        }
        return { type: item.kind === 'benefit' ? 'pending' : 'fulfilled', entry: existing, approval, idempotent: true };
      }
    }
    throw error;
  }
}

async function equipLoadoutTx(tx, user, item, idempotencyKey, now) {
  const existing = await tx.realmGoldEntry.findUnique({ where: { idempotencyKey } });
  if (existing) {
    return {
      type: 'equip',
      entry: requireLoadoutEntry(existing, user.id, item, idempotencyKey),
      item,
      idempotent: true,
    };
  }
  const owned = await tx.realmGoldEntry.findFirst({
    where: { userId: user.id, type: 'shop_spend', sourceType: 'shop', sourceId: item.id },
  });
  if (!owned) throw new RealmOperationError('Bạn chưa sở hữu vật phẩm này.', 409, 'loadout_item_not_owned');
  const entry = await tx.realmGoldEntry.create({
    data: {
      userId: user.id,
      type: 'loadout_equip',
      amount: 0,
      renown: 0,
      label: `Trang bị: ${item.name}`,
      sourceType: 'loadout',
      sourceId: realmLoadoutSourceId(item, idempotencyKey),
      idempotencyKey,
      createdAt: now,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name,
      action: 'realm_loadout_equip',
      entity: 'realm_gold',
      refId: entry.id,
      detail: `${item.slotLabel}: ${item.equipName}`,
    },
  });
  return { type: 'equip', entry, item, idempotent: false };
}

export async function equipRealmTavernItem(db, user, input, now = new Date()) {
  const { item, idempotencyKey } = normalizeRealmRedemptionRequest(input);
  if (item.kind !== 'cosmetic' || !item.slot) {
    throw new RealmOperationError('Vật phẩm này không thể trang bị.', 400, 'loadout_item_invalid');
  }
  try {
    return await db.$transaction(
      (tx) => equipLoadoutTx(tx, user, item, idempotencyKey, now),
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    if (error?.code === 'P2002') {
      const existing = await db.realmGoldEntry.findUnique({ where: { idempotencyKey } });
      if (existing) {
        return {
          type: 'equip',
          entry: requireLoadoutEntry(existing, user.id, item, idempotencyKey),
          item,
          idempotent: true,
        };
      }
    }
    throw error;
  }
}

function settlementKey(kind, approvalId) {
  return `realm-redemption:${kind}:${approvalId}`;
}

function requireFulfillmentReceipt(entry, approval, request) {
  if (
    !entry
    || entry.userId !== request.requesterId
    || entry.type !== 'redemption_fulfillment'
    || entry.sourceType !== 'approval'
    || entry.sourceId !== approval.id
    || entry.amount !== 0
  ) {
    throw new RealmOperationError('Biên nhận Tavern không khớp yêu cầu.', 409, 'tavern_fulfillment_invalid');
  }
  return entry;
}

function requireTavernKeeper(actor, approval, request) {
  if (!actor?.id) throw new RealmOperationError('Phiên Tavern Keeper không hợp lệ.', 401, 'tavern_keeper_unauthorized');
  if (approval.status !== 'approved') throw new RealmOperationError('Yêu cầu chưa được checker duyệt.', 409, 'tavern_request_not_approved');
  if (approval.requesterId === actor.id) throw new RealmOperationError('Người yêu cầu không được tự xác nhận trao thưởng.', 409, 'self_fulfillment_forbidden');
  const roles = rolesOf(actor);
  const item = realmTreasuryItem(request.itemId);
  if (!item || (!roles.includes('DIRECTOR') && !roles.includes(item.approvalRole || 'HR'))) {
    throw new RealmOperationError('Bạn không có quyền Tavern Keeper cho quyền lợi này.', 403, 'tavern_fulfillment_forbidden');
  }
  return item;
}

async function fulfillRedemptionTx(tx, actor, approvalId, now) {
  const approval = await tx.approval.findUnique({ where: { id: approvalId } });
  const request = parseRealmRedemptionApproval(approval);
  if (!request) throw new RealmOperationError('Yêu cầu Tavern không hợp lệ.', 404, 'tavern_request_not_found');
  requireTavernKeeper(actor, approval, request);
  const idempotencyKey = settlementKey('fulfillment', approval.id);
  const existing = await tx.realmGoldEntry.findUnique({ where: { idempotencyKey } });
  if (existing) return { type: 'fulfillment', approval, request, receipt: requireFulfillmentReceipt(existing, approval, request), idempotent: true };
  const receipt = await tx.realmGoldEntry.create({
    data: {
      userId: request.requesterId,
      type: 'redemption_fulfillment',
      amount: 0,
      renown: 0,
      label: `Tavern đã trao: ${request.itemName}`,
      sourceType: 'approval',
      sourceId: approval.id,
      idempotencyKey,
      createdAt: now,
    },
  });
  await tx.auditLog.create({
    data: {
      userId: actor.id,
      userName: actor.name,
      action: 'realm_tavern_delivery',
      entity: 'realm_gold',
      refId: approval.id,
      detail: `${request.itemName} · trao cho ${request.requesterName}`,
    },
  });
  return { type: 'fulfillment', approval, request, receipt, idempotent: false };
}

export async function markRealmTavernRedemptionFulfilled(db, actor, input, now = new Date()) {
  const approvalId = String(input?.approvalId || '').trim();
  if (!/^[a-zA-Z0-9_-]{1,120}$/.test(approvalId)) {
    throw new RealmOperationError('Mã yêu cầu Tavern không hợp lệ.', 400, 'invalid_tavern_request_id');
  }
  try {
    return await db.$transaction(
      (tx) => fulfillRedemptionTx(tx, actor, approvalId, now),
      { isolationLevel: 'Serializable' },
    );
  } catch (error) {
    if (error?.code === 'P2002') {
      const approval = await db.approval.findUnique({ where: { id: approvalId } });
      const request = parseRealmRedemptionApproval(approval);
      const receipt = await db.realmGoldEntry.findUnique({ where: { idempotencyKey: settlementKey('fulfillment', approvalId) } });
      if (request && receipt) {
        requireTavernKeeper(actor, approval, request);
        return { type: 'fulfillment', approval, request, receipt: requireFulfillmentReceipt(receipt, approval, request), idempotent: true };
      }
    }
    throw error;
  }
}

async function loadValidHold(tx, request) {
  const hold = await tx.realmGoldEntry.findUnique({ where: { id: request.holdEntryId } });
  if (
    !hold
    || hold.userId !== request.requesterId
    || hold.type !== 'redemption_hold'
    || hold.sourceType !== 'treasury_request'
    || hold.amount !== -request.price
  ) {
    throw new RealmOperationError('Bút toán giữ Gold không khớp yêu cầu.', 409, 'treasury_hold_invalid');
  }
  return hold;
}

export async function settleRealmRedemptionApproval(db, approval, actor) {
  const request = parseRealmRedemptionApproval(approval);
  if (!request) throw new RealmOperationError('Payload redemption không hợp lệ.', 409, 'treasury_approval_invalid');
  return db.$transaction(async (tx) => {
    const spendKey = settlementKey('spend', approval.id);
    const releaseKey = settlementKey('release', approval.id);
    const existingSpend = await tx.realmGoldEntry.findUnique({ where: { idempotencyKey: spendKey } });
    const existingRelease = await tx.realmGoldEntry.findUnique({ where: { idempotencyKey: releaseKey } });
    if (existingSpend && existingRelease) return { spend: existingSpend, release: existingRelease, idempotent: true };
    await loadValidHold(tx, request);
    const release = existingRelease || await tx.realmGoldEntry.create({
      data: {
        userId: request.requesterId,
        type: 'redemption_release',
        amount: request.price,
        renown: 0,
        label: `Kết chuyển giữ Gold: ${request.itemName}`,
        sourceType: 'approval',
        sourceId: approval.id,
        idempotencyKey: releaseKey,
      },
    });
    const spend = existingSpend || await tx.realmGoldEntry.create({
      data: {
        userId: request.requesterId,
        type: 'shop_spend',
        amount: -request.price,
        renown: 0,
        label: `Đổi quyền lợi: ${request.itemName}`,
        sourceType: 'approval',
        sourceId: approval.id,
        idempotencyKey: spendKey,
      },
    });
    await tx.auditLog.create({
      data: { userId: actor?.id || approval.requesterId, userName: actor?.name || approval.requesterName, action: 'realm_treasury_fulfill', entity: 'realm_gold', refId: approval.id, detail: `${request.itemName} · ${request.price} Gold` },
    });
    return { spend, release, idempotent: false };
  }, { isolationLevel: 'Serializable' });
}

export async function releaseRealmRedemptionHold(db, approval, actor) {
  const request = parseRealmRedemptionApproval(approval);
  if (!request) throw new RealmOperationError('Payload redemption không hợp lệ.', 409, 'treasury_approval_invalid');
  return db.$transaction(async (tx) => {
    const releaseKey = settlementKey('release', approval.id);
    const existing = await tx.realmGoldEntry.findUnique({ where: { idempotencyKey: releaseKey } });
    if (existing) return { release: existing, idempotent: true };
    await loadValidHold(tx, request);
    const release = await tx.realmGoldEntry.create({
      data: {
        userId: request.requesterId,
        type: 'redemption_release',
        amount: request.price,
        renown: 0,
        label: `Hoàn giữ Gold: ${request.itemName}`,
        sourceType: 'approval',
        sourceId: approval.id,
        idempotencyKey: releaseKey,
      },
    });
    await tx.auditLog.create({
      data: { userId: actor?.id || approval.requesterId, userName: actor?.name || approval.requesterName, action: 'realm_treasury_release', entity: 'realm_gold', refId: approval.id, detail: `${request.itemName} · hoàn ${request.price} Gold` },
    });
    return { release, idempotent: false };
  }, { isolationLevel: 'Serializable' });
}
