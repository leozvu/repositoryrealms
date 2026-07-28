import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = fs.readFileSync(path.join(root, 'app/login/page.jsx'), 'utf8');

test('login credentials cannot fall back to a pre-hydration GET submission', () => {
  assert.match(source, /useEffect\(\(\) => \{ setHydrated\(true\); \}, \[\]\)/);
  assert.match(source, /<form method="post" action="\/login" onSubmit=\{submit\}>/);
  assert.match(source, /disabled=\{!hydrated \|\| busy\}/);
});
