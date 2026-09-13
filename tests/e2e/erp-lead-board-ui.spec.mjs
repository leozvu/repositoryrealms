import { test, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { mountLeadBoard } from '../helpers/lead-board-browser.mjs';

const stages = ['new', 'contacted', 'proposal', 'negotiation', 'won', 'lost'];
const lead = (id, name = id) => ({ id, name, stage: 'new', value: 100, source: 'Website' });
function board(second = false, name = null) {
  return { generatedAt: '2026-09-13T00:00:00.000Z',
    columns: Object.fromEntries(stages.map(stage => [stage, { rows: stage === 'new' ? [lead(second ? 'page-2' : 'page-1', name || (second ? 'Thẻ trang hai' : 'Thẻ trang đầu'))] : [], page: { size: 25, hasMore: stage === 'new' && !second, nextCursor: stage === 'new' && !second ? 'next-new' : null } }])),
    summary: { total: 30, openCount: 30, openValue: 3000, stages: Object.fromEntries(stages.map(stage => [stage, { count: stage === 'new' ? 30 : 0, value: stage === 'new' ? 3000 : 0 }])), probability: { new: 10, contacted: 20, proposal: 40, negotiation: 60 }, months: ['2026-09', '2026-10', '2026-11'], forecast: [300, 0, 0], noDateCount: 0, target: 0, hasCampaigns: true, campaigns: [{ key: 'Chiến dịch toàn bộ', total: 30, won: 0, wonValue: 0, openValue: 3000 }] },
  };
}
async function baseRoutes(page) {
  await page.route('**/api/settings', route => route.fulfill({ json: {} }));
  await page.route('**/api/data/users', route => route.fulfill({ json: [] }));
  await page.route('**/api/leads/workload', route => route.fulfill({ status: 503, json: { error: 'Workload chưa sẵn sàng' } }));
}

test('column paging retains full-scope totals and export requests the full collection only on demand', async ({ page }) => {
  await baseRoutes(page); const requests = []; let exports = 0;
  await page.route('**/api/leads/board*', route => { const next = new URL(route.request().url()).searchParams.has('newCursor'); requests.push(next); return route.fulfill({ json: board(next) }); });
  await page.route('**/api/data/leads', route => { exports++; return route.fulfill({ json: [lead('export-only', 'Bản ghi ngoài trang đang xem')] }); });
  await mountLeadBoard(page);
  await page.locator('summary').click();
  await expect(page.getByRole('button', { name: /Mở Lead Thẻ trang đầu/ })).toBeVisible();
  await expect(page.locator('.toolbar')).toContainText('30 cơ hội');
  await expect(page.getByLabel('Forecast')).toHaveText('[300,0,0]');
  expect(exports).toBe(0);
  const nav = page.getByRole('navigation', { name: 'Phân trang Mới', exact: true });
  await nav.getByRole('button', { name: 'Tiếp', exact: true }).click();
  await expect(page.getByRole('button', { name: /Mở Lead Thẻ trang hai/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /Mở Lead Thẻ trang đầu/ })).toHaveCount(0);
  await expect(page.locator('.toolbar')).toContainText('30 cơ hội');
  await expect(page.getByLabel('Forecast')).toHaveText('[300,0,0]');
  await expect(nav.getByRole('button', { name: 'Tiếp', exact: true })).toBeDisabled();
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'CSV toàn bộ', exact: true }).click();
  const download = await downloadPromise;
  expect(await readFile(await download.path(), 'utf8')).toContain('Bản ghi ngoài trang đang xem');
  expect(exports).toBe(1);
  await nav.getByRole('button', { name: 'Trước', exact: true }).click();
  await expect(page.getByRole('button', { name: /Mở Lead Thẻ trang đầu/ })).toBeVisible();
  expect(requests).toContain(true);
});

test('focus links load a scoped Lead outside visible pages', async ({ page }) => {
  await baseRoutes(page);
  await page.route('**/api/leads/board*', route => route.fulfill({ json: board() }));
  await page.route('**/api/data/leads?id=outside-page', route => route.fulfill({ json: [lead('outside-page', 'Lead từ liên kết')] }));
  await mountLeadBoard(page, '?focus=outside-page');
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByLabel('Người liên hệ')).toHaveValue('Lead từ liên kết');
  expect(await page.evaluate(() => window.messages.some(message => message.includes('Không tìm thấy')))).toBe(false);
});

