import test from 'node:test';
import assert from 'node:assert/strict';
import { convertLeadToClient } from '../lib/lead-conversion.js';
import { clientBusinessData, leadBusinessData, validateCrmBusinessData } from '../lib/lead-conversion-policy.js';
import { RESOURCES } from '../lib/registry.js';
import { createLeadConversionDb, WON_LEAD } from './helpers/lead-conversion-db.mjs';

const AM = { id: 'am-1', name: 'Sales', roles: ['AM'] };
const NOW = new Date('2026-09-08T12:00:00Z');
const hasCode = code => error => error.code === code;

test('conversion persists one link, source/campaign snapshot and audit, then retry returns existing client', async () => {
  const memory = createLeadConversionDb([WON_LEAD]);
  const first = await convertLeadToClient(memory.db, AM, WON_LEAD.id, NOW);
  const retry = await convertLeadToClient(memory.db, AM, WON_LEAD.id, NOW);
  const state = memory.state();
  assert.equal(first.replayed, false);
  assert.equal(retry.replayed, true);
  assert.equal(first.clientId, retry.clientId);
  assert.equal(state.client.length, 1);
  assert.equal(state.auditLog.length, 1);
  assert.equal(state.eventOutbox.length, 2);
  assert.equal(state.lead[0].clientId, first.clientId);
  assert.equal(state.lead[0].convertedById, AM.id);
  assert.deepEqual(state.lead[0].convertedAt, NOW);
  assert.equal(state.client[0].originSource, 'Facebook');
  assert.equal(state.client[0].originCampaign, 'Spring launch');
  assert.equal(state.client[0].serviceLine, 'Seeding');
  assert.equal(state.client[0].note, WON_LEAD.note);
  assert.equal(state.lead[0].value, 50_000_000, 'conversion does not reclassify estimated deal value as cash');
});

test('concurrent conversion serializes and replays instead of leaving duplicate clients', async () => {
  const memory = createLeadConversionDb([WON_LEAD]);
  const results = await Promise.all([convertLeadToClient(memory.db, AM, WON_LEAD.id), convertLeadToClient(memory.db, AM, WON_LEAD.id)]);
  assert.equal(results.filter(result => result.replayed).length, 1);
  assert.equal(new Set(results.map(result => result.clientId)).size, 1);
  assert.ok(memory.stats.conflicts > 0, 'exercise actual commit conflict in the transaction model');
  assert.equal(memory.state().client.length, 1);
  assert.equal(memory.state().auditLog.length, 1);
  assert.equal(memory.state().eventOutbox.length, 2);
});

test('audit failure and CAS miss roll back the created client and can be retried safely', async () => {
  const memory = createLeadConversionDb([WON_LEAD], { auditFailureOnce: true });
  await assert.rejects(convertLeadToClient(memory.db, AM, WON_LEAD.id), /audit storage failed/);
  assert.equal(memory.state().client.length, 0);
  assert.equal(memory.state().lead[0].clientId, null);
  assert.equal(memory.state().auditLog.length, 0);
  await convertLeadToClient(memory.db, AM, WON_LEAD.id);
  assert.equal(memory.state().client.length, 1);
  const cas = createLeadConversionDb([WON_LEAD], { casMissOnce: true });
  await convertLeadToClient(cas.db, AM, WON_LEAD.id);
  assert.equal(cas.stats.casMisses, 1);
  assert.equal(cas.state().client.length, 1);
  const outbox = createLeadConversionDb([WON_LEAD], { outboxFailureOnce: true });
  await assert.rejects(convertLeadToClient(outbox.db, AM, WON_LEAD.id), /outbox storage failed/);
  assert.equal(outbox.state().lead[0].clientId, null);
  assert.equal(outbox.state().client.length, 0);
  assert.equal(outbox.state().auditLog.length, 0);
  assert.equal(outbox.state().eventOutbox.length, 0);
});

