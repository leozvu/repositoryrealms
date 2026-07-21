import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import bcrypt from 'bcryptjs';
import { PrismaClient } from '@prisma/client';
import { assertFullStagingTarget } from '../lib/staging-clone-deployment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIRMATION = 'RECONCILE_REALMS_PHASE25_STAGING_IDENTITIES';
const USERS = Object.freeze([
  { email: 'giamdoc@agency.vn', name: 'Vũ Lương Sơn', role: 'DIRECTOR', title: 'Founder / CEO', userType: 'employee' },
  { email: 'director.checker@agency.vn', name: 'Nguyễn Minh Quân', role: 'DIRECTOR', title: 'Director / Independent Checker', userType: 'employee' },
  { email: 'ketoan@agency.vn', name: 'Phạm Thu Hà', role: 'ACCOUNTANT', title: 'Kế toán trưởng', userType: 'employee' },
  { email: 'am@agency.vn', name: 'Trần Khánh Linh', role: 'AM', title: 'Account Manager', userType: 'employee' },
  { email: 'pm@agency.vn', name: 'Nguyễn Minh An', role: 'PM', title: 'Project Manager', userType: 'employee' },
  { email: 'hr@agency.vn', name: 'Lê Ngọc Mai', role: 'HR', title: 'HR Executive', userType: 'employee' },
  { email: 'truongnhom@agency.vn', name: 'Đỗ Quốc Anh', role: 'LEAD', title: 'Trưởng nhóm Sáng tạo', userType: 'employee' },
  { email: 'nhanvien@agency.vn', name: 'Hoàng Gia Hân', role: 'STAFF', title: 'Designer', userType: 'employee' },
  { email: 'freelancer@agency.vn', name: 'Đặng Hải Nam', role: 'FREELANCER', title: 'Freelancer', userType: 'freelancer' },
]);

function fail(message) {
  throw new Error(message);
}

function safety() {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', shell: false }).stdout.trim();
  if (branch !== 'codex/realms-demo') fail(`Refusing identity reconciliation from branch ${branch || '(detached)'}.`);
  const project = JSON.parse(fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8'));
  if (project.projectName !== 'crmegoric-realms-demo') fail(`Refusing Vercel project ${project.projectName || '(unknown)'}.`);
  const resolved = assertFullStagingTarget({
    environment: process.env.REALMS_DEPLOY_ENV,
    databaseUrl: process.env.REALMS_STAGING_DATABASE_URL,
    protectedDatabaseUrls: [process.env.PROTECTED_PRODUCTION_DATABASE_URL, process.env.PROTECTED_PRODUCTION_DIRECT_URL],
    allowUnmarked: process.env.REALMS_STAGING_ALLOW_UNMARKED_TARGET === '1',
  });
  if (process.env.REALMS_STAGING_APPROVAL !== resolved.approval) fail('REALMS_STAGING_APPROVAL does not match the staging target.');
  if (process.env.REALMS_STAGING_IDENTITY_CONFIRM !== CONFIRMATION) fail(`Set REALMS_STAGING_IDENTITY_CONFIRM=${CONFIRMATION}.`);
  const password = String(process.env.REALMS_STAGING_DEMO_PASSWORD || '');
  if (password.length < 16) fail('REALMS_STAGING_DEMO_PASSWORD must contain at least 16 characters.');
  return { resolved, password };
}

async function main() {
  const { resolved, password } = safety();
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.REALMS_STAGING_DATABASE_URL } } });
  const passwordHash = await bcrypt.hash(password, 10);
  try {
    await prisma.$transaction(async (tx) => {
      for (const identity of USERS) {
        const data = {
          name: identity.name,
          role: identity.role,
          roles: JSON.stringify([identity.role]),
          title: identity.title,
          userType: identity.userType,
          status: 'active',
          workspacePreference: 'erp',
          passwordHash,
          totpSecret: null,
          loginFails: 0,
          lockedUntil: null,
        };
        await tx.user.upsert({
          where: { email: identity.email },
          create: { email: identity.email, ...data },
          update: data,
        });
      }
      const ceo = await tx.user.findUnique({ where: { email: 'giamdoc@agency.vn' }, select: { id: true, name: true } });
      await tx.auditLog.create({
        data: {
          userId: ceo.id,
          userName: ceo.name,
          action: 'reconcile',
          entity: 'realm_phase25_staging_identities',
          detail: `Phase 25 staging-only identity reconciliation; ${USERS.length} named demo accounts; two-director maker-checker; password omitted; target ${resolved.database}/${resolved.schema}`,
        },
      });
    }, { isolationLevel: 'Serializable' });

    const active = await prisma.user.findMany({
      where: { status: 'active' },
      select: { email: true, name: true, role: true, roles: true, userType: true, workspacePreference: true },
      orderBy: { email: 'asc' },
    });
    const expectedEmails = new Set(USERS.map((user) => user.email));
    const expected = active.filter((user) => expectedEmails.has(user.email));
    const unexpected = active.filter((user) => !expectedEmails.has(user.email));
    const directors = expected.filter((user) => JSON.parse(user.roles || '[]').includes('DIRECTOR'));
    if (expected.length !== USERS.length || directors.length !== 2) fail(`Identity verification failed (expected=${expected.length}/${USERS.length}, directors=${directors.length}/2).`);
    if (expected.some((user) => user.workspacePreference !== 'erp')) fail('ERP-default preference verification failed.');
    console.log(`Phase 25 staging identities ready: ${expected.length} accounts, ${directors.length} Directors, shared credential rotated, ERP remains default.`);
    console.log(`Unexpected active accounts preserved for review: ${unexpected.length}. No account or business record was deleted.`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[phase25-identities] ${error.message}`);
  process.exitCode = 1;
});
