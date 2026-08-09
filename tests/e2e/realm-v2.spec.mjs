import { expect, test } from '@playwright/test';

test('all 18 Realm v2 compositions require an authenticated product session', async ({ request }) => {
  for (const slug of ['home', 'my-work', 'work-management', 'action-center', 'command-center', 'approvals', 'inbox', 'collaboration', 'projects', 'chronicle', 'world-map', 'ceo-terminal', 'employee-profile', 'recognition', 'notifications', 'search', 'settings', 'mobile']) {
    const response = await request.get(`/realm-v2/${slug}`, { maxRedirects: 0 });
    expect([307, 308]).toContain(response.status());
    expect(response.headers().location).toBe(`/login?callbackUrl=%2Frealm-v2%2F${slug}`);
  }
});

test('visual QA remains isolated and does not replace the authenticated product', async ({ page }) => {
  await page.goto('/realm-v2/design-system');
  await expect(page.getByRole('heading', { name: 'Design System QA', level: 1 })).toBeVisible();
  await expect(page.getByText('Preview fixtures · Non-canonical')).toBeVisible();
});
