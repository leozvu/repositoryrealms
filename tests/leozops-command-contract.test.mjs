import assert from 'node:assert/strict';
import test from 'node:test';
import {
  LEOZOPS_COMMAND_CONFIRM_CONTRACT,
  LEOZOPS_COMMAND_CONTRACT,
  LEOZOPS_RUNTIME_CONTRACT,
  capabilityById,
  capabilityProjection,
  normalizeCommandConfirmation,
  normalizeCommandIntent,
  normalizeRuntimeCommand,
  projectRuntime,
} from '../lib/leozops/command-contract.js';

const followup = () => ({
  contract: LEOZOPS_COMMAND_CONTRACT,
  version: 1,
  proposal_id: 'proposal_1',
  capability: 'lead.followup.create',
  target_ref: 'lead_1',
  parameters: { kind: 'call', title: 'Theo dõi tiến độ lead', date: '2026-07-30' },
});

test('command intent contract is exact, capability-bound and rejects PII-bearing follow-up titles', () => {
  const normalized = normalizeCommandIntent(followup());
  assert.equal(normalized.capability.repositoryAction, 'lead.followup.create');
  assert.deepEqual(normalized.capability.proposalActionTypes, ['review_aging_leads']);
  assert.throws(() => normalizeCommandIntent({ ...followup(), unknown: true }), error => error.code === 'leozops_command_unknown_field');
  assert.throws(() => normalizeCommandIntent({
    ...followup(), parameters: { ...followup().parameters, title: 'Gọi +84 912 345 678' },
  }), error => error.code === 'leozops_command_title_sensitive');
  assert.throws(() => normalizeCommandIntent({
    ...followup(), capability: 'lead.delete',
  }), error => error.code === 'leozops_command_capability_unsupported');
});

test('confirmation and runtime controls require explicit exact contracts', () => {
  const confirmation = normalizeCommandConfirmation({
    contract: LEOZOPS_COMMAND_CONFIRM_CONTRACT, version: 1,
    intent_id: 'intent_1', confirmation_token: 'a'.repeat(32), confirm: true,
  });
  assert.equal(confirmation.intentId, 'intent_1');
  assert.throws(() => normalizeCommandConfirmation({
    contract: LEOZOPS_COMMAND_CONFIRM_CONTRACT, version: 1,
    intent_id: 'intent_1', confirmation_token: 'a'.repeat(32), confirm: false,
  }), error => error.code === 'leozops_command_confirmation_invalid');
  assert.deepEqual(normalizeRuntimeCommand({
    contract: LEOZOPS_RUNTIME_CONTRACT, version: 1, action: 'kill', expected_version: 3,
  }), { action: 'kill', expectedVersion: 3, dailyActionLimit: undefined });
  assert.throws(() => normalizeRuntimeCommand({
    contract: LEOZOPS_RUNTIME_CONTRACT, version: 1, action: 'activate', expected_version: 0, daily_action_limit: 101,
  }), error => error.code === 'leozops_runtime_limit_invalid');
});

test('capabilities and runtime remain fail-closed without every deployment and database gate', () => {
  const capability = capabilityById('lead.source.update');
  assert.equal(capabilityProjection(capability, {}).enabled, false);
  assert.deepEqual(projectRuntime(null, { LEOZOPS_COMMAND_ENABLED: 'true', LEOZOPS_EXECUTION_ENABLED: 'true' }), {
    configured: false,
    command_plane_enabled: true,
    deployment_execution_enabled: true,
    execution_enabled: false,
    kill_switch_active: true,
    daily_action_limit: 0,
    circuit_state: 'closed',
    circuit_retry_at: null,
    record_version: 0,
  });
});
