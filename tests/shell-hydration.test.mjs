import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../components/Shell.jsx', import.meta.url), 'utf8');

test('topbar avoids rendering a server-timezone date that can conflict after hydration', () => {
  assert.doesNotMatch(source, /id="today-label"/);
  assert.doesNotMatch(
    source,
    /<span id="today-label">\{new Date\(\)/,
    'server and browser timezones must not render competing initial text',
  );
});
