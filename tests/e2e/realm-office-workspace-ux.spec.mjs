import { test, expect } from '@playwright/test';

test.setTimeout(90000);
test.use({ trace: { mode: 'retain-on-failure', screenshots: false, snapshots: true, sources: true } });

async function openOffice(page) {
  await page.goto('/realm-demo?world=3d');
  const world = page.locator('[data-realm-world-version="3d"]');
  await expect(world).toHaveAttribute('data-ready', 'true', { timeout: 45000 });
  await page.getByRole('button', { name: 'Cài đặt đồ họa', exact: true }).click();
  await page.getByRole('region', { name: 'Chất lượng đồ họa' }).getByRole('button', { name: /^Đồ họa nhẹ/ }).click();
  await expect(world).toHaveAttribute('data-quality', 'balanced');
  return world;
}

test('office menus stay exclusive and Escape returns keyboard focus to their trigger', async ({ page }) => {
  await openOffice(page);
  const places = page.getByRole('button', { name: 'Chọn địa điểm', exact: true });
  const graphics = page.getByRole('button', { name: 'Cài đặt đồ họa', exact: true });
  const help = page.getByRole('button', { name: /Điều khiển/ });
  await places.click();
  await expect(page.getByRole('region', { name: 'Các khu vực làm việc' })).toBeVisible();
  await graphics.click();
  await expect(places).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('region', { name: 'Các khu vực làm việc' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Chất lượng đồ họa' })).toBeVisible();
  await help.click();
  await expect(graphics).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('region', { name: 'Chất lượng đồ họa' })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Hướng dẫn điều khiển' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('region', { name: 'Hướng dẫn điều khiển' })).toHaveCount(0);
  await expect(help).toBeFocused();
  await graphics.click();
  await page.getByRole('region', { name: 'Chất lượng đồ họa' }).getByRole('button', { name: /^Đồ họa nhẹ/ }).click();
  await expect(graphics).toBeFocused();
});

test('the readable directory scrolls to every station inside the available viewport', async ({ page, isMobile }) => {
  await openOffice(page);
  const trigger = page.getByRole('button', { name: 'Chọn địa điểm', exact: true });
  await trigger.click();
  const directory = page.getByRole('region', { name: 'Các khu vực làm việc' });
  const stations = directory.getByRole('button', { name: /^\d{2} / });
  await expect(stations).toHaveCount(8);
  const lastStation = stations.last();
  await lastStation.scrollIntoViewIfNeeded();
  await expect(lastStation).toBeInViewport();
  const layout = await directory.evaluate(element => {
    const box = element.getBoundingClientRect();
    const button = [...element.querySelectorAll(':scope > button')].at(-1);
    return { left: box.left, right: box.right, bottom: box.bottom, width: innerWidth, height: innerHeight,
      labelFont: parseFloat(getComputedStyle(button.querySelector('strong')).fontSize),
      hintFont: parseFloat(getComputedStyle(button.querySelector('small')).fontSize) };
  });
  expect(layout.left).toBeGreaterThanOrEqual(0);
  expect(layout.right).toBeLessThanOrEqual(layout.width);
  expect(layout.bottom).toBeLessThanOrEqual(layout.height - 80);
  expect(layout.labelFont).toBeGreaterThanOrEqual(13);
  expect(layout.hintFont).toBeGreaterThanOrEqual(11);
  await page.keyboard.press('Escape');
  await expect(trigger).toBeFocused();
  if (isMobile) {
    for (const name of ['Đi về phía trước', 'Đi sang trái', 'Đi lùi', 'Đi sang phải']) {
      const button = page.getByRole('button', { name, exact: true });
      await expect(button).toBeVisible();
      const box = await button.boundingBox();
      expect(box.width).toBeGreaterThanOrEqual(48);
      expect(box.height).toBeGreaterThanOrEqual(48);
    }
  }
});
