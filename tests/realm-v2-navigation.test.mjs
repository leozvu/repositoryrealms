import test from 'node:test';
import assert from 'node:assert/strict';
import { realmV2AreaDecision, visibleRealmV2Areas } from '../lib/realm-v2-navigation.js';

const user = (roles, extra = {}) => ({ id: 'viewer', roles, ...extra });
const slugs = (viewer, modules) => visibleRealmV2Areas(viewer, modules).map((area) => area.slug);

test('staff can work and communicate without being offered manager, audit or CEO areas', () => {
  const visible = slugs(user(['STAFF']), ['tasks', 'delivery']);
  for (const slug of ['home', 'my-work', 'projects', 'inbox', 'action-center', 'approvals']) assert.ok(visible.includes(slug), slug);
  for (const slug of ['work-management', 'chronicle', 'command-center', 'world-map', 'ceo-terminal']) assert.ok(!visible.includes(slug), slug);
});

test('manager roles and module settings apply to navigation and direct area decisions equally', () => {
  const manager = user(['PM']);
  assert.ok(slugs(manager, ['tasks']).includes('work-management'));
  assert.ok(!slugs(manager, ['tasks']).includes('projects'));
  assert.equal(realmV2AreaDecision(manager, 'projects', ['tasks']).code, 'module_disabled');
  assert.ok(!slugs(manager, []).includes('my-work'));
  assert.ok(slugs(user(['AM', 'LEAD']), ['tasks']).includes('work-management'));
  assert.ok(slugs(user(['MANAGER']), ['tasks']).includes('work-management'));
});

test('Director permission does not override a disabled company module or the external-user boundary', () => {
  assert.ok(slugs(user(['DIRECTOR']), []).includes('ceo-terminal'));
  assert.ok(!slugs(user(['DIRECTOR']), []).includes('projects'));
  assert.deepEqual(slugs(user(['DIRECTOR'], { userType: 'freelancer' }), ['tasks', 'delivery']), []);
  assert.deepEqual(slugs(null, ['tasks']), []);
  assert.equal(realmV2AreaDecision(user(['DIRECTOR']), 'does-not-exist').allowed, false);
});

test('legacy module defaults retain existing internal work destinations', () => {
  assert.ok(slugs(user(['PM']), null).includes('projects'));
  assert.ok(slugs(user(['STAFF']), undefined).includes('my-work'));
});
