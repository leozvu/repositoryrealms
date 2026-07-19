import { test, expect } from '@playwright/test';

test('root uses a real HTTP redirect and all pages receive baseline security headers', async ({ request }) => {
  const root = await request.get('/', { maxRedirects: 0 });
  expect(root.status()).toBe(307);
  expect(root.headers().location).toBe('/dashboard');

  const response = await request.get('/realm-demo');
  expect(response.ok()).toBeTruthy();
  const headers = response.headers();
  expect(headers['x-powered-by']).toBeUndefined();
  expect(headers['x-content-type-options']).toBe('nosniff');
  expect(headers['x-frame-options']).toBe('DENY');
  expect(headers['referrer-policy']).toBe('strict-origin-when-cross-origin');
  expect(headers['permissions-policy']).toContain('camera=(self)');
  expect(headers['content-security-policy']).toContain("frame-ancestors 'none'");
});

test('the product Realm uses the original ERP authentication boundary', async ({ request }) => {
  const response = await request.get('/realm', { maxRedirects: 0 });
  expect(response.status()).toBe(307);
  expect(response.headers().location).toBe('/login');
});

test('cross-surface collaboration APIs preserve the ERP authentication boundary', async ({ request }) => {
  for (const route of ['/api/collaboration/presence', '/api/collaboration/contact']) {
    const response = await request.get(route);
    expect(response.status()).toBe(401);
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers().vary).toContain('Cookie');
    await expect(response.json()).resolves.toMatchObject({ error: 'unauthorized', code: 'unauthorized' });
  }
});

test('Realm API responses expose safe correlation and latency diagnostics', async ({ request }) => {
  const response = await request.get('/api/realm-demo/health');
  expect([401, 503]).toContain(response.status());
  const headers = response.headers();
  expect(headers['x-realm-request-id']).toMatch(/^realm_[a-zA-Z0-9-]{12,}$/);
  expect(headers['x-realm-duration-ms']).toMatch(/^\d+(\.\d+)?$/);
  expect(headers['x-realm-outcome']).toMatch(/^(disabled|rejected)$/);
  expect(headers['server-timing']).toMatch(/^realm;dur=\d+(\.\d+)?$/);
  expect(headers['cache-control']).toContain('no-store');
  const body = await response.json();
  expect(body.requestId).toBe(headers['x-realm-request-id']);
  expect(JSON.stringify(body)).not.toContain('DATABASE_URL');
});

test('anonymous clients cannot issue Realm record commands', async ({ request }) => {
  const commands = [
    { action: 'task.transition', entityId: 'task-demo', expectedState: 'todo', nextState: 'in_progress' },
    { action: 'task.comment.create', entityId: 'task-demo', content: 'anonymous note' },
    { action: 'lead.followup.create', entityId: 'lead-demo', kind: 'call', title: 'anonymous follow-up', date: '2026-07-21' },
  ];
  for (const [index, data] of commands.entries()) {
    const response = await request.post('/api/realm-demo/actions', {
      headers: { 'Idempotency-Key': `realm-action:anonymous-smoke:${index}` },
      data,
    });
    expect([401, 503]).toContain(response.status());
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers().vary).toContain('Cookie');
    const body = await response.json();
    expect(['unauthorized', 'realm_erp_sync_disabled']).toContain(body.code);
  }
});

test('anonymous ERP navigation lands on an accessible login form', async ({ page }) => {
  await page.goto('/tasks?focus=task-demo&from=realm');
  await expect(page).toHaveURL(/\/login$/);

  const email = page.getByLabel('Email', { exact: true });
  const password = page.getByLabel('Mật khẩu', { exact: true });
  const otp = page.getByLabel('Mã 2FA (bỏ trống nếu chưa bật)', { exact: true });
  await expect(email).toHaveAttribute('autocomplete', 'username');
  await expect(password).toHaveAttribute('autocomplete', 'current-password');
  await expect(otp).toHaveAttribute('autocomplete', 'one-time-code');
  await expect(page.getByRole('button', { name: 'Đăng nhập', exact: true })).toBeEnabled();
});

