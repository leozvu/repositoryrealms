import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (...parts) => fs.readFileSync(path.join(root, ...parts), 'utf8');

test('global fonts bundle Vietnamese glyphs instead of relying on runtime Google CSS', () => {
  const layout = read('app', 'layout.jsx');

  assert.match(layout, /Be_Vietnam_Pro, Noto_Serif, Roboto_Mono/);
  assert.equal((layout.match(/'vietnamese'/g) || []).length, 3);
  assert.match(layout, /variable: '--font-be-vietnam-pro'/);
  assert.match(layout, /variable: '--font-noto-serif'/);
  assert.match(layout, /variable: '--font-roboto-mono'/);
  assert.doesNotMatch(layout, /fonts\.googleapis\.com|fonts\.gstatic\.com/);
  assert.match(layout, /<html lang="vi"/);
});

test('ERP and Realm typography tokens use the bundled Vietnamese font families', () => {
  const css = read('app', 'globals.css');

  assert.match(css, /--font:var\(--font-be-vietnam-pro\)/);
  assert.match(css, /--font-display:var\(--font-noto-serif\)/);
  assert.match(css, /--font-mono:var\(--font-roboto-mono\)/);
  assert.match(css, /body\{font-family:var\(--font\)/);
});

test('Realm components do not bypass the Vietnamese typography tokens', () => {
  const realmDir = path.join(root, 'components', 'realm');
  const styles = fs.readdirSync(realmDir)
    .filter((name) => name.endsWith('.css'))
    .map((name) => ({ name, content: fs.readFileSync(path.join(realmDir, name), 'utf8') }));

  assert.ok(styles.length > 0);
  for (const { name, content } of styles) {
    assert.doesNotMatch(
      content,
      /font-family\s*:\s*(?:Georgia|["']Segoe UI["']|ui-monospace)/i,
      `${name} contains a device-dependent font stack`,
    );
  }

  const realmOffice = styles.find(({ name }) => name === 'realm-office.module.css')?.content || '';
  assert.match(realmOffice, /font-family:\s*var\(--font-display\)/);
  assert.match(realmOffice, /font-family:\s*var\(--font-mono\)/);
});
