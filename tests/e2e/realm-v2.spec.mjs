import { expect, test } from '@playwright/test';

test('Realm v2 entries redirect into canonical ERP and Realm workflows', async ({ request }) => {
  const mappings = {
    home: '/dashboard',
    'my-work': '/myday',
    'work-management': '/tasks',
    projects: '/projects',
    approvals: '/approvals',
    settings: '/settings',
    chronicle: '/realm',
  };
  for (const [slug, canonicalPath] of Object.entries(mappings)) {
    const response = await request.get(`/realm-v2/${slug}`, { maxRedirects: 0 });
    expect([307, 308]).toContain(response.status());
    expect(response.headers().location).toBe(canonicalPath);
  }
});

test('visual QA remains isolated and does not replace the authenticated product', async ({ page }) => {
  await page.goto('/realm-v2/design-system');
  await expect(page.getByRole('heading', { name: 'Design System QA', level: 1 })).toBeVisible();
  await expect(page.getByText('Preview fixtures · Non-canonical')).toBeVisible();
});
