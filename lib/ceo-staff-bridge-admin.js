// v3.40 — Lõi phía PORTAL cho cầu nối nhân sự (Đợt 3b + 3c).
import { ceoEntityCredentialMatches, ceoIdentityHashSecret } from './ceo-identity.js';
import {
  CeoStaffError, STAFF_SSO_CODE_TTL_MS, assertDistinctEntities, createStaffCode,
  hashStaffCode, normalizePersonKey, normalizeRedirectPath, normalizeStaffMessage,
} from './ceo-staff-bridge.js';

/* Xác thực CÔNG TY gọi portal (chiều entity → portal).
   Dùng shared secret SSO của chính công ty đó (CEO_ENTITY_<ID>_API_KEY ở portal =
   CEO_SSO_ENTITY_API_KEY ở entity) — cùng cơ chế /sso/exchange đã chạy ổn định.
   KHÔNG dùng service key vì hash của nó nằm trong database công ty, không phải portal. */
export function authenticateEntityCaller(request, { env = process.env } = {}) {
  const entityId = String(request.headers.get('x-ceo-entity-id') || '').trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9-]{1,47}$/.test(entityId)) {
    throw new CeoStaffError('Thiếu mã công ty gọi.', 401, 'ceo_staff_caller_unidentified');
  }
  const provided = String(request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '').trim();
  const expected = String(env[`CEO_ENTITY_${entityId.toUpperCase()}_API_KEY`] || '');
  if (!expected || !ceoEntityCredentialMatches(provided, expected)) {
    throw new CeoStaffError('Công ty gọi không được xác thực.', 401, 'ceo_staff_caller_unauthorized');
  }
  return entityId;
}

async function assertEntityEnabled(db, entityId) {
  const entity = await db.ceoEntityRegistry.findUnique({ where: { id: entityId }, select: { id: true, enabled: true, displayName: true, baseUrl: true } });
  if (!entity?.enabled) throw new CeoStaffError('Công ty không nằm trong group đang bật.', 403, 'ceo_staff_entity_disabled');
  return entity;
}

async function activeLink(db, personKey, entityId) {
  const link = await db.ceoStaffLink.findUnique({ where: { personKey_entityId: { personKey, entityId } } });
  if (!link || link.status !== 'active') {
    throw new CeoStaffError('Nhân sự chưa được liên kết với công ty này.', 403, 'ceo_staff_link_missing');
  }
  return link;
}

/* ---------------- Đợt 3b: phát mã SSO cho nhân sự ---------------- */
// Gọi bởi CÔNG TY NGUỒN (Bearer service key của chính nó, scope ceo.staff.sso).
export async function issueStaffSsoCode(db, { sourceEntityId, targetEntityId, sourceUserEmail, redirectPath }, context = {}) {
  const now = context.now || new Date();
  assertDistinctEntities(sourceEntityId, targetEntityId);
  await assertEntityEnabled(db, sourceEntityId);
  const target = await assertEntityEnabled(db, targetEntityId);
  const personKey = normalizePersonKey(sourceUserEmail);
  // Người này phải có mặt (đang hoạt động) ở CẢ HAI công ty — portal chỉ nối, không cấp quyền mới
  await activeLink(db, personKey, sourceEntityId);
  const targetLink = await activeLink(db, personKey, targetEntityId);

  const raw = createStaffCode();
  await db.ceoStaffSsoCode.create({
    data: {
      codeHash: hashStaffCode(raw, context.hashSecret || ceoIdentityHashSecret()),
      personKey,
      sourceEntity: sourceEntityId,
      targetEntity: targetEntityId,
      localUserEmail: targetLink.localUserEmail,
      redirectPath: normalizeRedirectPath(redirectPath),
      expiresAt: new Date(now.getTime() + STAFF_SSO_CODE_TTL_MS),
    },
  });
  await db.auditLog.create({ data: {
    userId: 'ceo-staff-bridge', userName: 'CEO Staff Bridge', action: 'ceo_staff_sso_issued',
    entity: 'ceo_staff_link', refId: `${sourceEntityId}->${targetEntityId}`, detail: personKey,
  } }).catch(() => {});
  return {
    code: raw,
    expiresInMs: STAFF_SSO_CODE_TTL_MS,
    target: { id: target.id, displayName: target.displayName, callbackUrl: `${target.baseUrl}/api/staff-sso/callback` },
  };
}

