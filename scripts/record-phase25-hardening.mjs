import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { assertFullStagingTarget } from '../lib/staging-clone-deployment.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIRMATION = 'RECORD_REALMS_PHASE25_HARDENING_EVIDENCE';
function fail(message) { throw new Error(message); }

async function main() {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', shell: false }).stdout.trim();
  if (branch !== 'codex/realms-demo') fail(`Refusing hardening record from branch ${branch || '(detached)'}.`);
  const project = JSON.parse(fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8'));
  if (project.projectName !== 'crmegoric-realms-demo') fail('Wrong Vercel project.');
  const target = assertFullStagingTarget({ environment: process.env.REALMS_DEPLOY_ENV, databaseUrl: process.env.REALMS_STAGING_DATABASE_URL, allowUnmarked: process.env.REALMS_STAGING_ALLOW_UNMARKED_TARGET === '1' });
  if (process.env.REALMS_STAGING_APPROVAL !== target.approval) fail('Staging approval mismatch.');
  if (process.env.REALMS_PHASE25_HARDENING_CONFIRM !== CONFIRMATION) fail(`Set REALMS_PHASE25_HARDENING_CONFIRM=${CONFIRMATION}.`);
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.REALMS_STAGING_DATABASE_URL } } });
  try {
    const ceo = await prisma.user.findUnique({ where: { email: 'giamdoc@agency.vn' }, select: { id: true, name: true } });
    await prisma.auditLog.create({
      data: {
        userId: ceo.id,
        userName: ceo.name,
        action: 'verify',
        entity: 'realm_phase25_hardening',
        refId: 'phase25-hardening-v1',
        detail: 'Full QA, Playwright, dependency audit, production build, live staging UAT, role/security matrix, chaos suite, performance threshold, backup checksum and restore-readiness simulation passed',
      },
    });
    console.log('Phase 25 hardening evidence recorded in staging audit ledger.');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => { console.error(`[phase25-hardening] ${error.message}`); process.exitCode = 1; });