test('authorization rejects anonymous, freelancer, inactive and wrong roles before any transaction', async () => {
  for (const user of [null, { id: 'staff', roles: ['STAFF'] }, { ...AM, userType: 'freelancer' }, { ...AM, status: 'inactive' }]) {
    const memory = createLeadConversionDb([WON_LEAD]);
    await assert.rejects(convertLeadToClient(memory.db, user, WON_LEAD.id), hasCode(user ? 'forbidden' : 'unauthorized'));
    assert.equal(memory.stats.transactions, 0);
  }
});

test('ownership applies to initial conversion, retries and reassignment races; Director can convert all', async () => {
  const owned = createLeadConversionDb([WON_LEAD]);
  await assert.rejects(convertLeadToClient(owned.db, { id: 'other-am', roles: ['AM'] }, WON_LEAD.id), hasCode('lead_not_found'));
  await convertLeadToClient(owned.db, AM, WON_LEAD.id);
  await assert.rejects(convertLeadToClient(owned.db, { id: 'other-am', roles: ['AM'] }, WON_LEAD.id), hasCode('lead_not_found'));
  const race = createLeadConversionDb([WON_LEAD], { reassignOnce: true });
  await assert.rejects(convertLeadToClient(race.db, AM, WON_LEAD.id), hasCode('lead_not_found'));
  assert.equal(race.state().client.length, 0);
  const director = createLeadConversionDb([WON_LEAD]);
  assert.equal((await convertLeadToClient(director.db, { id: 'director', roles: ['DIRECTOR'] }, WON_LEAD.id)).replayed, false);
  const unassigned = createLeadConversionDb([{ ...WON_LEAD, ownerId: null }]);
  assert.equal((await convertLeadToClient(unassigned.db, AM, WON_LEAD.id)).replayed, false);
});

test('only won leads convert, but replay remains possible after later stage changes', async () => {
  for (const stage of ['new', 'proposal', 'lost']) {
    const memory = createLeadConversionDb([{ ...WON_LEAD, stage }]);
    await assert.rejects(convertLeadToClient(memory.db, AM, WON_LEAD.id), hasCode('lead_not_won'));
    assert.equal(memory.state().client.length, 0);
  }
  const memory = createLeadConversionDb([WON_LEAD]);
  const first = await convertLeadToClient(memory.db, AM, WON_LEAD.id);
  await memory.db.$transaction(tx => tx.lead.updateMany({ where: { id: WON_LEAD.id }, data: { stage: 'lost', campaign: 'Edited later' } }), { isolationLevel: 'Serializable' });
  const retry = await convertLeadToClient(memory.db, AM, WON_LEAD.id);
  assert.equal(retry.clientId, first.clientId);
  assert.equal(memory.state().client[0].originCampaign, 'Spring launch');
});

test('generic CRM writes cannot forge or erase lineage, and converted leads cannot be deleted', async () => {
  const forgedLead = { name: 'Lead', clientId: 'forged', convertedAt: NOW, convertedById: 'other', client: { create: { name: 'Injected' } }, intakeKey: 'forged' };
  const forgedClient = { name: 'Client', originSource: 'Forged', originCampaign: 'Forged', convertedFromLead: { connect: { id: 'lead-1' } } };
  assert.deepEqual(leadBusinessData(forgedLead), { name: 'Lead' });
  assert.deepEqual(clientBusinessData(forgedClient), { name: 'Client' });
  assert.deepEqual(RESOURCES.leads.filterUpdate(forgedLead, AM), { name: 'Lead' });
  assert.deepEqual(await RESOURCES.leads.beforeCreate(forgedLead, AM), { name: 'Lead' });
  assert.deepEqual(RESOURCES.clients.beforeCreate(forgedClient), { name: 'Client' });
  assert.deepEqual(RESOURCES.clients.filterUpdate(forgedClient), { name: 'Client' });
  assert.ok(validateCrmBusinessData(null, { name: { set: 'Injected' } }));
  assert.equal(RESOURCES.leads.canDeleteRow({ clientId: 'client-1' }), false);
  assert.equal(RESOURCES.leads.canDeleteRow({ clientId: null }), true);
});