// Gọi bởi CÔNG TY ĐÍCH để đổi mã lấy danh tính (một lần duy nhất).
export async function redeemStaffSsoCode(db, { targetEntityId, code }, context = {}) {
  const now = context.now || new Date();
  await assertEntityEnabled(db, targetEntityId);
  const codeHash = hashStaffCode(code, context.hashSecret || ceoIdentityHashSecret());
  const row = await db.ceoStaffSsoCode.findUnique({ where: { codeHash } });
  if (!row || row.targetEntity !== targetEntityId || row.consumedAt || new Date(row.expiresAt) <= now) {
    throw new CeoStaffError('Mã SSO không hợp lệ hoặc đã dùng.', 401, 'ceo_staff_code_invalid');
  }
  const consumed = await db.ceoStaffSsoCode.updateMany({ where: { id: row.id, consumedAt: null }, data: { consumedAt: now } });
  if (consumed.count !== 1) throw new CeoStaffError('Mã SSO đã được dùng.', 409, 'ceo_staff_code_replayed');
  await activeLink(db, row.personKey, targetEntityId); // liên kết có thể vừa bị gỡ giữa chừng
  return { localUserEmail: row.localUserEmail, redirectPath: row.redirectPath, sourceEntity: row.sourceEntity, personKey: row.personKey };
}

/* ---------------- Đợt 3c: chuyển tiếp tin nhắn nhân sự ↔ nhân sự ---------------- */
// Công ty nguồn xác thực bằng service key (scope ceo.staff.message) và gửi thay nhân sự.
// Portal chỉ chuyển tiếp: công ty đích tự tạo bản ghi chat + thông báo của mình.
export async function relayStaffMessage(db, { sourceEntityId, targetEntityId, senderEmail, recipientEmail, body }, context = {}) {
  assertDistinctEntities(sourceEntityId, targetEntityId);
  const source = await assertEntityEnabled(db, sourceEntityId);
  const target = await assertEntityEnabled(db, targetEntityId);
  const senderKey = normalizePersonKey(senderEmail);
  const recipientKey = normalizePersonKey(recipientEmail);
  await activeLink(db, senderKey, sourceEntityId);
  const recipientLink = await activeLink(db, recipientKey, targetEntityId);
  const text = normalizeStaffMessage(body);

  const fetchImpl = context.fetchImpl || fetch;
  const secret = context.secretResolver ? context.secretResolver(`CEO_ENTITY_${targetEntityId.toUpperCase()}_SERVICE_KEY`) : '';
  if (!secret) throw new CeoStaffError('Chưa cấu hình khóa dịch vụ cho công ty đích.', 503, 'ceo_staff_target_credential_missing');

  const response = await fetchImpl(new URL('/api/staff-message/deliver', target.baseUrl), {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${secret}`,
      'x-ceo-entity-id': targetEntityId,
    },
    body: JSON.stringify({
      sourceEntityId, sourceDisplayName: source.displayName,
      senderEmail: senderKey, recipientEmail: recipientLink.localUserEmail, body: text,
    }),
    cache: 'no-store',
    redirect: 'error',
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new CeoStaffError(payload.error || 'Công ty đích từ chối tin nhắn.', response.status >= 500 ? 502 : response.status, payload.code || 'ceo_staff_relay_rejected');
  }
  await db.auditLog.create({ data: {
    userId: 'ceo-staff-bridge', userName: 'CEO Staff Bridge', action: 'ceo_staff_message_relayed',
    entity: 'ceo_staff_link', refId: `${sourceEntityId}->${targetEntityId}`, detail: `${senderKey} → ${recipientKey}`,
  } }).catch(() => {});
  return { delivered: true, target: target.id, conversationId: payload.conversationId || null };
}

/* ---------------- Quản trị liên kết nhân sự (CEO thao tác trên portal) ---------------- */
export async function upsertStaffLink(db, { personEmail, entityId, localUserEmail, localRole = 'STAFF' }) {
  const personKey = normalizePersonKey(personEmail);
  await assertEntityEnabled(db, entityId);
  const localEmail = normalizePersonKey(localUserEmail || personEmail);
  return db.ceoStaffLink.upsert({
    where: { personKey_entityId: { personKey, entityId } },
    update: { localUserEmail: localEmail, localRole, status: 'active' },
    create: { personKey, entityId, localUserEmail: localEmail, localRole, status: 'active' },
  });
}

export async function listStaffLinks(db, personEmail = null) {
  const where = personEmail ? { personKey: normalizePersonKey(personEmail) } : {};
  return db.ceoStaffLink.findMany({ where, orderBy: [{ personKey: 'asc' }, { entityId: 'asc' }] });
}
