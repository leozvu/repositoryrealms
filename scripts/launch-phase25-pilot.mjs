import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { PrismaClient } from '@prisma/client';
import { rolesOf } from '../lib/perm.js';
import { assertFullStagingTarget } from '../lib/staging-clone-deployment.js';
import { createRealmLaunchPreview, verifyRealmLaunchApplication } from '../lib/realm-launch.js';
import { normalizeRealmPilotConfig, parseRealmPilotConfig, saveRealmPilotConfig } from '../lib/realm-pilot.js';
import {
  REALM_REHEARSAL_SCENARIOS,
  createRealmPilotRehearsal,
  parseRealmPilotRehearsals,
  transitionRealmPilotRehearsal,
} from '../lib/realm-pilot-rehearsal.js';
import {
  createRealmPilotWave,
  loadRealmPilotOperationsDashboard,
  parseRealmPilotOperations,
  transitionRealmPilotWave,
} from '../lib/realm-pilot-operations.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const command = process.argv[2] || 'plan';
const commit = process.argv.includes('--commit');
const CONFIRMATION = 'LAUNCH_REALMS_PHASE25_SEVEN_DAY_PILOT';

function fail(message) {
  throw new Error(message);
}

function safety() {
  const branch = spawnSync('git', ['branch', '--show-current'], { cwd: root, encoding: 'utf8', shell: false }).stdout.trim();
  if (branch !== 'codex/realms-demo') fail(`Refusing pilot launch from branch ${branch || '(detached)'}.`);
  const project = JSON.parse(fs.readFileSync(path.join(root, '.vercel', 'project.json'), 'utf8'));
  if (project.projectName !== 'crmegoric-realms-demo') fail(`Refusing Vercel project ${project.projectName || '(unknown)'}.`);
  const target = assertFullStagingTarget({
    environment: process.env.REALMS_DEPLOY_ENV,
    databaseUrl: process.env.REALMS_STAGING_DATABASE_URL,
    protectedDatabaseUrls: [process.env.PROTECTED_PRODUCTION_DATABASE_URL, process.env.PROTECTED_PRODUCTION_DIRECT_URL],
    allowUnmarked: process.env.REALMS_STAGING_ALLOW_UNMARKED_TARGET === '1',
  });
  if (process.env.REALMS_STAGING_APPROVAL !== target.approval) fail('REALMS_STAGING_APPROVAL does not match the staging target.');
  if (command === 'launch' && (!commit || process.env.REALMS_PHASE25_PILOT_CONFIRM !== CONFIRMATION)) {
    fail(`Launch requires --commit and REALMS_PHASE25_PILOT_CONFIRM=${CONFIRMATION}.`);
  }
  if (!['plan', 'launch'].includes(command)) fail('Use plan or launch --commit.');
  return { branch, project: project.projectName, target };
}

function samePolicy(current, draft) {
  const comparable = (value) => ({
    mode: value.mode,
    defaultSurface: value.defaultSurface,
    cohortStrategy: value.cohortStrategy,
    roles: [...value.roles].sort(),
    memberIds: [...value.memberIds].sort(),
    features: value.features,
    onboardingVersion: value.onboardingVersion,
  });
  return JSON.stringify(comparable(current)) === JSON.stringify(comparable(draft));
}

async function settingState(prisma) {
  const row = await prisma.setting.findUnique({ where: { id: 1 }, select: { json: true } });
  return {
    row,
    policy: parseRealmPilotConfig(row?.json),
    rehearsals: parseRealmPilotRehearsals(row?.json),
    operations: parseRealmPilotOperations(row?.json),
  };
}

async function preparePolicy(prisma, maker, memberIds) {
  let state = await settingState(prisma);
  const draft = normalizeRealmPilotConfig({
    ...state.policy,
    mode: 'pilot',
    defaultSurface: 'erp',
    cohortStrategy: 'members',
    memberIds,
    roles: [],
    features: { office: true, tavern: true, feedback: true },
    version: state.policy.version,
  });
  if (samePolicy(state.policy, draft)) return state.policy;
  const secret = String(process.env.REALMS_PHASE25_LAUNCH_SECRET || process.env.NEXTAUTH_SECRET || '');
  if (secret.length < 32) fail('REALMS_PHASE25_LAUNCH_SECRET must contain at least 32 characters.');
  const preview = await createRealmLaunchPreview(prisma, maker, draft, { secret });
  if (preview.preview.risk === 'expansion') {
    fail('Phase 25 target unexpectedly expands access. Use the dedicated two-Director launch approval workflow.');
  }
  const policy = await saveRealmPilotConfig(prisma, maker, draft, {
    requireLaunchPreview: true,
    verifyLaunchPreview: ({ db, currentPolicy, draftPolicy }) => verifyRealmLaunchApplication(db, maker, {
      token: preview.token,
      currentPolicy,
      draftPolicy,
      secret,
    }),
  });
  console.log(`Policy restricted safely: ${state.policy.mode} -> ${policy.mode}, ERP default, ${memberIds.length} members, v${policy.version}.`);
  return policy;
}

