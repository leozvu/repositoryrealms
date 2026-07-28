import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import { RealmOperationError } from './realm-operation.js';

export const REALM_LAUNCH_PREVIEW_TTL_MS = 10 * 60 * 1000;

const MODE_RANK = Object.freeze({ off: 0, pilot: 1, open: 2 });

function sorted(values) {
  return [...new Set(Array.isArray(values) ? values : [])].sort();
}

function canonicalPolicy(value = {}) {
  return {
    mode: value.mode,
    defaultSurface: value.defaultSurface,
    cohortStrategy: value.cohortStrategy,
    roles: sorted(value.roles),
    memberIds: sorted(value.memberIds),
    features: {
      office: value.features?.office !== false,
      tavern: value.features?.tavern !== false,
      feedback: value.features?.feedback !== false,
    },
    onboardingVersion: value.onboardingVersion,
    version: value.version,
  };
}

function includesNewValues(currentValues, nextValues) {
  const current = new Set(currentValues || []);
  return (nextValues || []).some((value) => !current.has(value));
}

function includesRemovedValues(currentValues, nextValues) {
  const next = new Set(nextValues || []);
  return (currentValues || []).some((value) => !next.has(value));
}

export function realmLaunchPolicyDigest(policy) {
  return createHash('sha256').update(JSON.stringify(canonicalPolicy(policy))).digest('hex');
}

export function classifyRealmLaunchChange(currentValue, nextValue) {
  const current = canonicalPolicy(currentValue);
  const next = canonicalPolicy(nextValue);
  if (next.mode === 'off') return 'emergency';

  const currentRank = MODE_RANK[current.mode] ?? 0;
  const nextRank = MODE_RANK[next.mode] ?? 0;
  const narrowsMode = nextRank < currentRank;
  const expandsMode = nextRank > currentRank;
  const enablesFeature = Object.keys(next.features).some((key) => !current.features[key] && next.features[key]);
  const disablesFeature = Object.keys(next.features).some((key) => current.features[key] && !next.features[key]);
  const changesToRealmDefault = current.defaultSurface !== 'realm' && next.defaultSurface === 'realm';
  const changesToErpDefault = current.defaultSurface === 'realm' && next.defaultSurface === 'erp';

  if (expandsMode || enablesFeature || changesToRealmDefault) return 'expansion';
  if (narrowsMode && !enablesFeature && !changesToRealmDefault) return 'restriction';

  if (current.mode === 'pilot' && next.mode === 'pilot') {
    if (current.cohortStrategy !== next.cohortStrategy) return 'expansion';
    const cohortExpansion = next.cohortStrategy === 'members'
      ? includesNewValues(current.memberIds, next.memberIds)
      : includesNewValues(current.roles, next.roles);
    if (cohortExpansion) return 'expansion';
    const cohortRestriction = next.cohortStrategy === 'members'
      ? includesRemovedValues(current.memberIds, next.memberIds)
      : includesRemovedValues(current.roles, next.roles);
    if (cohortRestriction || disablesFeature || changesToErpDefault) return 'restriction';
  }

  if (disablesFeature || changesToErpDefault) return 'restriction';
  return 'operational';
}

function encode(value) {
  return Buffer.from(value).toString('base64url');
}

function signatureFor(encodedPayload, secret) {
  return createHmac('sha256', secret).update(encodedPayload).digest('base64url');
}

function requireSecret(secret) {
  const value = String(secret || '');
  if (value.length < 16) {
    throw new RealmOperationError('Launch preview chưa được cấu hình khóa ký an toàn.', 503, 'realm_launch_secret_unavailable');
  }
  return value;
}

export function realmLaunchSecret(env = process.env) {
  return requireSecret(env.NEXTAUTH_SECRET || env.AUTH_SECRET);
}

