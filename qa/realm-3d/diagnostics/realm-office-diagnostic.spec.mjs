import { test, expect } from '@playwright/test';
import { writeFile } from 'node:fs/promises';

test('diagnostic 960x600 archive route, return controls and two actual material captures', async ({ page }, testInfo) => {
  const errors = [], warnings = [], events = [], observations = [];
  const started = performance.now();
  const note = name => events.push({ name, elapsedMs: Math.round(performance.now() - started) });
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => { if (['warning', 'error'].includes(message.type()) && warnings.length < 40) warnings.push(message.text()); });
  const world = page.locator('[data-realm-world-version="3d"]');
  const observe = async name => {
    const value = await world.evaluate(element => {
      const canvas = element.querySelector('canvas'), gl = canvas?.getContext('webgl2');
      const rendererInfo = gl?.getExtension('WEBGL_debug_renderer_info');
      return { world: { ...element.dataset }, canvas: canvas ? { width: canvas.width, height: canvas.height } : null,
        renderer: gl && rendererInfo ? gl.getParameter(rendererInfo.UNMASKED_RENDERER_WEBGL) : null };
    });
    observations.push({ name, elapsedMs: Math.round(performance.now() - started), ...value });
  };
  try {
    await page.goto('/realm-demo?world=3d'); note('document loaded');
    await expect(world).toHaveAttribute('data-ready', 'true', { timeout: 45000 });
    await expect(world).toHaveAttribute('data-materials', 'ready', { timeout: 20000 });
    await expect(world).toHaveAttribute('data-quality', 'balanced'); note('balanced materials ready');
    await observe('initial balanced');
    await page.getByRole('button', { name: 'Chọn địa điểm', exact: true }).click(); note('directory opened');
    await page.getByRole('region', { name: 'Các khu vực làm việc' }).getByRole('button', { name: /^\d{2} Thư viện/ }).click(); note('archive route selected');
    await expect(world).toHaveAttribute('data-paused', 'true', { timeout: 45000 });
    await expect.poll(() => world.evaluate(element => Math.hypot(Number(element.dataset.playerX) + 10.2, Number(element.dataset.playerZ) + 3.75))).toBeLessThanOrEqual(.2);
    // Archive deliberately dispatches briefing/realm-gate, labelled Đại sảnh.
    await expect(page.getByRole('complementary', { name: 'Đại sảnh', exact: true })).toBeVisible(); note('real briefing opened after arrival');
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    await expect(world).not.toHaveAttribute('data-paused', 'true'); note('returned to world');
    await page.getByRole('button', { name: 'Đổi góc nhìn nhân vật', exact: true }).click();
    await expect(world).toHaveAttribute('data-camera', 'first');
    await observe('archive balanced before screenshot');
    await page.screenshot({ path: testInfo.outputPath('archive-balanced-960.png'), scale: 'css', timeout: 10000 }); note('balanced screenshot captured');
    await page.getByRole('button', { name: 'Xem toàn cảnh', exact: true }).click();
    await expect(world).toHaveAttribute('data-camera', 'overview');
    await page.getByRole('button', { name: 'Xem toàn cảnh', exact: true }).click();
    await expect(world).toHaveAttribute('data-camera', 'follow'); note('overview returned to follow');
    await page.getByRole('button', { name: 'Cài đặt đồ họa', exact: true }).click();
    await page.getByRole('button', { name: /^Ưu tiên độ nét/ }).click();
    await page.getByRole('region', { name: 'Chất lượng đồ họa' }).getByRole('button', { name: /^Đồ họa cao/ }).click();
    await expect(world).toHaveAttribute('data-quality', 'high');
    await expect(world).toHaveAttribute('data-resolution-preference', 'clarity');
    await page.getByRole('button', { name: 'Đổi góc nhìn nhân vật', exact: true }).click();
    await expect(world).toHaveAttribute('data-camera', 'first');
    await observe('archive high before screenshot');
    await page.screenshot({ path: testInfo.outputPath('archive-high-960.png'), scale: 'css', timeout: 10000 }); note('high screenshot captured');
    // Return the diagnostic browser to the lighter preset before teardown.
    await page.getByRole('button', { name: 'Cài đặt đồ họa', exact: true }).click();
    await page.getByRole('region', { name: 'Chất lượng đồ họa' }).getByRole('button', { name: /^Đồ họa nhẹ/ }).click();
    await expect(world).toHaveAttribute('data-quality', 'balanced'); note('balanced restored');
    expect(errors).toEqual([]);
  } finally {
    // Does not query an unresponsive page during teardown. Progress/errors
    // already received are retained even when a bounded action times out.
    await writeFile(testInfo.outputPath('diagnostic-observation.json'), JSON.stringify({
      scope: '960x600 DPR1 reduced-motion functional/visual diagnostic; not standard profile, D60 or AAA evidence',
      seededPreference: { quality: 'balanced', resolution: 'auto' }, tracing: false,
      viewport: { width: 960, height: 600 }, events, observations, errors, warnings,
    }, null, 2));
  }
});