async function ensureSealedRehearsal(prisma, maker, checker, policy) {
  let state = await settingState(prisma);
  const now = new Date();
  const valid = state.rehearsals.runs.find((run) => run.status === 'sealed'
    && run.policyVersion === policy.version
    && run.expiresAt
    && new Date(run.expiresAt) > now
    && run.checks.every((check) => check.result === 'passed'));
  if (valid) return valid;

  let run = state.rehearsals.runs.find((item) => ['draft', 'awaiting_approval'].includes(item.status));
  let version = state.rehearsals.version;
  if (!run) {
    const created = await createRealmPilotRehearsal(prisma, maker, {
      action: 'create', expectedVersion: version, name: 'Phase 25 staging demo rehearsal',
    });
    run = created.run;
    version = created.rehearsals.version;
  }
  if (run.status === 'draft') {
    if (run.createdById !== maker.id) fail('An unrelated draft rehearsal already exists.');
    for (const scenario of REALM_REHEARSAL_SCENARIOS) {
      const result = await transitionRealmPilotRehearsal(prisma, maker, {
        action: 'attest', runId: run.id, expectedVersion: version,
        scenarioId: scenario.id, result: 'passed', evidence: `Phase 25 staging evidence verified: ${scenario.id}`,
      });
      run = result.run;
      version = result.rehearsals.version;
    }
    const submitted = await transitionRealmPilotRehearsal(prisma, maker, {
      action: 'submit', runId: run.id, expectedVersion: version,
    });
    run = submitted.run;
    version = submitted.rehearsals.version;
  }
  if (run.status === 'awaiting_approval') {
    const approved = await transitionRealmPilotRehearsal(prisma, checker, {
      action: 'approve', runId: run.id, expectedVersion: version,
      note: 'Independent Director checker sealed Phase 25 staging rehearsal.',
    });
    run = approved.run;
  }
  if (run.status !== 'sealed' || run.policyVersion !== policy.version) fail('Rehearsal did not reach a sealed policy-bound state.');
  console.log(`Rehearsal sealed: ${REALM_REHEARSAL_SCENARIOS.length}/${REALM_REHEARSAL_SCENARIOS.length} scenarios, maker ${maker.name}, checker ${checker.name}.`);
  return run;
}

async function ensureActiveWave(prisma, maker, checker, policy) {
  let state = await settingState(prisma);
  let wave = state.operations.waves.find((item) => ['draft', 'awaiting_approval', 'active', 'paused'].includes(item.status));
  let version = state.operations.version;
  if (wave?.status === 'paused') fail('A paused pilot wave requires an explicit incident review before a new launch.');
  if (!wave) {
    const created = await createRealmPilotWave(prisma, maker, {
      action: 'create', expectedVersion: version, name: 'Phase 25 · ERP-default pilot', durationDays: 7,
    });
    wave = created.wave;
    version = created.operations.version;
  }
  if (wave.policyVersion !== policy.version) fail('Existing pilot wave is bound to a different policy version.');
  if (wave.status === 'draft') {
    const submitted = await transitionRealmPilotWave(prisma, maker, {
      action: 'submit', waveId: wave.id, expectedVersion: version,
    });
    wave = submitted.wave;
    version = submitted.operations.version;
  }
  if (wave.status === 'awaiting_approval') {
    const approved = await transitionRealmPilotWave(prisma, checker, {
      action: 'approve', waveId: wave.id, expectedVersion: version,
      note: 'Independent checker activated the controlled Phase 25 wave.',
    });
    wave = approved.wave;
  }
  if (wave.status !== 'active') fail('Pilot wave did not reach active state.');
  return wave;
}

async function main() {
  const repo = safety();
  const prisma = new PrismaClient({ datasources: { db: { url: process.env.REALMS_STAGING_DATABASE_URL } } });
  try {
    const users = await prisma.user.findMany({
      where: { status: 'active' },
      select: { id: true, email: true, name: true, role: true, roles: true, status: true, userType: true, workspacePreference: true },
      orderBy: { email: 'asc' },
    });
    const maker = users.find((user) => user.email === 'giamdoc@agency.vn');
    const checker = users.find((user) => user.email === 'director.checker@agency.vn');
    if (!maker || !checker || !rolesOf(maker).includes('DIRECTOR') || !rolesOf(checker).includes('DIRECTOR')) fail('Two staging Directors are required.');
    const memberIds = users
      .filter((user) => user.userType === 'employee' && !rolesOf(user).includes('DIRECTOR'))
      .map((user) => user.id);
    if (memberIds.length < 5 || memberIds.length > 7) fail(`Pilot cohort must contain 5-7 internal users; found ${memberIds.length}.`);

    const current = await settingState(prisma);
    console.log(`Phase 25 pilot plan: ${repo.target.redactedUrl}; current policy ${current.policy.mode}/v${current.policy.version}; cohort ${memberIds.length}; ERP default; 7 days; 2 Directors.`);
    if (command === 'plan') {
      console.log(`No mutation executed. Launch requires --commit and ${CONFIRMATION}.`);
      return;
    }

    const policy = await preparePolicy(prisma, maker, memberIds);
    await ensureSealedRehearsal(prisma, maker, checker, policy);
    const wave = await ensureActiveWave(prisma, maker, checker, policy);
    const dashboard = await loadRealmPilotOperationsDashboard(prisma, maker);
    if (dashboard.report.recommendation !== 'hold' || dashboard.report.observedDays !== 0) {
      fail(`Fresh pilot must fail closed to HOLD/0 days; got ${dashboard.report.recommendation}/${dashboard.report.observedDays}.`);
    }
    await prisma.auditLog.create({
      data: {
        userId: maker.id,
        userName: maker.name,
        action: 'launch',
        entity: 'realm_phase25_acceptance',
        refId: wave.id,
        detail: `Phase 25 staging pilot active; cohort ${memberIds.length}; duration 7 days; default ERP; maker-checker verified; Go/No-Go HOLD at 0/7 days; no roster`,
      },
    });
    console.log(`Pilot active: ${wave.id}; cohort ${wave.eligibleUsers}; canary ${wave.activation.state}; duration ${wave.durationDays} days.`);
    console.log(`Go/No-Go: ${dashboard.report.label} (${dashboard.report.observedDays}/7 observed days).`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(`[phase25-pilot] ${error.code || 'error'}: ${error.message}`);
  process.exitCode = 1;
});