test('expired cursor offers a first-page recovery and session changes clear totals and cards', async ({ page }) => {
  await baseRoutes(page); let changed = false, release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/leads/board*', async route => {
    if (changed) await gate;
    if (new URL(route.request().url()).searchParams.has('newCursor')) return route.fulfill({ status: 409, json: { error: 'Danh sách đã thay đổi.' } });
    return route.fulfill({ json: board(false, changed ? 'Phiên mới' : null) });
  });
  await mountLeadBoard(page); await page.locator('summary').click();
  await page.getByRole('navigation', { name: 'Phân trang Mới', exact: true }).getByRole('button', { name: 'Tiếp', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('Danh sách đã thay đổi');
  await page.getByRole('button', { name: 'Thử tải lại', exact: true }).click();
  await expect(page.locator('.toolbar')).toContainText('30 cơ hội');
  changed = true; await page.evaluate(() => window.setUser({ id: 'am-b', roles: ['AM'] }));
  await expect(page.locator('.toolbar')).not.toContainText('30 cơ hội');
  await expect(page.getByRole('button', { name: /Mở Lead Thẻ trang đầu/ })).toHaveCount(0);
  release(); await expect(page.locator('.toolbar')).toContainText('30 cơ hội');
});

test('changing focus loads the new record; unresolved lookups preserve current form values', async ({ page }) => {
  await baseRoutes(page); let saved;
  await page.route('**/api/leads/board*', route => route.fulfill({ json: board() }));
  await page.route('**/api/data/leads?id=*', route => {
    const id = new URL(route.request().url()).searchParams.get('id');
    return route.fulfill({ json: [{ ...lead(id), ownerId: 'original-owner', region: 'Vùng đang lưu', serviceLine: 'Dịch vụ đang lưu' }] });
  });
  await page.route('**/api/data/leads/focus-b', route => { saved = route.request().postDataJSON(); return route.fulfill({ json: { id: 'focus-b', ...saved } }); });
  await mountLeadBoard(page, '?focus=focus-a');
  await expect(page.getByLabel('Người liên hệ')).toHaveValue('focus-a');
  await page.evaluate(() => window.setSearch('?focus=focus-b'));
  await expect(page.getByLabel('Người liên hệ')).toHaveValue('focus-b');
  await expect(page.getByLabel('Người phụ trách')).toHaveValue('original-owner');
  await expect(page.getByLabel('Khu vực')).toHaveValue('Vùng đang lưu');
  await expect(page.getByLabel('Mảng dịch vụ quan tâm')).toHaveValue('Dịch vụ đang lưu');
  await page.getByLabel('Người liên hệ').fill('Đổi tên thôi');
  await page.getByRole('button', { name: 'Lưu', exact: true }).click();
  await expect.poll(() => saved?.name).toBe('Đổi tên thôi');
  expect(saved.ownerId).toBe('original-owner'); expect(saved.region).toBe('Vùng đang lưu'); expect(saved.serviceLine).toBe('Dịch vụ đang lưu');
});

test('late focus lookup cannot replace an add form the user has started', async ({ page }) => {
  await baseRoutes(page); let release, requested = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/leads/board*', route => route.fulfill({ json: board() }));
  await page.route('**/api/data/leads?id=slow', async route => { requested = true; await gate; return route.fulfill({ json: [lead('slow', 'Phản hồi cũ')] }); });
  await mountLeadBoard(page, '?focus=slow');
  await expect.poll(() => requested).toBe(true);
  await page.getByRole('button', { name: 'Thêm khách tiềm năng', exact: true }).click();
  await page.getByLabel('Người liên hệ').fill('Bản nháp mới');
  release();
  await expect(page.getByRole('dialog', { name: 'Thêm khách tiềm năng' })).toBeVisible();
  await expect(page.getByLabel('Người liên hệ')).toHaveValue('Bản nháp mới');
});

test('conversion response after a session change cannot redirect or show a previous account result', async ({ page }) => {
  await baseRoutes(page); let release, requested = false;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/leads/board*', route => route.fulfill({ json: board() }));
  await page.route('**/api/data/leads?id=won-lead', route => route.fulfill({ json: [{ ...lead('won-lead'), stage: 'won' }] }));
  await page.route('**/api/leads/won-lead/convert', async route => { requested = true; await gate; return route.fulfill({ json: { clientId: 'client-from-old-session' } }); });
  await mountLeadBoard(page, '?focus=won-lead');
  await page.getByRole('button', { name: 'Chuyển thành khách hàng', exact: true }).click();
  await expect.poll(() => requested).toBe(true);
  await page.evaluate(() => { window.setSearch(''); window.setUser({ id: 'am-b', roles: ['AM'] }); });
  await expect(page.getByRole('dialog')).toHaveCount(0);
  release();
  await expect.poll(() => page.evaluate(() => window.lastRoute || '')).toBe('');
  expect(await page.evaluate(() => window.messages.some(message => message.includes('Đã tạo khách hàng')))).toBe(false);
});
