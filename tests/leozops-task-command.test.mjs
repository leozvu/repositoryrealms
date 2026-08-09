import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import {
  LEOZOPS_TASK_COMMAND_CONTRACT,
  LEOZOPS_TASK_COMMAND_KEY,
  LEOZOPS_TASK_COMMAND_PATH,
  normalizeLeozOpsTaskCommand,
} from '../lib/leozops-task-command.js';
import { executeLeozOpsTaskCommand } from '../lib/leozops-task-command-admin.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const NOW = new Date('2026-08-08T12:00:00.000Z');
const DIRECTOR = { id: 'apikey:test', name: 'LeozOps service', roles: ['DIRECTOR'] };
const PAYLOAD = { title: 'Review stalled opportunities', note: null, dueDate: '2026-08-12', priority: 'high', estHours: 2 };

function envelope(operation, actorSubject, overrides = {}) {
  return {
    contract: LEOZOPS_TASK_COMMAND_CONTRACT,
    version: 1,
    operation,
    targetEntityId: 'egoric',
    actorSubject,
    idempotencyKey: `leozops:${operation}:idempotency:0001`,
    correlationId: `leozops:${operation}:correlation:0001`,
    ...overrides,
  };
}

function context(credentialId) {
  return { entityId: 'egoric', enabledCapabilities: ['delivery'], credentialId };
}

function memoryDb() {
  const state = { approvals: [], commands: [], tasks: [], audits: [], changes: [] };
  let id = 0;
  const byUnique = (rows, where) => {
    const [key, value] = Object.entries(where)[0] || [];
    return rows.find((row) => row[key] === value) || null;
  };
  const apply = (row, data) => Object.assign(row, data);
  const db = {
    $transaction: async (fn) => fn(db),
    leozOpsTaskCommandApproval: {
      findUnique: async ({ where }) => byUnique(state.approvals, where),
      create: async ({ data }) => {
        const row = { id: `approval-${++id}`, ...data, consumedAt: null, consumedByCommandId: null, createdAt: NOW };
        state.approvals.push(row);
        return row;
      },
      update: async ({ where, data }) => apply(byUnique(state.approvals, where), data),
    },
    leozOpsTaskCommand: {
      findUnique: async ({ where }) => byUnique(state.commands, where),
      findFirst: async ({ where }) => state.commands.find((row) => row.targetEntityId === where.targetEntityId
        && where.OR.some((condition) => Object.entries(condition).every(([key, value]) => row[key] === value))) || null,
      create: async ({ data }) => {
        const row = {
          id: `command-${++id}`,
          ...data,
          rollbackReceiptId: null,
          rollbackIdempotencyKey: null,
          rollbackCorrelationId: null,
          rollbackActorSubject: null,
          rollbackRequestFingerprint: null,
          rollbackPreviewFingerprint: null,
          rollbackApprovalId: null,
          rollbackResultFingerprint: null,
          rollbackCredentialId: null,
          rolledBackAt: null,
        };
        state.commands.push(row);
        return row;
      },
      update: async ({ where, data }) => apply(byUnique(state.commands, where), data),
    },
    task: {
      create: async ({ data }) => {
        const row = {
          id: `task-${++id}`,
          ...data,
          dependsOn: '[]', checklist: '[]', recur: null, phaseId: null, labels: '[]', statusSince: null,
          queuePosition: 0, workVersion: 1, workType: null, complexity: null, blockReason: null,
          blockedAt: null, waitingReason: null, escalationLevel: 0, escalatedAt: null,
          parentTaskId: null, mergedIntoTaskId: null, createdAt: NOW, updatedAt: NOW, completedAt: null,
        };
        state.tasks.push(row);
        return row;
      },
      findUnique: async ({ where }) => byUnique(state.tasks, where),
      deleteMany: async ({ where }) => {
        const index = state.tasks.findIndex((row) => row.id === where.id && row.updatedAt === where.updatedAt);
        if (index < 0) return { count: 0 };
        state.tasks.splice(index, 1);
        return { count: 1 };
      },
      count: async () => 0,
    },
    taskEvent: { count: async () => 0 },
    taskComment: { count: async () => 0 },
    timeLog: { count: async () => 0 },
    workItemEvent: { count: async () => 0 },
    workEstimateRevision: { count: async () => 0 },
    realmQuestConfig: { count: async () => 0 },
    realmGoldEntry: { count: async () => 0 },
    realmChangeEvent: { create: async ({ data }) => { state.changes.push(data); return data; } },
    auditLog: { create: async ({ data }) => { state.audits.push(data); return data; } },
  };
  return { db, state };
}

