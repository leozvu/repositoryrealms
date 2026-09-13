import { test, expect } from '@playwright/test';
import { mountMyWorkHarness } from '../helpers/erp-component-harness.mjs';

const model = (status = 'todo') => ({
  queue: { ownerId: 'staff', version: 1 },
  queues: { planned: [{id:'task-a',title:'Chuẩn bị hồ sơ',status,workVersion:1,queuePosition:1},{id:'task-b',title:'Kiểm tra nội dung',status:'todo',workVersion:1,queuePosition:2}] },
  metrics: {open:2,doing:0,blocked:0,overdue:0},
});

test('My Work serializes actions and reloads a stale task without replaying the command', async ({ page }) => {
  let status = 'todo', writes = 0, release;
  const gate = new Promise(resolve => { release = resolve; });
  await page.route('**/api/execution/my-work', route => route.fulfill({ json: model(status) }));
  await page.route('**/api/approvals', route => route.fulfill({ json: {toApprove:[]} }));
  await page.route('**/api/execution/actions', async route => {
    writes++; await gate; status = 'doing';
    return route.fulfill({status:409,json:{error:'Task vừa được cập nhật ở nơi khác'}});
  });
  await mountMyWorkHarness(page);
  await expect(page.getByRole('button', {name:'Bắt đầu',exact:true})).toHaveCount(2);
  await page.getByRole('button', {name:'Bắt đầu',exact:true}).first().click();
  await expect(page.getByRole('button', {name:'Xếp cả bảng theo deadline'})).toBeDisabled();
  await expect(page.getByRole('button', {name:'Bắt đầu',exact:true}).last()).toBeDisabled();
  release();
  await expect(page.getByRole('heading', {name:/Công việc đã thay đổi ở nơi khác/})).toBeVisible();
  await expect(page.getByRole('button', {name:'Gửi review',exact:true})).toBeEnabled();
  expect(writes).toBe(1);
  expect(await page.evaluate(() => window.messages.some(text=>text==='Task ERP đã được cập nhật.'))).toBe(false);
});

test('My Work distinguishes unavailable approval and task data from a zero workload', async ({ page }) => {
  await page.route('**/api/execution/my-work', route => route.fulfill({status:500,json:{error:'Không thể tải công việc thử nghiệm'}}));
  await page.route('**/api/approvals', route => route.fulfill({status:503,json:{error:'unavailable'}}));
  await mountMyWorkHarness(page);
  await expect(page.getByRole('heading', {name:'Không thể tải công việc thử nghiệm'})).toBeVisible();
  await expect(page.getByRole('heading', {name:/Chưa tải được việc chờ duyệt/})).toBeVisible();
  await expect(page.locator('.metric strong')).toHaveText(['—','—','—','—','—']);
  await expect(page.getByText('Không có việc nào đang mở', {exact:true})).toHaveCount(0);
});
