import { test, expect } from '@playwright/test';

const runtimeIssues = new WeakMap();

async function loginPilotDirector(page) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(process.env.REALM_PILOT_E2E_EMAIL);
    await page.getByLabel('Mật khẩu', { exact: true }).fill(process.env.REALM_PILOT_E2E_PASSWORD);
    await page.getByRole('button', { name: 'Đăng nhập', exact: true }).click();
    try {
      await expect(page).toHaveURL(/\/(dashboard|realm)$/, { timeout: 10_000 });
      return;
    } catch (error) {
      if (attempt === 1) {
        const alert = await page.getByRole('alert').textContent().catch(() => '');
        throw new Error(`Pilot Director login failed${alert ? `: ${alert}` : ''}`, { cause: error });
      }
    }
  }
}

test.beforeEach(async ({ page }) => {
  const issues = [];
  runtimeIssues.set(page, issues);
  page.on('pageerror', (error) => issues.push(`pageerror: ${error.message}`));
  page.on('console', (message) => {
    if (message.type() === 'error') {
      const location = message.location();
      issues.push(`console.error${location.url ? ` (${location.url})` : ''}: ${message.text()}`);
    }
  });
});

test.afterEach(async ({ page }) => {
  expect(runtimeIssues.get(page) || []).toEqual([]);
});

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
  for (const route of ['/api/collaboration/presence', '/api/collaboration/contact', '/api/realm-demo/command-center', '/api/realm-demo/chronicle', '/api/realm-demo/pilot', '/api/realm-demo/feedback', '/api/realm-demo/readiness']) {
    const response = await request.get(route);
    expect([401, 503]).toContain(response.status());
    expect(response.headers()['cache-control']).toContain('no-store');
    expect(response.headers().vary).toContain('Cookie');
    const body = await response.json();
    expect(['unauthorized', 'realm_erp_sync_disabled']).toContain(body.code);
  }
  const launch = await request.post('/api/realm-demo/launch', { data: { policy: { mode: 'pilot' } } });
  expect([401, 503]).toContain(launch.status());
  expect(launch.headers()['cache-control']).toContain('no-store');
  expect(launch.headers().vary).toContain('Cookie');
  expect(['unauthorized', 'realm_erp_sync_disabled']).toContain((await launch.json()).code);
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
    { action: 'task.assign', entityId: 'task-demo', expectedAssigneeId: null, assigneeId: 'staff-demo', expectedPriority: 'medium', priority: 'high' },
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

test('pre-hydration login fallback never places credentials in the URL', async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: test.info().project.use.baseURL,
    javaScriptEnabled: false,
  });
  try {
    const page = await context.newPage();
    await page.goto('/login');
    const form = page.locator('form');
    await expect(form).toHaveAttribute('method', 'post');
    await expect(form).toHaveAttribute('action', '/login');
    await expect(page.getByRole('button', { name: 'Đang khởi tạo…', exact: true })).toBeDisabled();
    await page.getByLabel('Email', { exact: true }).fill('pre-hydration@example.test');
    await page.getByLabel('Mật khẩu', { exact: true }).fill('must-not-appear-in-url');
    await page.getByLabel('Mật khẩu', { exact: true }).press('Enter');
    await page.waitForTimeout(250);
    expect(page.url()).not.toContain('pre-hydration@example.test');
    expect(page.url()).not.toContain('must-not-appear-in-url');
  } finally {
    await context.close();
  }
});

