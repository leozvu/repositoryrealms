import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';

const page = fs.readFileSync(new URL('../app/(app)/approvals/page.jsx', import.meta.url), 'utf8');
const css = fs.readFileSync(new URL('../app/(app)/approvals/leozops-review.module.css', import.meta.url), 'utf8');

test('approvals UI preserves prepare, explicit confirmation and receipt boundaries', () => {
  assert.match(page, /fetch\('\/api\/leozops\/command-intents'/);
  assert.match(page, /Idempotency-Key/);
  assert.match(page, /Tạo dry-run/);
  assert.match(page, /<CommandConfirmationDialog/);
  assert.match(page, /Xác nhận thực thi/);
  assert.match(page, /canonical receipt/i);
  assert.match(page, /repository_receipt_id/);
  assert.doesNotMatch(page, /fetch\([^\n]*\/api\/(?:data|v1)\/leads/);
});

test('command controls are labeled, busy-safe, responsive and reduced-motion aware', () => {
  assert.match(page, /<fieldset className=\{styles\.commandForm\} disabled=\{busy\}>/);
  assert.match(page, /<legend>Chuẩn bị command/);
  assert.match(page, /aria-busy=\{busy \|\| undefined\}/);
  assert.match(page, /Dừng khẩn cấp/);
  assert.match(css, /\.commandGrid select:focus-visible/);
  assert.match(css, /min-height:44px/);
  assert.match(css, /@media \(max-width:760px\)/);
  assert.match(css, /@media \(prefers-reduced-motion:reduce\)/);
});
