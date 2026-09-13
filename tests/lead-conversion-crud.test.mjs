import test from 'node:test';
import assert from 'node:assert/strict';
import { register } from 'node:module';
import { resetRecords, state } from './helpers/stub-record-route-boundaries.mjs';
import { WON_LEAD } from './helpers/lead-conversion-db.mjs';
register('./helpers/record-route-loader.mjs', import.meta.url);
const routes = [
  { name: 'session', list: await import('../app/api/data/[resource]/route.js'), item: await import('../app/api/data/[resource]/[id]/route.js') },
  { name: 'API key', list: await import('../app/api/v1/[resource]/route.js'), item: await import('../app/api/v1/[resource]/[id]/route.js') },
];
const AM = { id: 'am-1', roles: ['AM'] };
const req = data => ({ json: async () => structuredClone(data) });
const context = (resource, id) => ({ params: { resource, id } });
for (const route of routes) {
  test(`${route.name}: generic CRM routes cannot forge links or change origin snapshots`, async () => {
    resetRecords(AM, { lead: { [WON_LEAD.id]: WON_LEAD }, client: { client: { id: 'client', name: 'Client', originSource: 'Facebook', originCampaign: 'Original' } } });
    const lead = await route.item.PUT(req({ clientId: 'forged', convertedById: 'fake', name: 'Updated' }), context('leads', WON_LEAD.id));
    assert.equal(lead.status, 200);
    assert.equal(state.records.lead[WON_LEAD.id].clientId, null);
    assert.equal(state.records.lead[WON_LEAD.id].name, 'Updated');
    const client = await route.item.PUT(req({ originCampaign: 'Forged', convertedFromLead: { create: {} }, name: 'Updated client' }), context('clients', 'client'));
    assert.equal(client.status, 200);
    assert.equal(state.records.client.client.originCampaign, 'Original');
    assert.equal('convertedFromLead' in state.records.client.client, false);
    assert.equal((await route.list.POST(req({ name: 'Client', originSource: 'Forged' }), context('clients'))).status, 200);
    assert.equal(state.calls.findLast(call => call.model === 'client' && call.operation === 'create').data.originSource, undefined);
  });

  test(`${route.name}: another AM cannot seize a lead via generic updates before conversion`, async () => {
    resetRecords({ id: 'other-am', roles: ['AM'] }, { lead: { [WON_LEAD.id]: WON_LEAD } });
    const response = await route.item.PUT(req({ ownerId: 'other-am' }), context('leads', WON_LEAD.id));
    assert.equal(response.status, 403);
    assert.equal(state.records.lead[WON_LEAD.id].ownerId, AM.id);
  });

  test(`${route.name}: converted leads and stale deletion attempts preserve lineage`, async () => {
    const director = { id: 'director', roles: ['DIRECTOR'] };
    resetRecords(director, { lead: { [WON_LEAD.id]: { ...WON_LEAD, clientId: 'client' } } });
    assert.equal((await route.item.DELETE(req({}), context('leads', WON_LEAD.id))).status, 403);
    resetRecords(director, { lead: { [WON_LEAD.id]: WON_LEAD } });
    state.conflictOnce = true;
    assert.equal((await route.item.DELETE(req({}), context('leads', WON_LEAD.id))).status, 409);
    assert.ok(state.records.lead[WON_LEAD.id]);
  });
}
