import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRealmEmbassyDashboard, realmEmbassyScope } from '../lib/realm-embassy-admin.js';

function embassyDb() {
  const calls = { leads: null, owners: null, clients: null, activities: null };
  return {
    calls,
    db: {
      lead: { findMany: async (args) => { calls.leads = args; return [{ id: 'lead-1', name: 'Lan', company: 'Lumen', source: 'Website', value: 100_000_000, stage: 'proposal', ownerId: 'am-1', createdAt: '2026-07-01', expectedClose: '2026-07-20' }]; } },
      user: { findMany: async (args) => { calls.owners = args; return [{ id: 'am-1', name: 'Quang Võ' }]; } },
      client: { findMany: async (args) => { calls.clients = args; return [{ id: 'client-1', name: 'Green Dragon', industry: 'F&B', projects: [] }]; } },
      activity: { findMany: async (args) => { calls.activities = args; return [{ id: 'activity-1', refId: 'lead-1', kind: 'call', title: 'Gọi xác nhận proposal', date: '2026-07-19', done: false, userId: 'am-1', note: 'must-not-leak' }]; } },
    },
  };
}

test('Embassy scope chỉ cho Director hoặc AM', () => {
  assert.deepEqual(realmEmbassyScope({ id: 'director-1', roles: ['DIRECTOR'] }), { kind: 'company' });
  assert.deepEqual(realmEmbassyScope({ id: 'am-1', roles: ['AM'] }), { kind: 'portfolio', userId: 'am-1' });
  assert.deepEqual(realmEmbassyScope({ id: 'staff-1', roles: ['STAFF'] }), { kind: 'none' });
  assert.deepEqual(realmEmbassyScope(null), { kind: 'none' });
});

test('AM chỉ query lead của mình hoặc chưa gán', async () => {
  const { db, calls } = embassyDb();
  const dashboard = await loadRealmEmbassyDashboard(db, { id: 'am-1', roles: ['AM'] }, new Date('2026-07-17T12:00:00.000Z'));
  assert.deepEqual(calls.leads.where, { OR: [{ ownerId: 'am-1' }, { ownerId: null }] });
  assert.deepEqual(calls.owners.where, { id: { in: ['am-1'] }, status: 'active' });
  assert.equal(calls.clients.select.email, undefined);
  assert.equal(calls.clients.select.phone, undefined);
  assert.equal(dashboard.permissions.scope, 'portfolio');
  const lead = dashboard.stages.find((stage) => stage.id === 'proposal').leads[0];
  assert.equal(lead.owner.name, 'Quang Võ');
  assert.equal(lead.activities[0].author, 'Quang Võ');
  assert.equal('note' in lead.activities[0], false);
  assert.deepEqual(calls.activities.where, { refType: 'lead', refId: { in: ['lead-1'] } });
});

test('Director đọc pipeline company scope', async () => {
  const { db, calls } = embassyDb();
  const dashboard = await loadRealmEmbassyDashboard(db, { id: 'director-1', roles: ['DIRECTOR'] });
  assert.deepEqual(calls.leads.where, {});
  assert.equal(dashboard.permissions.scope, 'company');
});

test('STAFF bị chặn trước database query', async () => {
  const db = { lead: { findMany: async () => { throw new Error('must not query'); } } };
  await assert.rejects(
    loadRealmEmbassyDashboard(db, { id: 'staff-1', roles: ['STAFF'] }),
    (error) => error.status === 403 && error.code === 'embassy_scope_missing',
  );
});
