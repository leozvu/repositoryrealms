import { expect, test } from '@playwright/test';

test('Realm v2 supports keyboard navigation, command palette and focus return', async ({ page }) => {
  await page.goto('/realm-v2/home');
  await expect(page.getByRole('heading', { name: 'Home', level: 1 })).toBeVisible();
  await page.keyboard.press('Control+K');
  const search = page.getByLabel('Search navigation and authorized commands');
  await expect(search).toBeFocused();
  await search.fill('approval');
  await expect(page.getByRole('button', { name: 'Review pending approvals' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(search).toBeHidden();
  const actionDestination = page.viewportSize().width <= 900
    ? page.getByRole('link', { name: 'Actions', exact: true })
    : page.getByRole('link', { name: 'Action Center', exact: true });
  await actionDestination.click();
  await expect(page.getByRole('heading', { name: 'Action Center', level: 1 })).toBeFocused();
  await page.getByRole('button', { name: 'Review evidence' }).first().click();
  await expect(page.getByRole('dialog', { name: 'Review approval evidence' })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('dialog')).toBeHidden();
});

test('mobile navigation has five safe destinations and no horizontal page overflow', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/realm-v2/my-work');
  const nav = page.getByRole('navigation', { name: 'Mobile primary navigation' });
  await expect(nav.getByRole('link')).toHaveCount(5);
  await expect(nav.getByRole('link', { name: 'My Work' })).toHaveAttribute('aria-current', 'page');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(overflow).toBe(false);
});

test('command cannot show confirmation until receipt is produced', async ({ page }) => {
  await page.goto('/realm-v2/command-center');
  await expect(page.getByText('Confirmed by canonical receipt')).toBeHidden();
  for (const label of ['Structure proposal', 'Submit for approval', 'Approve with check', 'Execute command', 'Verify canonical receipt']) {
    await page.getByRole('button', { name: label }).click();
  }
  await expect(page.getByText('Confirmed by canonical receipt')).toBeVisible();
  await expect(page.getByText('RR-2026-0729-1042-8F31')).toBeVisible();
});
