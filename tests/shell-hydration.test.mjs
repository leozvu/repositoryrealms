import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const source = await readFile(new URL('../components/Shell.jsx', import.meta.url), 'utf8');

test('topbar date is resolved after hydration in the employee timezone', () => {
  assert.match(source, /const \[todayLabel, setTodayLabel\] = useState\(''\)/);
  assert.match(source, /setTodayLabel\(new Date\(\)\.toLocaleDateString\('vi-VN'/);
  assert.match(source, /<span id="today-label">\{todayLabel\}<\/span>/);
  assert.doesNotMatch(
    source,
    /<span id="today-label">\{new Date\(\)/,
    'server and browser timezones must not render competing initial text',
  );
});