export function createRealmLaunchPreviewToken({
  actorId,
  currentPolicy,
  draftPolicy,
  readiness,
  impact,
  secret,
  now = new Date(),
  ttlMs = REALM_LAUNCH_PREVIEW_TTL_MS,
}) {
  const signingSecret = requireSecret(secret);
  const issuedAt = Math.floor(now.getTime() / 1000);
  const expiresAt = Math.floor((now.getTime() + ttlMs) / 1000);
  const payload = {
    v: 1,
    actorId: String(actorId || ''),
    policyVersion: Number(currentPolicy?.version || 0),
    draftDigest: realmLaunchPolicyDigest(draftPolicy),
    risk: classifyRealmLaunchChange(currentPolicy, draftPolicy),
    ready: readiness?.ready === true,
    blockerCount: Number(readiness?.summary?.blockers || 0),
    eligibleUsers: Number(impact?.eligibleUsers || 0),
    fallbackUsers: Number(impact?.fallbackUsers || 0),
    issuedAt,
    expiresAt,
  };
  const encodedPayload = encode(JSON.stringify(payload));
  const signature = signatureFor(encodedPayload, signingSecret);
  const token = `${encodedPayload}.${signature}`;
  return {
    token,
    payload,
    previewId: createHash('sha256').update(token).digest('hex').slice(0, 12),
  };
}

export function verifyRealmLaunchPreviewToken({
  token,
  actorId,
  currentPolicy,
  draftPolicy,
  secret,
  now = new Date(),
}) {
  const signingSecret = requireSecret(secret);
  const [encodedPayload, providedSignature, ...extra] = String(token || '').split('.');
  if (!encodedPayload || !providedSignature || extra.length) {
    throw new RealmOperationError('Hãy chạy dry-run trước khi áp dụng chính sách.', 428, 'realm_launch_preview_required');
  }
  const expectedSignature = signatureFor(encodedPayload, signingSecret);
  const expectedBuffer = Buffer.from(expectedSignature);
  const providedBuffer = Buffer.from(providedSignature);
  if (expectedBuffer.length !== providedBuffer.length || !timingSafeEqual(expectedBuffer, providedBuffer)) {
    throw new RealmOperationError('Launch preview không hợp lệ. Hãy chạy lại dry-run.', 409, 'realm_launch_preview_invalid');
  }

  let payload;
  try {
    payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
  } catch {
    throw new RealmOperationError('Launch preview không hợp lệ. Hãy chạy lại dry-run.', 409, 'realm_launch_preview_invalid');
  }
  const nowSeconds = Math.floor(now.getTime() / 1000);
  if (payload.v !== 1 || payload.expiresAt <= nowSeconds) {
    throw new RealmOperationError('Launch preview đã hết hạn. Hãy chạy lại dry-run.', 409, 'realm_launch_preview_expired');
  }
  if (payload.actorId !== String(actorId || '')) {
    throw new RealmOperationError('Launch preview thuộc một Director khác.', 403, 'realm_launch_preview_actor_mismatch');
  }
  if (payload.policyVersion !== Number(currentPolicy?.version || 0)) {
    throw new RealmOperationError('Chính sách đã đổi sau dry-run. Hãy tải lại và preview lại.', 409, 'realm_launch_preview_version_mismatch');
  }
  if (payload.draftDigest !== realmLaunchPolicyDigest(draftPolicy)) {
    throw new RealmOperationError('Bản nháp đã đổi sau dry-run. Hãy preview lại trước khi lưu.', 409, 'realm_launch_preview_draft_mismatch');
  }
  const risk = classifyRealmLaunchChange(currentPolicy, draftPolicy);
  if (payload.risk !== risk) {
    throw new RealmOperationError('Phân loại rủi ro đã thay đổi. Hãy preview lại.', 409, 'realm_launch_preview_risk_mismatch');
  }
  if (risk === 'expansion' && payload.ready !== true) {
    throw new RealmOperationError('Không thể mở rộng rollout khi preflight còn blocker.', 409, 'realm_launch_readiness_blocked');
  }
  return {
    ...payload,
    previewId: createHash('sha256').update(String(token)).digest('hex').slice(0, 12),
  };
}
