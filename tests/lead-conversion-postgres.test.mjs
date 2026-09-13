import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { convertLeadToClient } from '../lib/lead-conversion.js';

// Opt-in to the same explicitly disposable local database as payment tests.
// No dotenv, application DATABASE_URL fallback, seed, truncate or reset.
const databaseUrl = process.env.PAYMENT_TEST_DATABASE_URL;
function assertDisposable(url) {
  const parsed = new URL(url);
  assert.ok(['postgresql:', 'postgres:'].includes(parsed.protocol));
  assert.ok(['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname));
  assert.match(decodeURIComponent(parsed.pathname), /^\/codex_payment_test(?:_[a-zA-Z0-9_-]+)?$/);
}

function simultaneousReads(db) {
  let reads = 0, release;
  const barrier = new Promise(resolve => { release = resolve; });
  return { $transaction: (work, options) => db.$transaction(tx => work(new Proxy(tx, {
    get(target, key) {
      if (key !== 'lead') return target[key];
      return new Proxy(target.lead, { get(delegate, method) {
        if (method !== 'findUnique') return delegate[method];
        return async args => {
          const lead = await delegate.findUnique(args);
          if (++reads <= 2) { if (reads === 2) release(); await barrier; }
          return lead;
        };
      } });
    },
  })), { ...options, timeout: 15000 }) };
}

function brokenOutbox(db) {
  return { $transaction: (work, options) => db.$transaction(tx => work(new Proxy(tx, {
    get(target, key) {
      if (key !== 'eventOutbox') return target[key];
      return { createMany: async () => { throw new Error('injected outbox failure after client/link/audit'); } };
    },
  })), options) };
}

test('PostgreSQL conversion persists lineage, serializes concurrency and rolls back all effects', { skip: !databaseUrl, timeout: 60000 }, async t => {
  assertDisposable(databaseUrl);
  const { PrismaClient } = await import('@prisma/client');
  const db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  const run = `lead-test-${randomUUID()}`;
  const actor = { id: `${run}-am`, name: 'Disposable conversion test', roles: ['AM'] };
  const leadIds = [], eventIds = [];
  async function lead() {
    const id = `${run}-${leadIds.length + 1}`;
    leadIds.push(id);
    eventIds.push(`lead-conversion:${id}:client`, `lead-conversion:${id}:lead`);
    return db.lead.create({ data: { id, name: 'Test contact', company: run, stage: 'won', ownerId: actor.id, source: 'Facebook', campaign: run, serviceLine: 'Seeding', value: 50_000_000 } });
  }
  try {
    await db.$connect();
    await t.test('two requests read the unconverted lead together and commit one client plus two events', async () => {
      const record = await lead();
      const gated = simultaneousReads(db);
      const results = await Promise.all([convertLeadToClient(gated, actor, record.id), convertLeadToClient(gated, actor, record.id)]);
      assert.equal(results.filter(result => result.replayed).length, 1);
      assert.equal(new Set(results.map(result => result.clientId)).size, 1);
      assert.equal(await db.client.count({ where: { originCampaign: run } }), 1);
      const saved = await db.lead.findUnique({ where: { id: record.id }, include: { client: true } });
      assert.equal(saved.client.originCampaign, run);
      assert.equal(saved.client.originSource, 'Facebook');
      assert.equal(saved.convertedById, actor.id);
      assert.equal(saved.value, 50_000_000);
      assert.equal(await db.auditLog.count({ where: { refId: record.id } }), 1);
      assert.equal(await db.eventOutbox.count({ where: { occurrenceId: { in: eventIds } } }), 2);
      const fresh = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
      try {
        const replay = await convertLeadToClient(fresh, actor, record.id);
        assert.equal(replay.replayed, true);
        assert.equal(replay.clientId, saved.clientId);
      } finally { await fresh.$disconnect(); }
      await assert.rejects(db.client.delete({ where: { id: saved.clientId } }), error => error.code === 'P2003' || /Lead_clientId_fkey/.test(error.message));
      assert.ok(await db.client.findUnique({ where: { id: saved.clientId } }));
    });
    await t.test('a queue failure rolls back client, lineage and audit; a later retry succeeds', async () => {
      const record = await lead();
      const clientsBefore = await db.client.count({ where: { originCampaign: run } });
      await assert.rejects(convertLeadToClient(brokenOutbox(db), actor, record.id), /injected outbox failure/);
      assert.equal(await db.client.count({ where: { originCampaign: run } }), clientsBefore);
      assert.equal((await db.lead.findUnique({ where: { id: record.id } })).clientId, null);
      assert.equal(await db.auditLog.count({ where: { refId: record.id } }), 0);
      assert.equal(await db.eventOutbox.count({ where: { occurrenceId: `lead-conversion:${record.id}:client` } }), 0);
      assert.equal((await convertLeadToClient(db, actor, record.id)).replayed, false);
    });
    await t.test('ownership is checked before returning a previously converted client', async () => {
      await assert.rejects(convertLeadToClient(db, { id: 'another-am', roles: ['AM'] }, leadIds[0]), error => error.code === 'lead_not_found');
    });
  } finally {
    // Exact IDs/campaign created by this test run only; no shared records touched.
    await db.eventOutbox.deleteMany({ where: { occurrenceId: { in: eventIds } } });
    await db.auditLog.deleteMany({ where: { userId: actor.id } });
    await db.lead.deleteMany({ where: { id: { in: leadIds } } });
    await db.client.deleteMany({ where: { originCampaign: run } });
    await db.$disconnect();
  }
});