test('dedicated task contract is exact, unassigned and rejects contact data', () => {
  const command = normalizeLeozOpsTaskCommand(envelope('preview', 'planner_subject', { payload: PAYLOAD }));
  assert.equal(command.payload.title, PAYLOAD.title);
  assert.equal(command.payload.note, null);
  assert.throws(
    () => normalizeLeozOpsTaskCommand(envelope('preview', 'planner_subject', { payload: { ...PAYLOAD, projectId: 'project-1' } })),
    (error) => error.code === 'leozops_task_unknown_or_missing_field',
  );
  assert.throws(
    () => normalizeLeozOpsTaskCommand(envelope('preview', 'planner_subject', { payload: { ...PAYLOAD, note: 'Call ceo@example.test' } })),
    (error) => error.code === 'leozops_task_note_invalid',
  );
  assert.throws(
    () => normalizeLeozOpsTaskCommand(envelope('preview', 'planner_subject', { payload: { ...PAYLOAD, estHours: '2' } })),
    (error) => error.code === 'leozops_task_estimated_hours_invalid',
  );
});

test('preview is deterministic and performs zero business or evidence mutations', async () => {
  const memory = memoryDb();
  const input = envelope('preview', 'planner_subject', { payload: PAYLOAD });
  const first = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, input, NOW, context('credential-preview'));
  const second = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, input, new Date(NOW.getTime() + 1_000), context('credential-preview'));
  assert.equal(first.commandKey, LEOZOPS_TASK_COMMAND_KEY);
  assert.equal(first.preview.previewFingerprint, second.preview.previewFingerprint);
  assert.equal(first.preview.externalMutationCount, 0);
  assert.deepEqual({
    tasks: memory.state.tasks.length,
    approvals: memory.state.approvals.length,
    commands: memory.state.commands.length,
    audits: memory.state.audits.length,
    changes: memory.state.changes.length,
  }, { tasks: 0, approvals: 0, commands: 0, audits: 0, changes: 0 });
});

test('execute and rollback require independent approvals and operators, then remain idempotent', async () => {
  const memory = memoryDb();
  const previewInput = envelope('preview', 'planner_subject', { payload: PAYLOAD });
  const preview = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, previewInput, NOW, context('credential-preview'));
  const approveInput = envelope('approve_execute', 'execute_approver', {
    payload: PAYLOAD,
    previewFingerprint: preview.preview.previewFingerprint,
  });
  const approval = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, approveInput, NOW, context('credential-approve-execute'));
  const executeInput = envelope('execute', 'execute_operator', { payload: PAYLOAD, approvalId: approval.approval.id });
  await assert.rejects(
    executeLeozOpsTaskCommand(memory.db, DIRECTOR, executeInput, NOW, context('credential-approve-execute')),
    (error) => error.code === 'leozops_task_approval_separation_required',
  );
  const executed = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, executeInput, NOW, context('credential-execute'));
  assert.equal(executed.receipt.operation, 'execute');
  assert.equal(executed.receipt.externalMutationCount, 1);
  assert.equal(memory.state.tasks.length, 1);
  const replayed = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, executeInput, NOW, context('credential-execute'));
  assert.equal(replayed.receipt.replayed, true);
  assert.equal(memory.state.tasks.length, 1);
  await assert.rejects(
    executeLeozOpsTaskCommand(memory.db, DIRECTOR, executeInput, NOW, context('credential-other-executor')),
    (error) => error.code === 'leozops_task_idempotency_conflict',
  );

  const commandId = executed.receipt.commandId;
  const rollbackPreviewInput = envelope('preview_rollback', 'rollback_planner', { commandId });
  const rollbackPreview = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, rollbackPreviewInput, NOW, context('credential-rollback-preview'));
  assert.equal(rollbackPreview.preview.externalMutationCount, 0);
  const rollbackApproveInput = envelope('approve_rollback', 'rollback_approver', {
    commandId,
    previewFingerprint: rollbackPreview.preview.previewFingerprint,
  });
  const rollbackApproval = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, rollbackApproveInput, NOW, context('credential-rollback-approve'));
  const rollbackInput = envelope('rollback', 'rollback_operator', { commandId, approvalId: rollbackApproval.approval.id });
  const rolledBack = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, rollbackInput, NOW, context('credential-rollback-execute'));
  assert.equal(rolledBack.receipt.operation, 'rollback');
  assert.equal(rolledBack.state, 'rolled_back');
  assert.equal(memory.state.tasks.length, 0);
  const rollbackReplay = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, rollbackInput, NOW, context('credential-rollback-execute'));
  assert.equal(rollbackReplay.receipt.replayed, true);
  assert.equal(memory.state.tasks.length, 0);
  assert.equal(memory.state.audits.some((entry) => JSON.stringify(entry).includes(PAYLOAD.title)), false);
});

