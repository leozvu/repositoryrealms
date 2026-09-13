import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test.setTimeout(90000);
// Continuous trace screencasts read back the live GPU canvas at mobile DPR.
// Keep DOM/network/source diagnostics and explicit CSS-sized evidence instead.
test.use({ trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true } });

async function openOffice(page) {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto('/realm-demo?world=3d');
  const world = page.locator('[data-realm-world-version="3d"]');
  await expect(world).toHaveAttribute('data-ready', 'true', { timeout: 45000 });
  await expect(world).toHaveAttribute('data-materials', 'ready', { timeout: 20000 });
  // Software-rendered CI validates behavior; its timings are not a device benchmark.
  await page.getByRole('button', { name: 'Cài đặt đồ họa', exact: true }).click();
  await page.getByRole('region', { name: 'Chất lượng đồ họa' }).getByRole('button', { name: /^Đồ họa nhẹ/ }).click();
  await expect(world).toHaveAttribute('data-quality', 'balanced');
  return { world, errors };
}

test('3D office has functional first-person and overview cameras without layout overflow', async ({ page }, testInfo) => {
  const { world, errors } = await openOffice(page);
  await page.getByRole('button', { name: 'Đổi góc nhìn nhân vật', exact: true }).click();
  await expect(world).toHaveAttribute('data-camera', 'first');
  await page.screenshot({ path: testInfo.outputPath('first-person.png'), scale: 'css' });
  await page.getByRole('button', { name: 'Xem toàn cảnh', exact: true }).click();
  await expect(world).toHaveAttribute('data-camera', 'overview');
  await page.screenshot({ path: testInfo.outputPath('overview.png'), scale: 'css' });
  await page.getByRole('button', { name: 'Xem toàn cảnh', exact: true }).click();
  await expect(world).toHaveAttribute('data-camera', 'follow');
  await page.screenshot({ path: testInfo.outputPath('follow-restored.png'), scale: 'css' });
  const size = await page.evaluate(() => ({ width: document.documentElement.scrollWidth, viewport: innerWidth, canvas: document.querySelector('[data-realm-world-version="3d"] canvas').getBoundingClientRect().height, height: innerHeight }));
  expect(size.width).toBeLessThanOrEqual(size.viewport + 1);
  expect(size.canvas).toBeLessThanOrEqual(size.height + 1);
  expect(errors).toEqual([]);
});

