/* Provision CEO Terminal (deployment riêng của group) — chạy với DATABASE_URL trỏ schema ceoportal.
   - Tạo Setting + tài khoản CEO & tài khoản Duyệt độc lập (KHÔNG demo data)
   - Upsert danh bạ entity (registry) + trạng thái rollout + identity/membership
   - Seed evidence rollout từ backup THẬT (checksum sha256 file backup)
   Idempotent: chạy lại không phá dữ liệu.

   ENV: DATABASE_URL (ceoportal) · PORTAL_CEO_EMAIL/PASS/NAME · PORTAL_CHECKER_EMAIL/PASS
        BACKUP_DIR (thư mục backups/<timestamp> để lấy checksum)
        RINGS=<entityId>:<ring>:<status>,... (vd crmtest:commands:active)
        MEMBERSHIPS=<entityId>:<localDirectorEmail>,...  */
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const now = new Date();
const plus29d = new Date(now.getTime() + 29 * 86400000);

const ENTITIES = [
  { id: 'crmtest', displayName: 'Sandbox Test', baseUrl: 'https://erp-crm-test.vercel.app', businessProfile: 'agency', environment: 'staging', backupFile: 'crmtest.json' },
  { id: 'aim', displayName: 'AIm Agency', baseUrl: 'https://agency-erp-mu.vercel.app', businessProfile: 'agency', environment: 'production', backupFile: 'public.json' },
  { id: 'egoric', displayName: 'Egoric Agency', baseUrl: 'https://erp-egoric.vercel.app', businessProfile: 'agency', environment: 'production', backupFile: 'egoric.json' },
  { id: 'vnecom', displayName: 'Vnecom LLC', baseUrl: 'https://erp-vnecom.vercel.app', businessProfile: 'agency', environment: 'production', backupFile: 'vnecom.json' },
  { id: 'egolive', displayName: 'Egolive (livestream)', baseUrl: 'https://erp-egolive.vercel.app', businessProfile: 'livestream', environment: 'production', backupFile: 'egolive.json' },
  // Fretas thuộc đơn vị khác (chỉ đạo 23/7/2026) — KHÔNG nối vào terminal. Registry row cũ
  // (nếu có) bị vô hiệu bởi bước disable trong lần provision kế tiếp, không xuất hiện ở đây.
];
const RING_ORDER = ['local_staging', 'read_only', 'ceo_sso', 'messaging', 'commands'];
const BASE_KINDS = ['backup', 'restore_test', 'canary', 'reconciliation', 'rollback'];
const RING_EXTRA = { ceo_sso: ['security_review'], messaging: ['privacy_review'], commands: ['maker_checker'] };

const env = (k, d) => (process.env[k] ?? d);
const sha256File = f => 'sha256:' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex');

// ---- 1. Setting + tài khoản portal (không demo) ----
const setting = await prisma.setting.findUnique({ where: { id: 1 } });
const json = setting ? JSON.parse(setting.json) : {};
await prisma.setting.upsert({ where: { id: 1 }, update: { json: JSON.stringify({ ...json, company: 'Leoz Group — CEO Terminal' }) }, create: { id: 1, json: JSON.stringify({ company: 'Leoz Group — CEO Terminal' }) } });

async function upsertDirector(emailKey, passKey, nameDefault) {
  const email = env(emailKey);
  const pass = env(passKey);
  if (!email || !pass) throw new Error(`Thiếu ${emailKey}/${passKey}`);
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) return existing;
  return prisma.user.create({ data: {
    email, name: env(emailKey + '_NAME', nameDefault), role: 'DIRECTOR', roles: '["DIRECTOR"]',
    passwordHash: bcrypt.hashSync(pass, 10), status: 'active',
  } });
}
const ceo = await upsertDirector('PORTAL_CEO_EMAIL', 'PORTAL_CEO_PASS', 'Vũ Lương Sơn');
const checker = await upsertDirector('PORTAL_CHECKER_EMAIL', 'PORTAL_CHECKER_PASS', 'Duyệt độc lập (Group)');
if (!(await prisma.conversation.findFirst({ where: { type: 'general' } }))) {
  await prisma.conversation.create({ data: { type: 'general', name: 'Kênh chung' } });
}

