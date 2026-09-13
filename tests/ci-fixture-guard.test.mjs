import assert from 'node:assert/strict';
import test from 'node:test';
import { assertCiDatabase } from '../scripts/seed-ci-fixtures.mjs';
test('CI fixture writes are restricted to explicit disposable loopback databases', () => {
  assert.equal(assertCiDatabase('postgresql://ci:ci@127.0.0.1:5439/crmegoric_ci'), 'postgresql://ci:ci@127.0.0.1:5439/crmegoric_ci');
  for (const url of [undefined, 'postgresql://u:p@db.example/crmegoric_ci', 'postgresql://u:p@localhost/production', 'postgresql://u:p@localhost/crmegoric_ci_backup-production', 'file:./crmegoric_ci']) assert.throws(() => assertCiDatabase(url));
});
