import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  COMPANY_TOPOLOGY,
  canonicalCompanyId,
  departmentsForCompany,
} from '../lib/company-topology.js';
import { MODULE_PRESETS } from '../lib/modules.js';
import { CEO_ENTITY_REGISTRY_SEED } from '../lib/ceo-entity-registry.js';

test('Egolive is a department of Egoric instead of a standalone company', () => {
  assert.equal(canonicalCompanyId('egolive'), 'egoric');
  assert.equal(departmentsForCompany('egoric').some((item) => item.id === 'egolive'), true);
  assert.equal(COMPANY_TOPOLOGY.some((item) => item.id === 'egolive'), false);
});

test('Egoric deployment preset keeps the agency ERP and adds livestream', () => {
  assert.equal(MODULE_PRESETS.egoric.mods.includes('sales'), true);
  assert.equal(MODULE_PRESETS.egoric.mods.includes('delivery'), true);
  assert.equal(MODULE_PRESETS.egoric.mods.includes('livestream'), true);
});

test('CEO registry exposes livestream through Egoric and no new standalone Egolive seed', () => {
  const egoric = CEO_ENTITY_REGISTRY_SEED.find((item) => item.id === 'egoric');
  assert.equal(egoric.capabilities.includes('livestream'), true);
  assert.equal(CEO_ENTITY_REGISTRY_SEED.some((item) => item.id === 'egolive'), false);
});

test('CEO provisioning no longer creates a standalone Egolive registry row', () => {
  const source = readFileSync(new URL('../scripts/provision-ceo-terminal.mjs', import.meta.url), 'utf8');
  assert.doesNotMatch(source, /\{ id: 'egolive', displayName:/);
  assert.match(source, /EGOLIVE_MERGE_COMPLETE/);
  assert.match(source, /capabilities: JSON\.stringify\(e\.capabilities\)/);
});