test('director can inspect the pilot policy and switch between the same ERP data surfaces', async ({ page, isMobile }) => {
  test.skip(isMobile, 'Authenticated pilot control is covered once on desktop; mobile controls are covered by CSS and inventory gates.');
  test.skip(!process.env.REALM_PILOT_E2E_EMAIL || !process.env.REALM_PILOT_E2E_PASSWORD, 'Requires an ephemeral staging Director account.');

  await loginPilotDirector(page);
  if (new URL(page.url()).pathname !== '/dashboard') await page.goto('/dashboard');

  const onboarding = page.getByRole('dialog', { name: 'Realm Pilot · Khởi hành an toàn' });
  await expect(onboarding).toBeVisible();
  await expect(onboarding).toContainText('Một dữ liệu, hai giao diện');
  await expect(onboarding).toContainText('không đo thời lượng');
  for (let step = 0; step < 3; step += 1) await onboarding.getByRole('button', { name: 'Tiếp tục' }).click();
  await onboarding.getByRole('button', { name: 'Hoàn tất hướng dẫn' }).click();
  await expect(page.getByRole('button', { name: 'Mở hướng dẫn Realm pilot' })).toBeVisible();

  await page.goto('/settings');
  const pilot = page.getByRole('region', { name: 'Realm Pilot Control' });
  await expect(pilot).toBeVisible();
  await expect(pilot.getByRole('radio', { name: /Tạm đóng/ })).toBeVisible();
  const cohortMode = pilot.getByRole('radio', { name: /Pilot theo cohort/ });
  await expect(cohortMode).toBeVisible();
  await expect(pilot.getByRole('radio', { name: /Mở cho nội bộ/ })).toBeVisible();
  await expect(pilot).toContainText('Không ghi thời lượng làm việc');
  await expect(pilot.getByRole('region', { name: 'Release readiness preflight' })).toBeVisible();
  await expect(pilot).toContainText('Feature flags phát hành độc lập');
  await cohortMode.check();
  await pilot.getByRole('radio', { name: /Nhân sự cụ thể/ }).check();
  await expect(pilot.getByLabel('Tìm nhân sự pilot')).toBeVisible();
  await expect(pilot).toContainText('không hiển thị thời lượng, tiến độ hay điểm hiệu suất');
  await pilot.getByRole('group', { name: 'Danh sách nhân sự có thể tham gia pilot' }).getByRole('checkbox').first().check();
  await pilot.getByRole('button', { name: 'Chạy dry-run phát hành' }).click();
  const launchPreview = pilot.getByRole('region', { name: 'Controlled launch dry-run' });
  await expect(launchPreview.getByRole('group', { name: 'Tác động rollout tổng hợp' })).toBeVisible();
  await expect(launchPreview).toContainText('Fallback ERP');
  await expect(launchPreview).toContainText('Dry-run chỉ trả số liệu tổng hợp');
  await expect(pilot.getByRole('button', { name: 'Lưu chính sách pilot' })).toBeEnabled();
  const feedbackOperations = page.getByRole('region', { name: 'Guild Support · Pilot Operations' });
  await expect(feedbackOperations).toBeVisible();
  await expect(feedbackOperations).toContainText('Không dùng số phản hồi để đánh giá cá nhân');

  const readinessResponse = await page.evaluate(async () => {
    const response = await fetch('/api/realm-demo/readiness', { cache: 'no-store' });
    return { status: response.status, payload: await response.json() };
  });
  expect(readinessResponse.status).toBe(200);
  expect(readinessResponse.payload.privacy.performanceTracking).toBe(false);

  await page.goto('/dashboard');
  await page.getByRole('button', { name: 'Gửi phản hồi về Realm pilot' }).click();
  const feedbackDialog = page.getByRole('dialog', { name: 'Guild Support · Phản hồi pilot' });
  await expect(feedbackDialog.getByLabel('Mô tả ngắn *')).toBeVisible();
  await expect(feedbackDialog.getByLabel('Điều gì đã xảy ra và bạn mong đợi gì? *')).toBeVisible();
  await expect(feedbackDialog).toContainText('Không ghi phím bấm, lịch sử duyệt, nội dung record hay thời lượng làm việc');
  await feedbackDialog.getByRole('button', { name: 'Đóng' }).click();
  await page.getByRole('link', { name: 'Chuyển sang văn phòng Realm' }).click();
  await expect(page).toHaveURL(/\/realm$/);
  await page.getByRole('link', { name: 'Chuyển sang giao diện ERP CRM' }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
});

test('pilot onboarding remains usable on mobile', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'Mobile onboarding is covered once with the authenticated mobile project.');
  test.skip(!process.env.REALM_PILOT_E2E_EMAIL || !process.env.REALM_PILOT_E2E_PASSWORD, 'Requires an ephemeral staging Director account.');

  await loginPilotDirector(page);
  if (new URL(page.url()).pathname !== '/dashboard') await page.goto('/dashboard');

  const onboarding = page.getByRole('dialog', { name: 'Realm Pilot · Khởi hành an toàn' });
  await expect(onboarding).toBeVisible();
  const metrics = await onboarding.evaluate((element) => ({
    width: element.getBoundingClientRect().width,
    viewport: window.visualViewport?.width || document.documentElement.clientWidth,
  }));
  expect(metrics.width).toBeLessThanOrEqual(metrics.viewport);
  for (const button of await onboarding.getByRole('button').all()) {
    const height = await button.evaluate((element) => element.getBoundingClientRect().height);
    expect(height).toBeGreaterThanOrEqual(44);
  }
  await onboarding.getByRole('button', { name: 'Bỏ qua lúc này' }).click();
  const launcher = page.getByRole('button', { name: 'Mở hướng dẫn Realm pilot' });
  await expect(launcher).toBeVisible();
  const launcherMetrics = await launcher.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return { left: rect.left, right: rect.right, height: rect.height, viewport: window.visualViewport?.width || document.documentElement.clientWidth };
  });
  expect(launcherMetrics.left).toBeGreaterThanOrEqual(0);
  expect(launcherMetrics.right).toBeLessThanOrEqual(launcherMetrics.viewport + 1);
  expect(launcherMetrics.height).toBeGreaterThanOrEqual(44);
});