test('Realm and ERP views expose the same live character status', async ({ page }) => {
  await page.goto('/realm-demo');
  await page.getByRole('button', { name: 'ERP · CRM', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Hồ sơ nhân sự kết nối nhân vật' })).toContainText('Adventurer Zero');
  await expect(page.getByRole('region', { name: 'Adventurer Zero' })).toContainText('Gold');
  await expect(page.getByText('Quest ↔ công việc ERP/CRM', { exact: true })).toBeVisible();
  const access = page.getByRole('region', { name: 'Quyền truy cập phiên ERP' });
  await expect(access).toContainText('DEMO · 8/8 khu vực khả dụng');
  const ledgerTabs = page.getByRole('navigation', { name: 'Chọn khu vực điều hành ERP' }).getByRole('button');
  await expect(ledgerTabs).toHaveCount(5);
  for (let index = 0; index < 5; index += 1) await expect(ledgerTabs.nth(index)).toBeEnabled();
  const bridge = page.getByRole('region', { name: 'Cổng nghiệp vụ ERP/CRM' });
  await expect(bridge).toContainText('Medieval label chỉ là lớp giao diện');
  await expect(bridge.getByRole('link')).toHaveCount(7);
  await expect(bridge.getByRole('link', { name: /Quest Board/ })).toHaveAttribute('href', '/tasks');
  await expect(bridge.getByRole('link', { name: /War Room/ })).toHaveAttribute('href', '/projects');
  await expect(bridge.getByRole('link', { name: /Guild Roster/ })).toHaveAttribute('href', '/staff');
  await expect(bridge.locator('[aria-disabled="true"]')).toHaveCount(0);
});

test('demo Realm stays an explicit local sandbox when product ERP sync is enabled', async ({ page }) => {
  test.skip(process.env.NEXT_PUBLIC_REALM_ERP_SYNC !== '1', 'Requires a build with the Realm ERP client integration enabled.');
  let operationsRequests = 0;
  page.on('request', (request) => {
    if (new URL(request.url()).pathname === '/api/realm-demo/operations') operationsRequests += 1;
  });
  await page.goto('/realm-demo');
  await page.getByRole('button', { name: 'ERP · CRM', exact: true }).click();
  const sync = page.getByRole('region', { name: 'Tình trạng đồng bộ Realm với ERP' }).first();
  await expect(sync).toContainText('Demo cục bộ · không ghi DB');
  await expect(sync).toContainText('Đang hiển thị dữ liệu demo cục bộ; mọi thay đổi tại đây không được ghi vào ERP.');
  await expect(sync).not.toContainText('Mã hỗ trợ');
  await expect(sync.getByRole('button', { name: 'Thử đồng bộ' })).toHaveCount(0);
  expect(operationsRequests).toBe(0);
});

test('anonymous clients cannot write to the client error audit endpoint', async ({ request }) => {
  const response = await request.post('/api/errorlog', {
    data: { message: 'anonymous smoke report', stack: 'none', url: '/realm-demo' },
  });
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toContain('no-store');
});

test('Realm and ERP views remain usable without horizontal overflow', async ({ page, isMobile }) => {
  await page.goto('/realm-demo');
  await expect(page.getByText('CRMegoric Realms', { exact: true })).toBeVisible();
  const erpMode = page.getByRole('button', { name: 'ERP · CRM', exact: true });
  await expect(erpMode).toBeVisible();
  await expect(page.getByLabel(/Bản đồ văn phòng ảo/)).toBeVisible();

  await erpMode.click();
  await expect(page.getByRole('heading', { name: 'Sổ điều hành CRMegoric' })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Chọn khu vực điều hành ERP' })).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(1);

  const portalCards = page.getByRole('region', { name: 'Cổng nghiệp vụ ERP/CRM' }).getByRole('link');
  await expect(portalCards).toHaveCount(7);

  if (isMobile) {
    const tabMetrics = await page.getByRole('navigation', { name: 'Chọn khu vực điều hành ERP' }).getByRole('button').first().evaluate((element) => {
      const style = getComputedStyle(element);
      return { height: element.getBoundingClientRect().height, fontSize: Number.parseFloat(style.fontSize) };
    });
    expect(tabMetrics.height).toBeGreaterThanOrEqual(44);
    expect(tabMetrics.fontSize).toBeGreaterThanOrEqual(12);
    const portalMetrics = await portalCards.first().evaluate((element) => ({ height: element.getBoundingClientRect().height }));
    expect(portalMetrics.height).toBeGreaterThanOrEqual(44);
  }
});

test('Tavern request lifecycle survives a full page reload', async ({ page, isMobile }) => {
  test.skip(isMobile, 'The persistence contract only needs one browser profile; mobile layout is covered separately.');
  await page.goto('/realm-demo');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  await page.getByRole('button', { name: 'ERP · CRM', exact: true }).click();
  await page.getByRole('button', { name: 'Tavern', exact: true }).click();
  await page.getByRole('button', { name: 'Gửi duyệt Mentor Session chuyên môn với giá 16 Gold' }).click();
  await page.getByRole('button', { name: 'Xác nhận gửi duyệt' }).click();
  await page.getByRole('button', { name: 'Duyệt sandbox' }).click();
  await page.getByRole('button', { name: 'Xác nhận đã trao' }).click();
  await expect(page.getByText('Đã nhận thưởng', { exact: true })).toBeVisible();
  await expect.poll(() => page.evaluate(() => {
    const saved = JSON.parse(localStorage.getItem('crmegoric-realms:treasury:v1') || '{}');
    return saved.requests?.[0]?.fulfillmentStatus;
  })).toBe('fulfilled');

  await page.reload();
  await page.getByRole('button', { name: 'ERP · CRM', exact: true }).click();
  await page.getByRole('button', { name: 'Tavern', exact: true }).click();
  await expect(page.getByText('Mentor Session chuyên môn', { exact: true }).last()).toBeVisible();
  await expect(page.getByText('Đã nhận thưởng', { exact: true })).toBeVisible();
});

test('opening another tab for the same profile does not inflate online headcount', async ({ page, context, isMobile }) => {
  test.skip(isMobile, 'Multi-tab presence is browser-profile behavior and is covered once on desktop.');
  await page.goto('/realm-demo');
  await page.evaluate(() => localStorage.clear());
  await page.reload();
  const secondTab = await context.newPage();
  await secondTab.goto('/realm-demo');
  await expect(page.getByText('6 online', { exact: true })).toBeVisible();
  await expect(secondTab.getByText('6 online', { exact: true })).toBeVisible();
  await secondTab.close();
});
