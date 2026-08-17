import { test, expect } from '@playwright/test';

const SURFACES = [
  ['Phòng điều hành', 'Phòng điều hành'],
  ['Sổ bộ Guild', 'Thành viên'],
  ['Bàn dự án', 'Phòng dự án'],
  ['Kho bạc Gold', 'Kho bạc Gold'],
  ['Quảng trường Đèn', 'Lantern Mail'],
  ['Bàn hội đồng', 'Bàn công việc'],
  ['Lối vào Guildhall', 'Đại sảnh'],
  ['Xưởng Guild', 'Xưởng phẩm'],
];

test.beforeEach(async ({ page }) => {
  const issues = [];
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') issues.push(`console.error: ${message.text()}`);
    if (message.type() === 'warning' && /remotion|autoplay|license/i.test(message.text())) issues.push(`console.warning: ${message.text()}`);
  });
  page.__realmIssues = issues;
  await page.goto('/realm-demo?realmDebug=1');
  await expect(page.locator('canvas[data-realm-runtime="canvas-2d-fixed-step"]')).toBeVisible();
});

test.afterEach(async ({ page }) => {
  expect(page.__realmIssues || []).toEqual([]);
});

test('v3 is a live layered world with bounded locomotion and no static environment plate', async ({ page, isMobile }, testInfo) => {
  const canvas = page.locator('canvas[data-realm-runtime="canvas-2d-fixed-step"]');
  await expect(canvas).toHaveAttribute('data-realm-renderer', 'canvas2d');
  await expect(page.locator('[data-realm-world-version="3"]')).toHaveAttribute('data-realm-quality', isMobile ? 'low' : /medium|high/);
  await expect(page.locator('[data-realm-world-version="3"] img[src*="guildhall-environment"]')).toHaveCount(0);
  await expect.poll(async () => Number(await canvas.getAttribute('data-realm-x'))).toBeGreaterThan(0);

  const before = await canvas.evaluate((element) => ({ x: Number(element.dataset.realmX), y: Number(element.dataset.realmY) }));
  if (isMobile) {
    const box = await canvas.boundingBox();
    await canvas.click({ position: { x: Math.min(box.width - 30, box.width / 2 + 70), y: box.height / 2 } });
  } else {
    await page.keyboard.down('d');
    await page.waitForTimeout(420);
    await page.keyboard.up('d');
  }
  await expect.poll(async () => {
    const x = Number(await canvas.getAttribute('data-realm-x'));
    const y = Number(await canvas.getAttribute('data-realm-y'));
    return Math.hypot(x - before.x, y - before.y);
  }).toBeGreaterThan(.12);
  const after = await canvas.evaluate((element) => ({ x: Number(element.dataset.realmX), y: Number(element.dataset.realmY) }));
  expect(Math.hypot(after.x - before.x, after.y - before.y)).toBeLessThan(3);

  await expect.poll(async () => Number(await canvas.getAttribute('data-realm-render-p95'))).toBeGreaterThan(0);
  const renderP95 = Number(await canvas.getAttribute('data-realm-render-p95'));
  expect(renderP95).toBeLessThanOrEqual(isMobile ? 22 : 16.7);
  await expect(page.getByRole('button', { name: 'Bỏ qua chuyển cảnh', exact: true })).toHaveCount(0);

  const screenshot = testInfo.outputPath(isMobile ? 'realm-world-v3-mobile.png' : 'realm-world-v3-desktop.png');
  await page.screenshot({ path: screenshot, fullPage: false });
  await testInfo.attach('Realm World v3', { path: screenshot, contentType: 'image/png' });
});

test('Waygate reaches every canonical business surface without removing the spatial context', async ({ page }) => {
  for (const [destination, surfaceName] of SURFACES) {
    await page.getByRole('button', { name: 'Mở danh sách địa điểm', exact: true }).click();
    const menu = page.getByText('Mạng Waygate').locator('..');
    await expect(menu).toBeVisible();
    await page.getByRole('button', { name: `Mở ${destination}`, exact: true }).click();
    const surface = page.getByRole('complementary', { name: surfaceName, exact: true });
    await expect(surface).toBeVisible({ timeout: 5_000 });
    await expect(page.locator('canvas[data-realm-runtime="canvas-2d-fixed-step"]')).toBeVisible();
    await surface.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(surface).toBeHidden();
  }
});