test('rollback fails closed after the created task changes', async () => {
  const memory = memoryDb();
  const preview = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, envelope('preview', 'planner_subject', { payload: PAYLOAD }), NOW, context('credential-preview'));
  const approval = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, envelope('approve_execute', 'execute_approver', {
    payload: PAYLOAD, previewFingerprint: preview.preview.previewFingerprint,
  }), NOW, context('credential-approve-execute'));
  const executed = await executeLeozOpsTaskCommand(memory.db, DIRECTOR, envelope('execute', 'execute_operator', {
    payload: PAYLOAD, approvalId: approval.approval.id,
  }), NOW, context('credential-execute'));
  memory.state.tasks[0].title = 'Human-edited task';
  await assert.rejects(
    executeLeozOpsTaskCommand(memory.db, DIRECTOR, envelope('preview_rollback', 'rollback_planner', {
      commandId: executed.receipt.commandId,
    }), NOW, context('credential-rollback-preview')),
    (error) => error.code === 'leozops_task_rollback_state_changed',
  );
  assert.equal(memory.state.tasks.length, 1);
});

test('route and service scopes expose only the dedicated command surface', () => {
  const route = fs.readFileSync(path.join(root, 'app/api/integrations/leozops/v1/commands/create-task/route.js'), 'utf8');
  const receipts = fs.readFileSync(path.join(root, 'app/api/integrations/leozops/v1/commands/create-task/receipts/route.js'), 'utf8');
  const auth = fs.readFileSync(path.join(root, 'lib/ceo-service-auth.js'), 'utf8');
  const schema = fs.readFileSync(path.join(root, 'prisma/schema.prisma'), 'utf8');
  const migration = fs.readFileSync(path.join(root, 'prisma/migrations/20260808010000_add_leozops_task_command_contract/migration.sql'), 'utf8');
  assert.equal(LEOZOPS_TASK_COMMAND_PATH, '/api/integrations/leozops/v1/commands/create-task');
  assert.match(route, /LEOZOPS_TASK_ROLLBACK_APPROVE/);
  assert.match(route, /LEOZOPS_TASK_COMMAND_ENABLED/);
  assert.match(route, /assertLeozOpsTaskCommandRequestHeaders/);
  assert.match(receipts, /LEOZOPS_TASK_RECEIPTS_READ/);
  assert.match(auth, /leozops\.task\.create\.execute/);
  assert.match(auth, /leozops\.task\.create\.rollback\.execute/);
  assert.match(schema, /model LeozOpsTaskCommandApproval/);
  assert.match(schema, /model LeozOpsTaskCommand/);
  assert.doesNotMatch(migration, /"payload"\s+TEXT/);
  assert.doesNotMatch(route, /prisma\.(task|project|user)\./);
  assert.doesNotMatch(route, /\/api\/ceo\/v1\/commands/);
});