test('Realm and ERP views expose the same live character status', async ({ page }) => {
  await page.goto('/realm-demo');
  await page.getByRole('button', { name: 'ERP · CRM', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Hồ sơ nhân sự kết nối nhân vật' })).toContainText(/Adventurer [A-Z0-9]{4}/);
  await expect(page.getByRole('region', { name: /Adventurer [A-Z0-9]{4}/ })).toContainText('Gold');
  await expect(page.getByText('Quest ↔ công việc ERP/CRM', { exact: true })).toBeVisible();
  const access = page.getByRole('region', { name: 'Quyền truy cập phiên ERP' });
  await expect(access).toContainText('DEMO · 9/9 khu vực khả dụng');
  const ledgerTabs = page.getByRole('navigation', { name: 'Chọn khu vực điều hành ERP' }).getByRole('button');
  await expect(ledgerTabs).toHaveCount(6);
  for (let index = 0; index < 6; index += 1) await expect(ledgerTabs.nth(index)).toBeEnabled();
  const bridge = page.getByRole('region', { name: 'Cổng nghiệp vụ ERP/CRM' });
  await expect(bridge).toContainText('Medieval label chỉ là lớp giao diện');
  await expect(bridge.getByRole('link')).toHaveCount(7);
  await expect(bridge.getByRole('link', { name: /Quest Board/ })).toHaveAttribute('href', '/tasks');
  await expect(bridge.getByRole('link', { name: /War Room/ })).toHaveAttribute('href', '/projects');
  await expect(bridge.getByRole('link', { name: /Guild Roster/ })).toHaveAttribute('href', '/staff');
  await expect(bridge.locator('[aria-disabled="true"]')).toHaveCount(0);

  const chronicle = page.getByRole('region', { name: 'Adventurer Chronicle từ dữ liệu ERP cá nhân' });
  await expect(chronicle.getByRole('heading', { name: /Nhật trình của Adventurer [A-Z0-9]{4}/ })).toBeVisible();
  await expect(chronicle).toContainText('Demo cục bộ');
  await expect(chronicle).toContainText('Giờ tự ghi tuần này');
  await expect(chronicle).toContainText('Hồ sơ tự phục vụ, không phải công cụ giám sát');
  await expect(chronicle.getByRole('link', { name: 'Mở Task ERP' }).first()).toHaveAttribute('href', /^\/tasks\?focus=/);

  await page.getByRole('navigation', { name: 'Chọn khu vực điều hành ERP' }).getByRole('button', { name: 'Royal Command', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Điều phối Quest xuyên ERP và Realm' })).toBeVisible();
  await expect(page.getByText('Demo cục bộ', { exact: true })).toBeVisible();
  await expect(page.getByText('Điều phối nguồn lực, không xếp hạng con người', { exact: true })).toBeVisible();
  const taskLinks = page.getByRole('link', { name: 'Mở Task ERP' });
  await expect(taskLinks.first()).toHaveAttribute('href', /^\/tasks\?focus=/);
});

test('all Realm navigation surfaces open without runtime errors or horizontal overflow', async ({ page }) => {
  await page.goto('/realm-demo');
  const destinations = [
    'Đại sảnh', 'Quest Board', 'Royal Command', 'Chiến dịch', 'Guild',
    'Royal Treasury', 'Arcane Forge', 'Lantern Chat', 'Party Voice',
    'Hồ sơ nhân vật', 'Điều hành ERP · CRM',
  ];
  for (const name of destinations) {
    await page.getByRole('button', { name, exact: name !== 'Quest Board' }).click();
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  }
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
  await expect(page.getByRole('region', { name: 'Adventurer Chronicle từ dữ liệu ERP cá nhân' })).toBeVisible();
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
