import { RealmOperationError, normalizeRealmIdempotencyKey } from './realm-operation.js';
import { createRealmInventory, REALM_TAVERN_CATALOG, realmTavernItem } from './realm-inventory.js';

export const REALM_TREASURY_CATALOG = REALM_TAVERN_CATALOG;
export const REALM_TREASURY_STORAGE_KEY = 'crmegoric-realms:treasury:v1';

function safeJsonObject(value) {
  try {
    const parsed = JSON.parse(value || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch {
    return {};
  }
}

export function realmTreasuryItem(itemId) {
  return realmTavernItem(itemId);
}

export function normalizeRealmRedemptionRequest(input) {
  const item = realmTreasuryItem(input?.itemId);
  if (!item) throw new RealmOperationError('Vật phẩm Tavern không tồn tại hoặc đã ngừng phục vụ.', 404, 'treasury_item_not_found');
  const idempotencyKey = normalizeRealmIdempotencyKey(input?.idempotencyKey);
  return { item, idempotencyKey };
}

export function realmTreasuryWallet(entries = []) {
  return entries.reduce((sum, entry) => sum + (Number.isFinite(Number(entry?.amount)) ? Math.trunc(Number(entry.amount)) : 0), 0);
}

export function parseRealmRedemptionApproval(approval) {
  if (!approval || approval.type !== 'realm_redemption') return null;
  const payload = safeJsonObject(approval.payload);
  const item = realmTreasuryItem(payload.itemId);
  const holdEntryId = String(payload.holdEntryId || '');
  if (
    !item
    || Number(payload.price) !== item.price
    || Number(approval.amount) !== item.price
    || payload.requesterId !== approval.requesterId
    || !holdEntryId
    || approval.refId !== holdEntryId
  ) return null;
  return {
    id: approval.id,
    itemId: item.id,
    itemName: item.name,
    price: item.price,
    kind: item.kind,
    status: approval.status,
    holdEntryId,
    requesterId: approval.requesterId,
    requesterName: approval.requesterName,
    createdAt: approval.createdAt instanceof Date ? approval.createdAt.toISOString() : approval.createdAt,
    decidedAt: approval.decidedAt instanceof Date ? approval.decidedAt.toISOString() : approval.decidedAt,
  };
}

function decorateFulfillment(request, fulfillmentByApproval) {
  const receipt = fulfillmentByApproval.get(request.id);
  if (request.status === 'rejected') {
    return { ...request, fulfillmentStatus: 'refunded', nextAction: 'Gold đã được hoàn vào journal.' };
  }
  if (request.status === 'pending') {
    return { ...request, fulfillmentStatus: 'awaiting_approval', nextAction: 'Đang chờ checker quyết định.' };
  }
  if (receipt) {
    return {
      ...request,
      fulfillmentStatus: 'fulfilled',
      fulfilledAt: receipt.createdAt instanceof Date ? receipt.createdAt.toISOString() : receipt.createdAt,
      nextAction: 'Tavern Keeper đã xác nhận trao thưởng.',
    };
  }
  return { ...request, fulfillmentStatus: 'ready', nextAction: 'Đã duyệt · Tavern Keeper đang chuẩn bị trao thưởng.' };
}

export function serializeRealmTreasuryDashboard({
  wallet = 0,
  entries = [],
  approvals = [],
  keeperApprovals = [],
  fulfillmentEntries = [],
  source = 'local',
  actor = null,
  permissions = null,
} = {}) {
  const { inventory, loadout } = createRealmInventory(entries);
  const ownedIds = new Set(inventory.map((item) => item.id));
  const fulfillmentByApproval = new Map(fulfillmentEntries
    .filter((entry) => entry.type === 'redemption_fulfillment' && entry.sourceType === 'approval' && entry.sourceId)
    .map((entry) => [entry.sourceId, entry]));
  const requests = approvals.map(parseRealmRedemptionApproval).filter(Boolean).map((request) => decorateFulfillment(request, fulfillmentByApproval));
  const keeperQueue = keeperApprovals
    .map(parseRealmRedemptionApproval)
    .filter(Boolean)
    .map((request) => decorateFulfillment(request, fulfillmentByApproval))
    .filter((request) => request.fulfillmentStatus === 'ready');
  const pendingByItem = new Map(requests.filter((request) => request.status === 'pending').map((request) => [request.itemId, request]));
  const reserved = requests.filter((request) => request.status === 'pending').reduce((sum, request) => sum + request.price, 0);
  return {
    source,
    actor,
    permissions,
    wallet: Math.max(0, Math.trunc(Number(wallet) || 0)),
    reserved,
    catalog: REALM_TREASURY_CATALOG.map((item) => ({
      ...item,
      owned: item.kind === 'cosmetic' && ownedIds.has(item.id),
      pendingRequestId: pendingByItem.get(item.id)?.id || null,
      affordable: Number(wallet) >= item.price,
    })),
    inventory,
    loadout,
    requests: requests.sort((a, b) => String(b.createdAt || '').localeCompare(String(a.createdAt || ''))),
    keeperQueue: keeperQueue.sort((a, b) => String(a.createdAt || '').localeCompare(String(b.createdAt || ''))),
    policy: {
      cosmetics: 'Tavern mở khóa trực tiếp một lần và ghi shop_spend append-only.',
      benefits: 'Giữ Gold khi gửi yêu cầu; checker duyệt thì kết chuyển spend, từ chối thì hoàn giữ chỗ.',
      exclusions: 'Gold không đổi thành lương, tiền mặt hoặc ngày phép luật định.',
    },
  };
}

export function createRealmTreasuryDemoDashboard(wallet = 0) {
  return serializeRealmTreasuryDashboard({
    wallet,
    source: 'local',
    actor: { id: 'demo-adventurer', name: 'Adventurer Zero', roleLabel: 'Staff · sandbox' },
    permissions: { canRedeem: true, canDemoReview: true, canDemoFulfill: true, canFulfill: false, demo: true },
    approvals: [],
    entries: [],
  });
}

function safeIsoDate(value, fallback = null) {
  if (!value) return fallback;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date.toISOString();
}

function restoreDemoRequest(value, actor) {
  if (!value || typeof value !== 'object') return null;
  const item = realmTreasuryItem(value.itemId);
  if (!item || item.kind !== 'benefit') return null;
  const id = String(value.id || '').trim().slice(0, 100);
  if (!/^[a-z0-9][a-z0-9:_-]{7,99}$/i.test(id)) return null;
  const status = ['pending', 'approved', 'rejected'].includes(value.status) ? value.status : 'pending';
  const fulfilled = status === 'approved' && value.fulfillmentStatus === 'fulfilled';
  const fulfillmentStatus = status === 'pending'
    ? 'awaiting_approval'
    : status === 'rejected'
      ? 'refunded'
      : fulfilled
        ? 'fulfilled'
        : 'ready';
  const nextAction = fulfillmentStatus === 'awaiting_approval'
    ? 'Đang chờ checker quyết định.'
    : fulfillmentStatus === 'refunded'
      ? 'Gold đã được hoàn vào journal.'
      : fulfillmentStatus === 'fulfilled'
        ? 'Tavern Keeper đã xác nhận trao thưởng.'
        : 'Đã duyệt · Tavern Keeper đang chuẩn bị trao thưởng.';
  return {
    id,
    itemId: item.id,
    itemName: item.name,
    price: item.price,
    kind: item.kind,
    status,
    fulfillmentStatus,
    nextAction,
    requesterId: actor.id,
    requesterName: actor.name,
    createdAt: safeIsoDate(value.createdAt, new Date(0).toISOString()),
    ...(status !== 'pending' ? { decidedAt: safeIsoDate(value.decidedAt, new Date(0).toISOString()) } : {}),
    ...(fulfilled ? { fulfilledAt: safeIsoDate(value.fulfilledAt, new Date(0).toISOString()) } : {}),
  };
}

export function serializeRealmTreasuryDemoState(dashboard) {
  return {
    version: 1,
    requests: Array.isArray(dashboard?.requests) ? dashboard.requests.slice(0, 50) : [],
  };
}

export function restoreRealmTreasuryDemoDashboard(snapshot, wallet = 0) {
  const base = createRealmTreasuryDemoDashboard(wallet);
  const requests = [];
  const seenRequestIds = new Set();
  const pendingItemIds = new Set();
  for (const value of Array.isArray(snapshot?.requests) ? snapshot.requests.slice(0, 50) : []) {
    const request = restoreDemoRequest(value, base.actor);
    if (!request || seenRequestIds.has(request.id)) continue;
    if (request.status === 'pending' && pendingItemIds.has(request.itemId)) continue;
    seenRequestIds.add(request.id);
    if (request.status === 'pending') pendingItemIds.add(request.itemId);
    requests.push(request);
  }
  requests.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  const pendingByItem = new Map(requests
    .filter((request) => request.status === 'pending')
    .map((request) => [request.itemId, request.id]));
  return {
    ...base,
    reserved: requests
      .filter((request) => request.status === 'pending')
      .reduce((sum, request) => sum + request.price, 0),
    requests,
    keeperQueue: requests.filter((request) => request.fulfillmentStatus === 'ready'),
    catalog: base.catalog.map((item) => ({
      ...item,
      pendingRequestId: pendingByItem.get(item.id) || null,
      affordable: base.wallet >= item.price,
    })),
  };
}

export function applyRealmTreasuryDemoAction(dashboard, action) {
  const requests = Array.isArray(dashboard?.requests) ? dashboard.requests : [];
  if (action.type === 'redeem') {
    const item = realmTreasuryItem(action?.itemId);
    if (!item) throw new RealmOperationError('Vật phẩm không tồn tại.', 404, 'treasury_item_not_found');
    const catalogItem = dashboard.catalog.find((row) => row.id === item.id);
    if (catalogItem?.owned) throw new RealmOperationError('Vật phẩm cosmetic này đã được mở khóa.', 409, 'treasury_item_owned');
    if (catalogItem?.pendingRequestId) throw new RealmOperationError('Quyền lợi này đã có yêu cầu chờ duyệt.', 409, 'treasury_request_pending');
    if (dashboard.wallet < item.price) throw new RealmOperationError('Ví Gold không đủ cho yêu cầu này.', 409, 'treasury_insufficient_gold');
    if (item.kind === 'cosmetic') {
      return {
        ...dashboard,
        wallet: dashboard.wallet - item.price,
        catalog: dashboard.catalog.map((row) => row.id === item.id ? { ...row, owned: true, affordable: dashboard.wallet - item.price >= row.price } : { ...row, affordable: dashboard.wallet - item.price >= row.price }),
        inventory: [...(dashboard.inventory || []), { ...item, equipped: false }],
        action: { type: 'redeem', outcome: 'fulfilled', item, walletDelta: -item.price },
      };
    }
    const request = {
      id: `demo-redemption-${Date.now()}`,
      itemId: item.id,
      itemName: item.name,
      price: item.price,
      kind: item.kind,
      status: 'pending',
      fulfillmentStatus: 'awaiting_approval',
      nextAction: 'Đang chờ checker quyết định.',
      requesterId: dashboard.actor.id,
      requesterName: dashboard.actor.name,
      createdAt: new Date().toISOString(),
    };
    const nextWallet = dashboard.wallet - item.price;
    return {
      ...dashboard,
      wallet: nextWallet,
      reserved: dashboard.reserved + item.price,
      catalog: dashboard.catalog.map((row) => ({
        ...row,
        pendingRequestId: row.id === item.id ? request.id : row.pendingRequestId,
        affordable: nextWallet >= row.price,
      })),
      requests: [request, ...requests],
      action: { type: 'redeem', outcome: 'pending', item, walletDelta: -item.price },
    };
  }
  if (action.type === 'equip') {
    const item = realmTreasuryItem(action?.itemId);
    if (!item || item.kind !== 'cosmetic' || !item.slot) {
      throw new RealmOperationError('Vật phẩm này không thể trang bị.', 400, 'loadout_item_invalid');
    }
    const owned = (dashboard.inventory || []).find((row) => row.id === item.id);
    if (!owned) throw new RealmOperationError('Bạn chưa sở hữu vật phẩm này.', 409, 'loadout_item_not_owned');
    return {
      ...dashboard,
      inventory: dashboard.inventory.map((row) => row.slot === item.slot
        ? { ...row, equipped: row.id === item.id }
        : row),
      loadout: { ...(dashboard.loadout || {}), [item.slot]: item },
      action: { type: 'equip', outcome: 'equipped', item, walletDelta: 0 },
    };
  }
  const request = requests.find((row) => row.id === action.requestId);
  if (!request) throw new RealmOperationError('Yêu cầu Tavern không tồn tại.', 404, 'treasury_request_not_found');
  const item = realmTreasuryItem(request.itemId);
  if (!item) throw new RealmOperationError('Vật phẩm không tồn tại.', 404, 'treasury_item_not_found');
  if (action.type === 'demo-fulfill') {
    if (request.status !== 'approved' || request.fulfillmentStatus === 'fulfilled') {
      throw new RealmOperationError('Yêu cầu chưa sẵn sàng để trao thưởng.', 409, 'tavern_request_not_ready');
    }
    return {
      ...dashboard,
      requests: requests.map((row) => row.id === request.id ? {
        ...row,
        fulfillmentStatus: 'fulfilled',
        fulfilledAt: new Date().toISOString(),
        nextAction: 'Tavern Keeper đã xác nhận trao thưởng.',
      } : row),
      action: { type: action.type, outcome: 'fulfilled', item, walletDelta: 0 },
    };
  }
  if (request.status !== 'pending') throw new RealmOperationError('Yêu cầu không còn ở trạng thái chờ duyệt.', 409, 'treasury_request_not_pending');
  if (action.type === 'demo-approve') {
    return {
      ...dashboard,
      reserved: Math.max(0, dashboard.reserved - request.price),
      catalog: dashboard.catalog.map((row) => row.id === request.itemId ? { ...row, pendingRequestId: null } : row),
      requests: requests.map((row) => row.id === request.id ? {
        ...row,
        status: 'approved',
        fulfillmentStatus: 'ready',
        decidedAt: new Date().toISOString(),
        nextAction: 'Đã duyệt · Tavern Keeper đang chuẩn bị trao thưởng.',
      } : row),
      action: { type: action.type, outcome: 'approved', item, walletDelta: 0 },
    };
  }
  if (action.type === 'demo-reject') {
    const nextWallet = dashboard.wallet + request.price;
    return {
      ...dashboard,
      wallet: nextWallet,
      reserved: Math.max(0, dashboard.reserved - request.price),
      catalog: dashboard.catalog.map((row) => ({ ...row, pendingRequestId: row.id === request.itemId ? null : row.pendingRequestId, affordable: nextWallet >= row.price })),
      requests: requests.map((row) => row.id === request.id ? {
        ...row,
        status: 'rejected',
        fulfillmentStatus: 'refunded',
        decidedAt: new Date().toISOString(),
        nextAction: 'Gold đã được hoàn vào journal.',
      } : row),
      action: { type: action.type, outcome: 'rejected', item, walletDelta: request.price },
    };
  }
  throw new RealmOperationError('Tavern action không được hỗ trợ.', 400, 'unsupported_treasury_action');
}
