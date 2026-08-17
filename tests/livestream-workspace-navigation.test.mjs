import test from 'node:test';
import assert from 'node:assert/strict';
import { workspaceNavigation } from '../lib/workspace-navigation.js';

test('Egolive livestream is a visible first-class sidebar room when the module is enabled', () => {
  const groups = workspaceNavigation(() => true);
  const room = groups.find((group) => group.key === 'livestream');

  assert.ok(room, 'Phòng Livestream Egolive must not be buried inside Vận hành');
  assert.equal(room.label, 'Phòng Livestream Egolive');
  assert.deepEqual(room.items.map((item) => item.key), ['live', 'violations']);
  assert.equal(room.items[0].href, '/live');
});

test('Egolive livestream room stays hidden when the company module is disabled', () => {
  const groups = workspaceNavigation((item) => item.mod !== 'livestream');
  assert.equal(groups.some((group) => group.key === 'livestream'), false);
});
