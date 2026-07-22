import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { isDirector } from './perm.js';
import { RealmOperationError } from './realm-operation.js';
import { verifyRealmLaunchApplication } from './realm-launch.js';
import { classifyRealmLaunchChange, realmLaunchPolicyDigest } from './realm-launch-token.js';
import {
  applyRealmPilotConfigInTransaction,
  normalizeRealmPilotConfig,
  parseRealmPilotConfig,
} from './realm-pilot.js';
import { loadRealmLaunchReadiness } from './realm-readiness.js';

export const REALM_LAUNCH_APPROVAL_TTL_MS = 24 * 60 * 60 * 1000;

const PAYLOAD_PREFIX = 'realm-launch-v1';
const PAYLOAD_AAD = Buffer.from('crmegoric:realm-launch-approval:v1');

function requireDirector(user) {
  if (!isDirector(user)) {
    throw new RealmOperationError('Chỉ Giám đốc được quản lý phê duyệt phát hành Realm.', 403, 'realm_launch_approval_forbidden');
  }
}

function encryptionKey(secret) {
  const value = String(secret || '');
  if (value.length < 16) {
    throw new RealmOperationError('Launch approval chưa được cấu hình khóa mã hóa an toàn.', 503, 'realm_launch_secret_unavailable');
  }
  return createHash('sha256').update(`${PAYLOAD_PREFIX}:${value}`).digest();
}

