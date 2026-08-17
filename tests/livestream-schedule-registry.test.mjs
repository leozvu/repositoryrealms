import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RESOURCES, filterableOf } from '../lib/registry.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const candidate = {
  title: 'Live mỹ phẩm buổi sáng',
  platform: 'tiktok',
  date: '2026-08-20',
  startAt: '09:00',
  durationMin: 120,
  hostId: 'host-1',
  operatorId: 'operator-1',
  studio: 'Studio A',
  productCount: 8,
  scheduleStatus: 'confirmed',
  status: 'scheduled',
};

test('livestream creation is always owned by the Egolive department', async () => {
  const data = await RESOURCES.livesessions.beforeCreate(candidate);
  assert.equal(data.department, 'egolive');
});

test('livestream API allows bounded schedule filters', () => {
  assert.deepEqual(filterableOf('livesessions'), ['status', 'scheduleStatus', 'date', 'hostId', 'platform', 'studio']);
});

test('livestream validation rejects an overlapping host assignment', async () => {
  const prisma = {
    liveSession: {
      findMany: async () => [{ ...candidate, id: 'existing', startAt: '10:00' }],
    },
  };
  const error = await RESOURCES.livesessions.validate(null, candidate, prisma);
  assert.match(error, /trùng lịch/i);
});

test('livestream validation allows an adjacent assignment', async () => {
  const prisma = {
    liveSession: {
      findMany: async () => [{ ...candidate, id: 'existing', startAt: '11:00' }],
    },
  };
  const error = await RESOURCES.livesessions.validate(null, candidate, prisma);
  assert.equal(error, null);
});

test('livestream schedule migration adds planning fields without replacing LiveSession', () => {
  const migration = fs.readFileSync(path.join(ROOT, 'prisma/migrations/20260816090000_add_egolive_department_schedule/migration.sql'), 'utf8');
  assert.match(migration, /ALTER TABLE "LiveSession"/);
  assert.match(migration, /"scheduleStatus" TEXT NOT NULL DEFAULT 'draft'/);
  assert.doesNotMatch(migration, /DROP TABLE "LiveSession"/);
});