test('language switch localizes the live world and keeps user-authored records intact', async ({ page }) => {
  const businessRecord = await page.locator('[data-realm-next-quest]').textContent();
  await page.getByRole('button', { name: 'EN', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'en');
  await expect(page.getByRole('button', { name: 'Open location list', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Open location list', exact: true }).click();
  await expect(page.getByText('Waygate network', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open Operations Room', exact: true })).toBeVisible();
  await expect(page.locator('[data-realm-next-quest]')).toHaveText(businessRecord);
  await page.getByRole('button', { name: 'VI', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('lang', 'vi');
  await expect(page.getByRole('button', { name: 'Mở danh sách địa điểm', exact: true })).toBeVisible();
});

test('Gold world feedback appears only after the canonical wallet mutation succeeds', async ({ page }) => {
  await expect(page.getByText('Canonical receipt đã xác nhận', { exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'Mở danh sách địa điểm', exact: true }).click();
  await page.getByRole('button', { name: 'Mở Bàn hội đồng', exact: true }).click();
  const surface = page.getByRole('complementary', { name: 'Bàn công việc', exact: true });
  await expect(surface).toBeVisible();
  await surface.getByRole('button', { name: /^Nhận \d+ Gold$/ }).click();
  await expect(page.getByText('Canonical receipt đã xác nhận', { exact: true })).toBeVisible();
  await expect(page.getByText('Ví và Chronicle đã cập nhật cùng nguồn', { exact: true })).toBeVisible();
});

test('mobile HUD stays inside the viewport and only nearby world proxies are focusable', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile HUD gate runs in a mobile Playwright project.');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await expect(page.locator('[class*="touchControls"]')).toHaveAttribute('aria-hidden', 'true');
  await expect(page.locator('[class*="accessibleProxy"]')).toHaveCount(0);
  const soundControl = page.getByRole('button', { name: 'Bật âm thanh Realm', exact: true });
  await expect(soundControl).toBeVisible();
  await soundControl.click();
  await expect(page.getByRole('button', { name: 'Tắt âm thanh Realm', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('combobox', { name: 'Trạng thái hiện diện', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /Mở Chronicle, số dư/ })).toHaveCount(0);
  for (const language of ['VI', 'EN']) {
    const rect = await page.getByRole('button', { name: language, exact: true }).boundingBox();
    expect(rect.width).toBeGreaterThanOrEqual(44);
    expect(rect.height).toBeGreaterThanOrEqual(44);
  }
  await page.getByRole('button', { name: /Mọi người, \d+ online/ }).click();
  const peopleSurface = page.getByRole('complementary', { name: 'Thành viên', exact: true });
  await expect(peopleSurface).toBeVisible({ timeout: 5_000 });
  const presenceControl = peopleSurface.getByRole('combobox', { name: 'Trạng thái hiện diện', exact: true });
  await expect(presenceControl).toBeVisible();
  await presenceControl.selectOption('focus');
  await expect(presenceControl).toHaveValue('focus');
  await peopleSurface.getByRole('button', { name: 'Đóng', exact: true }).click();
  for (const button of await page.locator('[class*="touchControls"] button').all()) {
    await expect(button).toBeDisabled();
    await expect(button).toHaveAttribute('tabindex', '-1');
  }
  const hudCoverage = await page.evaluate(() => {
    const selectors = ['[class*="commandBar"]', '[class*="actionDock"]', '[class*="worldControls"]', '[class*="worldTitle"]'];
    const rects = selectors.flatMap((selector) => [...document.querySelectorAll(selector)]).map((element) => element.getBoundingClientRect());
    let covered = 0;
    let total = 0;
    for (let y = 2; y < innerHeight; y += 4) {
      for (let x = 2; x < innerWidth; x += 4) {
        total += 1;
        if (rects.some((rect) => x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom)) covered += 1;
      }
    }
    return covered / total;
  });
  expect(hudCoverage).toBeLessThanOrEqual(.22);
  await page.getByRole('button', { name: 'Mở điều khiển di chuyển', exact: true }).click();
  await expect(page.locator('[class*="touchControls"]')).toHaveAttribute('aria-hidden', 'false');
  const offenders = await page.evaluate(() => [...document.querySelectorAll('button, a, input, select, [tabindex="0"]')]
    .filter((element) => {
      if (element.matches('[class*="skipLink"]')) return false;
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      const rect = element.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && (rect.right < -1 || rect.left > innerWidth + 1 || rect.bottom < -1 || rect.top > innerHeight + 1);
    })
    .map((element) => element.getAttribute('aria-label') || element.textContent?.trim().slice(0, 50)));
  expect(offenders).toEqual([]);
  for (const button of await page.locator('[class*="touchControls"] button').all()) {
    await expect(button).toBeEnabled();
    const rect = await button.boundingBox();
    expect(rect.height).toBeGreaterThanOrEqual(44);
    expect(rect.width).toBeGreaterThanOrEqual(44);
  }

  await page.setViewportSize({ width: 360, height: 800 });
  await expect(page.locator('header[class*="commandBar"] > div[class*="brand"]').first()).toBeHidden();
  const commandBar = await page.locator('[class*="commandBar"]').boundingBox();
  expect(commandBar.x).toBeGreaterThanOrEqual(0);
  expect(commandBar.x + commandBar.width).toBeLessThanOrEqual(360);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('v2 rollback remains available without changing business routes', async ({ page, isMobile }) => {
  await page.goto('/realm-demo?world=v2');
  await expect(page.locator('canvas[data-realm-runtime="canvas-2d-fixed-step"]')).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Không gian Guildhall tương tác' })).toBeVisible();
  const rollbackLabel = page.getByText('Realm World v2 · rollback', { exact: true });
  await expect(rollbackLabel).toHaveCount(1);
  if (!isMobile) await expect(rollbackLabel).toBeVisible();
  await expect(page.getByRole('link', { name: 'Mở workspace ERP CRM gốc' })).toHaveAttribute('href', '/dashboard');
});