function sealProposal(proposal, secret) {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', encryptionKey(secret), iv);
  cipher.setAAD(PAYLOAD_AAD);
  const encrypted = Buffer.concat([cipher.update(JSON.stringify(proposal), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [PAYLOAD_PREFIX, iv.toString('base64url'), tag.toString('base64url'), encrypted.toString('base64url')].join('.');
}

function openProposal(payload, secret) {
  const [prefix, ivValue, tagValue, encryptedValue, ...extra] = String(payload || '').split('.');
  if (prefix !== PAYLOAD_PREFIX || !ivValue || !tagValue || !encryptedValue || extra.length) {
    throw new RealmOperationError('Payload phê duyệt phát hành không hợp lệ.', 409, 'realm_launch_approval_payload_invalid');
  }
  try {
    const decipher = createDecipheriv('aes-256-gcm', encryptionKey(secret), Buffer.from(ivValue, 'base64url'));
    decipher.setAAD(PAYLOAD_AAD);
    decipher.setAuthTag(Buffer.from(tagValue, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(encryptedValue, 'base64url')),
      decipher.final(),
    ]).toString('utf8');
    const proposal = JSON.parse(decrypted);
    if (proposal?.v !== 1 || !proposal?.draftPolicy || !proposal?.preview?.previewId) throw new Error('shape');
    return proposal;
  } catch (error) {
    if (error instanceof RealmOperationError) throw error;
    throw new RealmOperationError('Payload phê duyệt phát hành đã hỏng hoặc bị thay đổi.', 409, 'realm_launch_approval_payload_invalid');
  }
}

function safeApproval(approval, proposal = null, now = new Date()) {
  const expiresAt = proposal?.expiresAt || null;
  const timedOut = approval.status === 'pending'
    && Boolean(expiresAt)
    && new Date(expiresAt).getTime() <= now.getTime();
  return {
    id: approval.id,
    type: approval.type,
    refId: approval.refId,
    title: approval.title,
    requesterId: approval.requesterId,
    requesterName: approval.requesterName,
    status: approval.status,
    steps: approval.steps,
    createdAt: approval.createdAt,
    decidedAt: approval.decidedAt,
    expiresAt,
    timedOut,
    deadlineState: timedOut ? 'timed_out' : approval.status === 'pending' ? 'open' : 'closed',
    policyVersion: proposal?.draftPolicy?.version ?? null,
    risk: proposal?.preview?.risk || 'expansion',
    impact: {
      eligibleUsers: Number(proposal?.preview?.eligibleUsers ?? approval.amount ?? 0),
      fallbackUsers: Number(proposal?.preview?.fallbackUsers || 0),
    },
    privacy: { aggregateOnly: true, rosterIncluded: false },
    payloadReadable: Boolean(proposal),
  };
}

function decisionSteps(approval, user, decision, note, now) {
  let steps = [];
  try { steps = JSON.parse(approval.steps || '[]'); } catch { steps = []; }
  const index = steps.findIndex((step) => step.status === 'pending');
  if (index < 0) throw new RealmOperationError('Yêu cầu không còn bước chờ duyệt.', 409, 'realm_launch_approval_stale');
  steps[index] = {
    ...steps[index],
    status: decision === 'approve' ? 'approved' : 'rejected',
    byId: user.id,
    byName: user.name,
    at: now.toISOString(),
    note: note || null,
  };
  return steps;
}

async function closeStaleApproval(tx, approval, user, proposal, reason, now) {
  const steps = decisionSteps(approval, user, 'reject', reason, now);
  const claimed = await tx.approval.updateMany({
    where: { id: approval.id, status: 'pending', steps: approval.steps },
    data: { steps: JSON.stringify(steps), status: 'rejected', decidedAt: now },
  });
  if (claimed.count !== 1) {
    throw new RealmOperationError('Yêu cầu vừa được xử lý ở phiên khác. Hãy tải lại.', 409, 'approval_decision_stale');
  }
  await tx.auditLog.create({
    data: {
      userId: user.id,
      userName: user.name,
      action: 'approve_failed',
      entity: 'approvals',
      refId: approval.id,
      detail: `${reason}; preview ${proposal.preview.previewId}`,
    },
  });
  const updated = await tx.approval.findUnique({ where: { id: approval.id } });
  return { outcome: 'stale', approval: safeApproval(updated, proposal), policy: null };
}

export async function createRealmLaunchApproval(db, sessionUser, rawPolicy, {
  token,
  secret,
  now = new Date(),
} = {}) {
  requireDirector(sessionUser);
  const draftPolicy = normalizeRealmPilotConfig(rawPolicy);
  const created = await db.$transaction(async (tx) => {
    const setting = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
    const currentPolicy = parseRealmPilotConfig(setting?.json);
    const preview = await verifyRealmLaunchApplication(tx, sessionUser, {
      token,
      currentPolicy,
      draftPolicy,
      secret,
      now,
    });
    if (preview.risk !== 'expansion') {
      throw new RealmOperationError('Chỉ thay đổi mở rộng Realm mới cần Director thứ hai duyệt.', 400, 'realm_launch_approval_not_required');
    }
    const refId = realmLaunchPolicyDigest(draftPolicy);
    const duplicate = await tx.approval.findFirst({
      where: { type: 'realm_launch', refId, status: 'pending' },
      select: { id: true },
    });
    if (duplicate) {
      throw new RealmOperationError('Bản mở rộng này đã có yêu cầu chờ duyệt.', 409, 'realm_launch_approval_duplicate');
    }
    const proposal = {
      v: 1,
      requesterId: sessionUser.id,
      draftPolicy,
      preview: {
        previewId: preview.previewId,
        risk: preview.risk,
        eligibleUsers: preview.eligibleUsers,
        fallbackUsers: preview.fallbackUsers,
      },
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + REALM_LAUNCH_APPROVAL_TTL_MS).toISOString(),
    };
    const approval = await tx.approval.create({
      data: {
        type: 'realm_launch',
        refId,
        title: `Mở rộng Realm · policy v${draftPolicy.version} → v${draftPolicy.version + 1}`,
        amount: Number(preview.eligibleUsers || 0),
        payload: sealProposal(proposal, secret),
        requesterId: sessionUser.id,
        requesterName: sessionUser.name || 'Director',
        steps: JSON.stringify([{ role: 'DIRECTOR', label: 'Director thứ hai', status: 'pending' }]),
        status: 'pending',
      },
    });
    await tx.auditLog.create({
      data: {
        userId: sessionUser.id,
        userName: sessionUser.name || 'Director',
        action: 'request',
        entity: 'approvals',
        refId: approval.id,
        detail: `Realm expansion; preview ${preview.previewId}; eligible ${preview.eligibleUsers}; fallback ${preview.fallbackUsers}; no roster`,
      },
    });
    return safeApproval(approval, proposal);
  }, { isolationLevel: 'Serializable' });
  return created;
}

export async function listRealmLaunchApprovals(db, sessionUser, { secret, now = new Date() } = {}) {
  requireDirector(sessionUser);
  const approvals = await db.approval.findMany({
    where: {
      type: 'realm_launch',
      OR: [{ status: 'pending' }, { requesterId: sessionUser.id }],
    },
    orderBy: { createdAt: 'desc' },
    take: 60,
  });
  const rows = approvals.map((approval) => {
    try { return safeApproval(approval, openProposal(approval.payload, secret), now); }
    catch { return safeApproval(approval, null, now); }
  });
  return {
    toReview: rows.filter((approval) => approval.status === 'pending' && approval.requesterId !== sessionUser.id),
    mine: rows.filter((approval) => approval.requesterId === sessionUser.id).slice(0, 30),
    privacy: { aggregateOnly: true, rosterIncluded: false },
  };
}

export async function decideRealmLaunchApproval(db, sessionUser, {
  approvalId,
  decision,
  note,
  secret,
  now = new Date(),
} = {}) {
  requireDirector(sessionUser);
  if (!['approve', 'reject'].includes(decision)) {
    throw new RealmOperationError('Quyết định phê duyệt không hợp lệ.', 400, 'realm_launch_approval_decision_invalid');
  }
  return db.$transaction(async (tx) => {
    const approval = await tx.approval.findUnique({ where: { id: String(approvalId || '') } });
    if (!approval || approval.type !== 'realm_launch' || approval.status !== 'pending') {
      throw new RealmOperationError('Yêu cầu không tồn tại hoặc đã được xử lý.', 409, 'realm_launch_approval_stale');
    }
    if (approval.requesterId === sessionUser.id) {
      throw new RealmOperationError('Director tạo yêu cầu không được tự duyệt.', 409, 'self_approval_forbidden');
    }
    if (decision === 'reject') {
      const steps = decisionSteps(approval, sessionUser, decision, note, now);
      const claimed = await tx.approval.updateMany({
        where: { id: approval.id, status: 'pending', steps: approval.steps },
        data: { steps: JSON.stringify(steps), status: 'rejected', decidedAt: now },
      });
      if (claimed.count !== 1) {
        throw new RealmOperationError('Yêu cầu vừa được xử lý ở phiên khác. Hãy tải lại.', 409, 'approval_decision_stale');
      }
      await tx.auditLog.create({
        data: { userId: sessionUser.id, userName: sessionUser.name, action: 'reject', entity: 'approvals', refId: approval.id, detail: approval.title },
      });
      const updated = await tx.approval.findUnique({ where: { id: approval.id } });
      let rejectedProposal = null;
      try { rejectedProposal = openProposal(approval.payload, secret); } catch {}
      return { outcome: 'rejected', approval: safeApproval(updated, rejectedProposal), policy: null };
    }
    const proposal = openProposal(approval.payload, secret);
    if (proposal.requesterId !== approval.requesterId || realmLaunchPolicyDigest(proposal.draftPolicy) !== approval.refId) {
      throw new RealmOperationError('Nội dung phê duyệt không khớp bản yêu cầu.', 409, 'realm_launch_approval_payload_invalid');
    }
    if (new Date(proposal.expiresAt).getTime() <= now.getTime()) {
      return closeStaleApproval(tx, approval, sessionUser, proposal, 'Yêu cầu đã hết hạn 24 giờ', now);
    }

    const steps = decisionSteps(approval, sessionUser, decision, note, now);
    const setting = await tx.setting.findUnique({ where: { id: 1 }, select: { json: true } });
    const currentPolicy = parseRealmPilotConfig(setting?.json);
    if (proposal.draftPolicy.version !== currentPolicy.version
      || classifyRealmLaunchChange(currentPolicy, proposal.draftPolicy) !== 'expansion') {
      return closeStaleApproval(tx, approval, sessionUser, proposal, 'Policy nguồn đã thay đổi; yêu cầu cũ bị đóng', now);
    }
    const readiness = await loadRealmLaunchReadiness(tx, proposal.draftPolicy, now);
    if (!readiness.ready) {
      throw new RealmOperationError('Preflight vừa xuất hiện blocker mới. Policy chưa được thay đổi.', 409, 'realm_launch_readiness_stale');
    }

    const claimed = await tx.approval.updateMany({
      where: { id: approval.id, status: 'pending', steps: approval.steps },
      data: { steps: JSON.stringify(steps), status: 'approved', decidedAt: now },
    });
    if (claimed.count !== 1) {
      throw new RealmOperationError('Yêu cầu vừa được xử lý ở phiên khác. Hãy tải lại.', 409, 'approval_decision_stale');
    }
    const policy = await applyRealmPilotConfigInTransaction(tx, sessionUser, proposal.draftPolicy, {
      requireLaunchPreview: true,
      verifiedLaunchPreview: {
        ...proposal.preview,
        approvalId: approval.id,
        requesterId: approval.requesterId,
      },
    });
    await tx.auditLog.create({
      data: {
        userId: sessionUser.id,
        userName: sessionUser.name,
        action: 'approve',
        entity: 'approvals',
        refId: approval.id,
        detail: `${approval.title}; maker ${approval.requesterId}; checker ${sessionUser.id}; no roster`,
      },
    });
    const updated = await tx.approval.findUnique({ where: { id: approval.id } });
    return { outcome: 'approved', approval: safeApproval(updated, proposal), policy };
  }, { isolationLevel: 'Serializable' });
}