test('medieval work bay opens the real archive and preserves camera controls on return', async ({ page }, testInfo) => {
  const { world, errors } = await openOffice(page);
  await page.getByRole('button', { name: 'Chọn địa điểm', exact: true }).click();
  await page.getByRole('region', { name: 'Các khu vực làm việc' }).getByRole('button', { name: /^\d{2} Thư viện/ }).click();
  await expect(world).toHaveAttribute('data-paused', 'true', { timeout: 45000 });
  await expect.poll(async () => Math.hypot(Number(await world.getAttribute('data-player-x')) + 10.2,
    Number(await world.getAttribute('data-player-z')) + 3.75)).toBeLessThanOrEqual(.2);
  await expect(page.getByRole('button', { name: 'Đóng bàn làm việc', exact: true })).toBeAttached();
  await page.getByRole('button', { name: 'Đóng', exact: true }).click();
  await expect(world).not.toHaveAttribute('data-paused', 'true');
  await page.getByRole('button', { name: 'Đổi góc nhìn nhân vật', exact: true }).click();
  await expect(world).toHaveAttribute('data-camera', 'first');
  await page.screenshot({ path: testInfo.outputPath('medieval-bay-first.png'), scale: 'css' });
  await page.getByRole('button', { name: 'Xem toàn cảnh', exact: true }).click();
  await expect(world).toHaveAttribute('data-camera', 'overview');
  await page.getByRole('button', { name: 'Xem toàn cảnh', exact: true }).click();
  await expect(world).toHaveAttribute('data-camera', 'follow');
  await page.screenshot({ path: testInfo.outputPath('medieval-bay-follow.png'), scale: 'css' });
  await page.getByRole('button', { name: 'Cài đặt đồ họa', exact: true }).click();
  await page.getByRole('button', { name: /^Ưu tiên độ nét/ }).click();
  await expect(world).toHaveAttribute('data-resolution-preference', 'clarity');
  await page.getByRole('region', { name: 'Chất lượng đồ họa' }).getByRole('button', { name: /^Đồ họa cao/ }).click();
  await expect(world).toHaveAttribute('data-quality', 'high');
  await expect.poll(async () => Number(await world.getAttribute('data-render-scale'))).toBeGreaterThanOrEqual(.75);
  await page.getByRole('button', { name: 'Đổi góc nhìn nhân vật', exact: true }).click();
  await expect(world).toHaveAttribute('data-camera', 'first');
  await page.screenshot({ path: testInfo.outputPath('medieval-bay-high.png'), scale: 'css' });
  await writeFile(testInfo.outputPath('medieval-observation.json'), JSON.stringify({
    project: testInfo.project.name,
    scope: 'Functional/visual observation; not an AAA performance benchmark',
    viewport: page.viewportSize(),
    world: await world.evaluate(element => ({ ...element.dataset })),
    errors,
  }, null, 2));
  await testInfo.attach('render-observation', { body: JSON.stringify(await world.evaluate(element => ({ ...element.dataset })), null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('resolution preference survives reload and its menu is keyboard accessible', async ({ page }) => {
  test.setTimeout(120000); // Two complete initializations, including a cold load.
  const { world, errors } = await openOffice(page);
  const settings = page.getByRole('button', { name: 'Cài đặt đồ họa', exact: true });
  await settings.click();
  await page.getByRole('button', { name: /^Ưu tiên độ nét/ }).click();
  await expect(world).toHaveAttribute('data-resolution-preference', 'clarity');
  await expect.poll(async () => Number(await world.getAttribute('data-render-scale'))).toBeGreaterThanOrEqual(.75);
  await page.keyboard.press('Escape');
  await expect(settings).toBeFocused();
  await page.reload();
  await expect(world).toHaveAttribute('data-ready', 'true', { timeout: 45000 });
  await expect(world).toHaveAttribute('data-resolution-preference', 'clarity');
  await expect.poll(async () => Number(await world.getAttribute('data-render-scale'))).toBeGreaterThanOrEqual(.75);
  await settings.click();
  await expect(page.getByRole('button', { name: /^Ưu tiên độ nét/ })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: /^Tự điều chỉnh/ }).click();
  await expect(world).toHaveAttribute('data-resolution-preference', 'auto');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  expect(overflow).toBe(false);
  expect(errors).toEqual([]);
});

test('each work location can be reached and opens its existing workspace panel', async ({ page, isMobile }, testInfo) => {
  test.setTimeout(240000);
  const { world, errors } = await openOffice(page);
  const stops = isMobile ? ['Bàn công việc', 'Phòng họp'] : ['Bàn công việc', 'Bàn dự án', 'Kho bạc', 'Thư viện', 'Phòng đội nhóm', 'Phòng điều hành', 'Góc cá nhân', 'Phòng họp'];
  for (const name of stops) {
    await page.getByRole('button', { name: 'Chọn địa điểm', exact: true }).click();
    await page.getByRole('region', { name: 'Các khu vực làm việc' }).getByRole('button', { name: new RegExp('^\\d{2} ' + name) }).click();
    await expect(world).toHaveAttribute('data-paused', 'true', { timeout: 45000 });
    await expect(page.getByRole('button', { name: 'Đóng bàn làm việc', exact: true })).toBeAttached();
    // Capture one real work surface; eight full-frame software screenshots add
    // GPU readback overhead without testing additional interactions.
    if (name === stops[0]) await page.screenshot({ path: testInfo.outputPath('work-panel.png'), scale: 'css' });
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(world).not.toHaveAttribute('data-paused', 'true');
  }
  await testInfo.attach('render-observation', { body: JSON.stringify(await world.evaluate(element => ({ ...element.dataset })), null, 2), contentType: 'application/json' });
  expect(errors).toEqual([]);
});

test('movement works with keyboard and releases when a workspace opens', async ({ page }) => {
  const { world } = await openOffice(page);
  const before = await world.getAttribute('data-player-z');
  await page.locator('[data-realm-world-version="3d"] canvas').focus();
  await page.keyboard.down('w');
  try { await expect.poll(() => world.getAttribute('data-player-z')).not.toBe(before); }
  finally { await page.keyboard.up('w'); }
  await page.getByRole('button', { name: 'Công việc', exact: true }).click();
  await expect(world).toHaveAttribute('data-paused', 'true', { timeout: 45000 });
  await expect(page.locator('[data-realm-world-version="3d"] canvas')).toHaveAttribute('tabindex', '-1');
});

test('an explicit graphics choice survives returning from Chronicle', async ({ page }, testInfo) => {
  const { world, errors } = await openOffice(page);
  await page.getByRole('button', { name: 'Cài đặt đồ họa', exact: true }).click();
  await page.getByRole('region', { name: 'Chất lượng đồ họa' }).getByRole('button', { name: /^Đồ họa cao/ }).click();
  await expect(world).toHaveAttribute('data-quality', 'high');
  await page.getByRole('navigation', { name: 'Hành động chính trong Guildhall' }).getByRole('button', { name: 'Gold', exact: true }).click();
  await expect(world).toHaveCount(0);
  await page.getByRole('button', { name: 'Guildhall', exact: true }).click();
  await expect(world).toHaveAttribute('data-ready', 'true', { timeout: 45000 });
  await expect(world).toHaveAttribute('data-materials', 'ready', { timeout: 20000 });
  await expect(world).toHaveAttribute('data-quality', 'high');
  await page.screenshot({ path: testInfo.outputPath('high-profile.png'), scale: 'css' });
  expect(errors).toEqual([]);
});
