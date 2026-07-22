import assert from 'node:assert/strict';
import test from 'node:test';
import { crmWorkloadScope, loadCrmWorkloadIntelligence } from '../lib/crm-workload-intelligence-admin.js';

function database() {
  const calls = { leads: null, activities: null, users: null, settings: 0 };
  return {
    calls,
    db: {
      lead: { findMany: async (args) => {
        calls.leads = args;
        return [{
          id: 'lead-1', name: 'Lan', company: 'Lumen', email: 'hidden@example.com', phone: '0900',
          source: 'Website', value: 100_000_000, stage: 'proposal', ownerId: 'am-1',
          createdAt: '2026-07-01', expectedClose: '2026-07-30',
        }];
      } },
      activity: { findMany: async (args) => {
        calls.activities = args;
        return [{ id: 'activity-1', refId: 'lead-1', kind: 'call', title: 'Called', date: '2026-07-19', done: true, userId: 'am-1' }];
      } },
      user: { findMany: async (args) => {
        calls.users = args;
        return [
          { id: 'am-1', name: 'Account One', title: 'AM', role: 'AM', roles: '["AM"]' },
          { id: 'staff-1', name: 'Staff', title: 'Staff', role: 'STAFF', roles: '["STAFF"]' },
        ];
      } },
      setting: { findUnique: async () => {
        calls.settings += 1;
        return { json: JSON.stringify({ crmLeadWipLimit: 10, crmStaleDays: 10, crmDormantDays: 25 }) };
      } },
    },
  };
}

test('CRM workload scope giữ nguyên authorization của Lead ERP', () => {
  assert.deepEqual(crmWorkloadScope({ id: 'director', roles: ['DIRECTOR'] }), { kind: 'company' });
  assert.deepEqual(crmWorkloadScope({ id: 'am', roles: ['AM'] }), { kind: 'portfolio', userId: 'am' });
  assert.equal(crmWorkloadScope({ id: 'staff', roles: ['STAFF'] }).code, 'crm_workload_scope_missing');
  assert.equal(crmWorkloadScope({ id: 'free', userType: 'freelancer' }).code, 'crm_workload_freelancer_forbidden');
  assert.equal(crmWorkloadScope(null).code, 'unauthorized');
});

test('AM chỉ query portfolio của mình + unassigned và response không leak contact', async () => {
  const { db, calls } = database();
  const result = await loadCrmWorkloadIntelligence(db, { id: 'am-1', roles: ['AM'], userType: 'employee' }, new Date('2026-07-20T12:00:00.000Z'));
  assert.deepEqual(calls.leads.where, { OR: [{ ownerId: 'am-1' }, { ownerId: null }] });
  assert.deepEqual(calls.activities.where, { refType: 'lead', refId: { in: ['lead-1'] } });
  assert.equal(calls.settings, 1);
  assert.equal(result.source, 'canonical-erp-crm');
  assert.equal(result.scope.kind, 'portfolio');
  assert.equal(result.workloadIntelligence.policy.ownerWipLimit, 10);
  assert.equal(result.workloadIntelligence.leads[0].confidence.ceiling, 'medium');
  assert.equal(JSON.stringify(result).includes('hidden@example.com'), false);
  assert.equal(JSON.stringify(result).includes('0900'), false);
});

test('Director nhận company scope và chỉ giữ sales owner trong capacity', async () => {
  const { db, calls } = database();
  const result = await loadCrmWorkloadIntelligence(db, { id: 'director', roles: ['DIRECTOR'], userType: 'employee' }, new Date('2026-07-20T12:00:00.000Z'));
  assert.deepEqual(calls.leads.where, {});
  assert.equal(result.scope.kind, 'company');
  assert.deepEqual(result.workloadIntelligence.owners.map((owner) => owner.ownerId), ['am-1']);
  assert.equal(result.workloadIntelligence.policy.employeeRanking, false);
});

test('Anonymous, Staff và freelancer bị chặn trước database query', async () => {
  const db = { lead: { findMany: async () => { throw new Error('must not query'); } } };
  await assert.rejects(loadCrmWorkloadIntelligence(db, null), (error) => error.status === 401 && error.code === 'unauthorized');
  await assert.rejects(loadCrmWorkloadIntelligence(db, { id: 'staff', roles: ['STAFF'] }), (error) => error.status === 403 && error.code === 'crm_workload_scope_missing');
  await assert.rejects(loadCrmWorkloadIntelligence(db, { id: 'free', userType: 'freelancer' }), (error) => error.status === 403 && error.code === 'crm_workload_freelancer_forbidden');
});
