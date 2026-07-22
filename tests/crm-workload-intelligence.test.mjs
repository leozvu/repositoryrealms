import assert from 'node:assert/strict';
import test from 'node:test';
import { buildCrmWorkloadIntelligence, CRM_WORKLOAD_RULE_VERSION } from '../lib/crm-workload-intelligence.js';

const now = new Date('2026-07-20T12:00:00.000Z');

test('CRM phân loại active, stale, dormant và decided từ Lead + recorded Activity', () => {
  const result = buildCrmWorkloadIntelligence({
    leads: [
      { id: 'active', name: 'An', company: 'Active Co', stage: 'proposal', ownerId: 'u2', createdAt: '2026-07-10', expectedClose: '2026-07-30', email: 'a@example.com', source: 'Website', value: 1000 },
      { id: 'stale', name: 'Bình', company: 'Stale Co', stage: 'new', ownerId: null, createdAt: '2026-07-10', phone: '0900', source: 'Referral', value: 2000 },
      { id: 'dormant', name: 'Chi', company: 'Dormant Co', stage: 'contacted', ownerId: 'u1', createdAt: '2026-06-01', email: 'secret@example.com', source: 'Event', value: 3000 },
      { id: 'won', name: 'Duy', company: 'Won Co', stage: 'won', ownerId: 'u1', createdAt: '2026-06-01', value: 4000 },
      { id: 'lost', name: 'Em', company: 'Lost Co', stage: 'lost', ownerId: 'u1', createdAt: '2026-06-01', value: 5000 },
    ],
    activities: [
      { id: 'a1', refId: 'active', date: '2026-07-19', done: true, kind: 'call' },
      { id: 'a2', refId: 'stale', date: '2026-07-18', done: false, kind: 'meeting' },
    ],
    owners: [{ id: 'u1', name: 'An Owner' }, { id: 'u2', name: 'Bình Owner' }],
    now,
    policy: { ownerWipLimit: 1 },
  });

  assert.equal(result.ruleVersion, CRM_WORKLOAD_RULE_VERSION);
  assert.equal(result.leads.find((lead) => lead.id === 'active').lifecycle.band, 'active');
  assert.equal(result.leads.find((lead) => lead.id === 'stale').lifecycle.band, 'stale');
  assert.equal(result.leads.find((lead) => lead.id === 'dormant').lifecycle.band, 'dormant');
  assert.equal(result.leads.find((lead) => lead.id === 'won').lifecycle.band, 'decided');
  assert.equal(result.summary.deadLeads, 1);
  assert.equal(result.summary.unassignedLeads, 1);
  assert.equal(result.summary.overdueFollowups, 1);
  assert.equal(result.summary.weightedForecast, 1_200);
  assert.equal(result.leads.find((lead) => lead.id === 'active').lastTouch.source, 'recorded_completed_activity');
  assert.equal(result.leads.find((lead) => lead.id === 'active').lastTouch.isObservedTruth, false);
  assert.equal(JSON.stringify(result).includes('secret@example.com'), false);
});

test('Owner workload sắp alphabet, dùng explicit WIP và không tạo employee ranking', () => {
  const result = buildCrmWorkloadIntelligence({
    leads: [
      { id: 'l1', name: 'Lead 1', stage: 'proposal', ownerId: 'z', createdAt: '2026-07-19' },
      { id: 'l2', name: 'Lead 2', stage: 'proposal', ownerId: 'z', createdAt: '2026-07-19' },
    ],
    owners: [{ id: 'z', name: 'Zed' }, { id: 'a', name: 'An' }],
    now,
    policy: { ownerWipLimit: 1 },
  });
  assert.deepEqual(result.owners.map((owner) => owner.name), ['An', 'Zed']);
  assert.equal(result.owners.find((owner) => owner.ownerId === 'z').band, 'over');
  assert.equal(result.managerQueue.some((item) => item.kind === 'owner_capacity'), true);
  assert.equal(result.policy.employeeRanking, false);
  assert.equal(result.policy.performanceInference, false);
  assert.equal(result.policy.automaticAssignment, false);
});

test('Manager queue ưu tiên unassigned, overdue và dormant nhưng chỉ advisory', () => {
  const result = buildCrmWorkloadIntelligence({
    leads: [{ id: 'lead', name: 'Lan', company: 'Old Lead', stage: 'new', createdAt: '2026-05-01' }],
    activities: [{ id: 'followup', refId: 'lead', date: '2026-07-01', done: false }],
    now,
  });
  const queue = result.managerQueue[0];
  assert.equal(queue.entityId, 'lead');
  assert.equal(queue.level, 'critical');
  assert.deepEqual(queue.signals.slice(0, 3).map((signal) => signal.id), ['dormant_review', 'overdue_followup', 'unassigned']);
  assert.equal(result.policy.advisoryOnly, true);
  assert.equal(result.policy.automaticStageChange, false);
});

test('Policy được clamp và stage lạ fail-closed về new', () => {
  const result = buildCrmWorkloadIntelligence({
    leads: [{ id: 'x', name: 'Unknown', stage: 'hacked', createdAt: 'bad' }],
    now,
    policy: { staleDays: -1, dormantDays: 9999, ownerWipLimit: 0 },
  });
  assert.equal(result.leads[0].stage, 'new');
  assert.equal(result.policy.staleDays, 3);
  assert.equal(result.policy.dormantDays, 180);
  assert.equal(result.policy.ownerWipLimit, 1);
  assert.equal(result.leads[0].confidence.band, 'unrated');
});
