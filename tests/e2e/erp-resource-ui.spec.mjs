import { test, expect } from '@playwright/test';
import { mountResourceHarness } from '../helpers/erp-component-harness.mjs';

test('changing session identity clears the previous user rows before the new request completes', async ({ page }) => {
  let changed = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/data/leads?*', async route => {
    if (changed) await gate;
    return route.fulfill({ json: [{ id: changed ? 'second-user-row' : 'first-user-row' }] });
  });
  await mountResourceHarness(page);
  await expect(page.getByTestId('rows')).toContainText('first-user-row');
  changed = true;
  await page.evaluate(() => window.setUser({ id: 'second-user', roles: ['STAFF'] }));
  await expect(page.getByTestId('rows')).toHaveText('[]');
  await expect(page.getByTestId('loading')).toHaveText('true');
  release(); await expect(page.getByTestId('rows')).toContainText('second-user-row');
});

test('changing filters and disabling a resource cannot expose old rows', async ({ page }) => {
  await page.route('**/api/data/leads?*', route => route.fulfill({ json: [{ id: new URL(route.request().url()).searchParams.get('ownerId') }] }));
  await mountResourceHarness(page);
  await expect(page.getByTestId('rows')).toHaveText('[{"id":"one"}]');
  await page.evaluate(() => window.setFilter('two'));
  await expect(page.getByTestId('rows')).toHaveText('[{"id":"two"}]');
  await page.evaluate(() => window.setEnabled(false));
  await expect(page.getByTestId('rows')).toHaveText('[]');
  await expect(page.getByTestId('loading')).toHaveText('false');
  expect(await page.evaluate(() => window.inflight)).toBe(0);
});

test('read failure exposes retry and recovers without an empty-success state', async ({ page }) => {
  let fail = true;
  await page.route('**/api/data/leads?*', route => route.fulfill(fail ? { status: 500, json: { error: 'Không thể đọc Lead' } } : { json: [{ id: 'restored' }] }));
  await mountResourceHarness(page);
  await expect(page.getByRole('alert')).toContainText('Không thể đọc Lead');
  fail = false;
  await page.getByRole('button', { name: 'Thử tải lại' }).click();
  await expect(page.getByTestId('rows')).toContainText('restored');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('actual Lead handler keeps failed form contents and closes only on confirmed write', async ({ page }) => {
  let fail = true, writes = 0;
  await page.route('**/api/data/leads*', route => {
    if (route.request().method() === 'POST') { writes++; return route.fulfill(fail ? { status: 409, json: { error: 'Bản ghi đã đổi' } } : { json: { id: 'new-lead' } }); }
    return route.fulfill({ json: [] });
  });
  await mountResourceHarness(page);
  await page.getByRole('button', { name: 'Thêm Lead', exact: true }).click();
  await page.getByLabel('Người liên hệ').fill('Khách hàng đang nhập');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => writes).toBe(1);
  await expect(page.getByLabel('Người liên hệ')).toBeEnabled();
  await expect(page.getByLabel('Người liên hệ')).toHaveValue('Khách hàng đang nhập');
  expect(await page.evaluate(() => window.messages.some(item => item.message === 'Đã thêm'))).toBe(false);
  fail = false;
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(writes).toBe(2);
});

test('dirty form stays open when discard is declined; fields lock during submission', async ({ page }) => {
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/data/leads*', async route => {
    if (route.request().method() === 'POST') { await gate; return route.fulfill({ json: { id: 'saved' } }); }
    return route.fulfill({ json: [] });
  });
  await mountResourceHarness(page);
  await page.getByRole('button', { name: 'Thêm Lead', exact: true }).click();
  await page.getByLabel('Người liên hệ').fill('Bản nháp');
  page.once('dialog', dialog => dialog.dismiss());
  await page.getByRole('button', { name: 'Hủy', exact: true }).click();
  await expect(page.getByLabel('Người liên hệ')).toHaveValue('Bản nháp');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect(page.getByLabel('Người liên hệ')).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Hủy', exact: true })).toBeDisabled();
  release(); await expect(page.getByRole('dialog')).toHaveCount(0);
});
