import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import { REPOSITORY_REALMS_ACTION_CONTRACTS } from '../lib/repository-realms.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

test('group workforce is a CEO Portal-only surface backed by shared RepositoryRealms invariants', () => {
  const navigation = read('lib/erp-navigation.js');
  const shell = read('components/Shell.jsx');
  const page = read('app/(app)/ceo-workforce/page.jsx');
  const target = read('lib/ceo-command-target-admin.js');
  const contract = REPOSITORY_REALMS_ACTION_CONTRACTS.find((row) => row.action === 'group_workforce.request');

  assert.match(navigation, /key: 'ceo-workforce'.*ceoPortalOnly: true/);
  assert.match(shell, /!item\.ceoPortalOnly \|\| ceoPortal/);
  assert.doesNotMatch(page, /NEXT_PUBLIC_CEO_GROUP_WORKFORCE|FEATURE_ENABLED/);
  assert.match(page, /messaging\/directory/);
  assert.match(page, /group_workforce\.request/);
  assert.match(target, /sharedWithCeoPortal/);
  assert.match(target, /consentedAt/);
  assert.match(target, /revokedAt/);
  assert.equal(contract?.parity.presentationIndependent, true);
  assert.equal(contract?.parity.sharedBusinessInvariantsRequired, true);
  assert.deepEqual(contract?.businessRules, [
    'employing entity owns approval',
    'employee directory consent',
    'bounded assignment dates and capacity',
    'no payroll or employment transfer',
  ]);
});

test('the Portal page never imports Prisma or writes entity business tables directly', () => {
  const page = read('app/(app)/ceo-workforce/page.jsx');
  assert.doesNotMatch(page, /@\/lib\/prisma|prisma\./);
  assert.match(page, /\/api\/ceo\/v1\/command-gateway/);
  assert.match(page, /targetEntityId: employerId/);
  assert.match(page, /requestingEntityId: borrowerId/);
  assert.match(page, /Không sao chép lương|Salary, performance evidence/);
});
