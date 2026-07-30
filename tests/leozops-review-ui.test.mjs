import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const page = fs.readFileSync(new URL('../app/(app)/approvals/page.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app/(app)/approvals/leozops-review.module.css', import.meta.url), 'utf8');

test('approval inbox exposes the dedicated human review API and honest solo governance', () => {
  assert.match(page, /fetch\('\/api\/leozops\/action-proposals'/);
  assert.match(page, /\/api\/leozops\/action-proposals\/\$\{proposal\.id\}\/review/);
  assert.match(page, /single-operator review/i);
  assert.match(page, /không four-eyes/i);
  assert.match(page, /không approval/i);
  assert.match(page, /không execution/i);
  assert.match(page, /Không Lead nào bị thay đổi/);
});

test('review actions are labeled, confirmed, busy-safe and responsive', () => {
  assert.match(page, /<label htmlFor=\{`leozops-reject-/);
  assert.match(page, /aria-busy=\{busy \|\| undefined\}/);
  assert.match(page, /<ReviewDecisionDialog/);
  assert.match(page, /disabled=\{busy\}/);
  assert.match(css, /@media \(hover:none\),\(pointer:coarse\)/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /@media \(max-width:460px\)/);
  assert.doesNotMatch(page, /proposal\.lead_refs\.map/);
});