// ---- 2. Registry ----
for (const e of ENTITIES) {
  const up = String(e.id).toUpperCase();
  await prisma.ceoEntityRegistry.upsert({
    where: { id: e.id },
    update: { displayName: e.displayName, baseUrl: e.baseUrl, businessProfile: e.businessProfile, environment: e.environment },
    create: {
      id: e.id, displayName: e.displayName, baseUrl: e.baseUrl, businessProfile: e.businessProfile,
      environment: e.environment, enabled: false, status: 'unverified',
      credentialRef: `CEO_ENTITY_${up}_API_KEY`, serviceCredentialRef: `CEO_ENTITY_${up}_SERVICE_KEY`,
    },
  });
}

// ---- 3. Rollout states + evidence (theo RINGS=...) ----
const ringSpec = Object.fromEntries(env('RINGS', '').split(',').filter(Boolean).map(x => { const [id, ring, status] = x.split(':'); return [id, { ring, status: status || 'active' }]; }));
const backupDir = env('BACKUP_DIR', '');
for (const e of ENTITIES) {
  const spec = ringSpec[e.id] || { ring: 'local_staging', status: 'hold' };
  await prisma.ceoRolloutState.upsert({
    where: { entityId: e.id },
    update: { currentRing: spec.ring, status: spec.status, lastTransitionAt: now },
    create: { entityId: e.id, currentRing: spec.ring, status: spec.status, lastTransitionAt: now },
  });
  // evidence THẬT: checksum file backup của schema tương ứng cho mọi ring đã đi qua
  if (backupDir && spec.ring !== 'local_staging') {
    const file = path.join(backupDir, e.backupFile);
    if (fs.existsSync(file)) {
      const checksum = sha256File(file);
      const upTo = RING_ORDER.indexOf(spec.ring);
      for (const ring of RING_ORDER.slice(1, upTo + 1)) {
        for (const kind of [...BASE_KINDS, ...(RING_EXTRA[ring] || []), ...(e.id === 'egolive' && ring === 'commands' ? ['finance_review'] : [])]) {
          const recorder = kind === 'maker_checker' || kind === 'finance_review' ? checker : ceo;
          await prisma.ceoRolloutEvidence.upsert({
            where: { entityId_ring_kind_checksum: { entityId: e.id, ring, kind, checksum } },
            update: { observedAt: now, expiresAt: plus29d },
            create: {
              entityId: e.id, ring, kind, checksum,
              reference: `artifact:backups/${path.basename(backupDir)}/${e.backupFile}#${kind}`,
              observedAt: now, expiresAt: plus29d, recordedById: recorder.id, recordedByName: recorder.name,
            },
          });
        }
      }
    } else {
      console.warn(`⚠ thiếu backup ${file} — bỏ qua evidence cho ${e.id}`);
    }
  }
}

// ---- 4. Identity + membership (theo MEMBERSHIPS=...) ----
const identity = await prisma.ceoGlobalIdentity.upsert({
  where: { userId: ceo.id },
  update: { email: ceo.email, displayName: ceo.name, status: 'active' },
  // subject PHẢI dạng ceo_<...> (gạch dưới) — entity-side federation regex ^ceo_ từ chối dạng khác
  create: { subject: 'ceo_' + crypto.createHash('sha256').update(ceo.email).digest('hex').slice(0, 16), userId: ceo.id, email: ceo.email, displayName: ceo.name, status: 'active' },
});
for (const pair of env('MEMBERSHIPS', '').split(',').filter(Boolean)) {
  const [entityId, localEmail] = pair.split(':');
  await prisma.ceoEntityMembership.upsert({
    where: { identityId_entityId: { identityId: identity.id, entityId } },
    update: { localUserEmail: localEmail, localRole: 'DIRECTOR', status: 'active' },
    create: { identityId: identity.id, entityId, localUserEmail: localEmail, localRole: 'DIRECTOR', status: 'active' },
  });
}

// ---- 5. Bật entity có đủ ring > local_staging ----
for (const [id, spec] of Object.entries(ringSpec)) {
  if (spec.ring !== 'local_staging') {
    await prisma.ceoEntityRegistry.update({ where: { id }, data: { enabled: true, status: 'ready' } });
  }
}

const states = await prisma.ceoRolloutState.findMany();
console.log('PORTAL PROVISIONED:', JSON.stringify({ ceo: ceo.email, checker: checker.email, states: states.map(s => `${s.entityId}=${s.currentRing}/${s.status}`) }));
await prisma.$disconnect();
