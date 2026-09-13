import { test, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { assertCiDatabase, CI_REALM_TASKS } from '../../scripts/seed-ci-fixtures.mjs';

test.beforeEach(async ({ baseURL }) => {
  const expected = assertCiDatabase(process.env.CI_TEST_DATABASE_URL);
  for (const key of ['DATABASE_URL', 'DIRECT_URL']) {
    expect(assertCiDatabase(process.env[key]), `${key} must use the disposable fixture database`).toBe(expected);
  }
  expect(['127.0.0.1', 'localhost', '[::1]']).toContain(new URL(baseURL).hostname);
});

async function signIn(request, email) {
  const password = process.env.REALM_PILOT_E2E_PASSWORD;
  if (!email || !password) throw new Error('Authenticated ERP tests require seed-ci-fixtures.mjs and disposable REALM_PILOT_E2E_EMAIL / REALM_PILOT_E2E_PASSWORD; missing credentials cannot skip this gate.');
  const csrfResponse = await request.get('/api/auth/csrf');
  expect(csrfResponse.ok()).toBeTruthy();
  const { csrfToken } = await csrfResponse.json();
  const response = await request.post('/api/auth/callback/credentials', { form: { csrfToken, email, password, json: 'true', callbackUrl: '/dashboard' } });
  expect(response.ok()).toBeTruthy();
  const session = await (await request.get('/api/auth/session')).json();
  expect(session.user?.email).toBe(email);
  return session.user;
}

test('authenticated staff cannot rewrite a colleague leave or forge a manager review', async ({ request }) => {
  await signIn(request, 'staff@realm.test');
  const update = await request.put('/api/data/leaves/realm_e2e_other_leave', { data: { note: 'unauthorized edit' } });
  expect(update.status()).toBe(403);
  const forgedReview = await request.post('/api/data/reviews', { data: { userId: 'realm_e2e_other', quarter: '2026-Q4', status: 'final', mgrNote: 'forged approval' } });
  // Self-review creation intentionally sanitizes protected fields. A repeat can
  // return the unique-quarter validation error; it must never create a manager review.
  expect([200, 400, 403]).toContain(forgedReview.status());
  if (forgedReview.ok()) {
    const review = await forgedReview.json();
    expect(review.userId).toBe('realm_e2e_staff');
    expect(review.status).not.toBe('final');
    expect(review.mgrNote || '').toBe('');
  }
  const invoices = await request.get('/api/data/invoices');
  expect(invoices.status()).toBe(403);
});

test('authenticated Director sees the same ERP task and its live update in the 3D Realm', async ({ request, page }, testInfo) => {
  test.setTimeout(90_000);
  const fixture = CI_REALM_TASKS[testInfo.project.name];
  expect(fixture, 'Every browser project needs a separately seeded mutation fixture').toBeDefined();
  const user = await signIn(request, process.env.REALM_PILOT_E2E_EMAIL);
  expect(user.id).toBe('realm_e2e_director');
  const taskUrl = `/api/data/tasks/${fixture.id}`;
  const taskHref = `/tasks?focus=${fixture.id}&from=realm`;
  const checklist = [
    { id: 'ci-read', text: 'Đọc cùng Task ERP', done: false },
    { id: 'ci-sync', text: 'Nhận thay đổi từ outbox', done: false },
  ];
  const baseline = { title: fixture.title, status: 'todo', checklist: JSON.stringify(checklist) };
  const readTask = async () => {
    const response = await request.get('/api/data/tasks?assigneeId=realm_e2e_director');
    expect(response.ok()).toBeTruthy();
    const payload = await response.json();
    const rows = Array.isArray(payload) ? payload : payload.data || payload.rows || [];
    return rows.find(row => row.id === fixture.id);
  };
  const assertQuest = (snapshot, title, erpStatus, progress) => {
    expect(snapshot.source).toBe('erp');
    expect(snapshot.bridge?.actor?.id).toBe(user.id);
    expect(snapshot.operations?.quests?.find(quest => quest.businessRef === fixture.id)).toMatchObject({
      id: `erp-task:${fixture.id}`, businessRef: fixture.id, title, erpStatus, progress, total: 2,
      remote: true, links: { task: taskHref },
    });
  };
  const initial = await readTask();
  expect(initial).toMatchObject({ id: fixture.id, assigneeId: user.id, projectId: 'realm_e2e_project' });
  // Restore only this project's record, including after a previous failed retry.
  const reset = await request.put(taskUrl, { data: baseline });
  expect(reset.ok()).toBeTruthy();
  expect(await reset.json()).toMatchObject({ id: fixture.id, ...baseline });
  const storage = await request.storageState();
  await page.context().addCookies(storage.cookies);
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  try {
    const [snapshotResponse, feedResponse] = await Promise.all([
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/realm-demo/operations' && response.status() === 200),
      page.waitForResponse(response => new URL(response.url()).pathname === '/api/realm-demo/changes' && response.status() === 200),
      page.goto('/realm'),
    ]);
    assertQuest(await snapshotResponse.json(), fixture.title, 'todo', 0);
    expect(await feedResponse.json()).toMatchObject({ source: 'erp', cursor: expect.any(String) });
    await expect(page.locator('[data-realm-world-version="3d"]')).toHaveAttribute('data-ready', 'true', { timeout: 45_000 });
    await expect(page.getByRole('heading', { name: 'Đại sảnh Guildhall.' })).toBeVisible();
    await page.getByRole('button', { name: 'Bỏ qua lúc này', exact: true }).click();
    await page.getByRole('navigation', { name: 'Hành động chính trong Guildhall' }).getByRole('button', { name: 'Công việc', exact: true }).click();
    const board = page.getByRole('complementary', { name: 'Bàn công việc', exact: true });
    await expect(board).toBeVisible({ timeout: 20_000 });
    const card = board.locator('article').filter({ has: page.getByRole('link', { name: 'Mở Task ERP', exact: true }).and(page.locator(`a[href="${taskHref}"]`)) });
    await expect(card).toHaveCount(1);
    await expect(card.getByRole('heading', { name: fixture.title, exact: true })).toBeVisible();
    await expect(card.getByText('0/2 tiêu chí', { exact: true })).toBeVisible();

    const updatedTitle = `${fixture.title} · ${randomUUID()}`;
    const update = { title: updatedTitle, status: 'doing', checklist: JSON.stringify(checklist.map((item, index) => ({ ...item, done: index === 0 }))) };
    // Listen before PUT. No route mocks, reload, focus event or manual refresh:
    // the running outbox worker must publish a feed event and Realm must refetch.
    const [liveFeedResponse, liveSnapshotResponse, mutationResponse] = await Promise.all([
      page.waitForResponse(async response => {
        if (new URL(response.url()).pathname !== '/api/realm-demo/changes' || response.status() !== 200) return false;
        const feed = await response.json();
        return feed.source === 'erp' && feed.changed && feed.domains?.includes('operations');
      }, { timeout: 20_000 }),
      page.waitForResponse(async response => {
        if (new URL(response.url()).pathname !== '/api/realm-demo/operations' || response.status() !== 200) return false;
        const snapshot = await response.json();
        return snapshot.operations?.quests?.some(quest => quest.businessRef === fixture.id && quest.title === updatedTitle);
      }, { timeout: 20_000 }),
      request.put(taskUrl, { data: update }),
    ]);
    expect(mutationResponse.ok()).toBeTruthy();
    expect(await mutationResponse.json()).toMatchObject({ id: fixture.id, ...update });
    expect((await liveFeedResponse.json()).eventCount).toBeGreaterThan(0);
    assertQuest(await liveSnapshotResponse.json(), updatedTitle, 'doing', 1);
    expect(await readTask()).toMatchObject({ id: fixture.id, ...update });
    await expect(card.getByRole('heading', { name: updatedTitle, exact: true })).toBeVisible();
    await expect(card.getByText('1/2 tiêu chí', { exact: true })).toBeVisible();
    await expect(card.getByRole('link', { name: 'Mở Task ERP', exact: true })).toHaveAttribute('href', taskHref);
    expect(errors).toEqual([]);
  } finally {
    const restored = await request.put(taskUrl, { data: baseline });
    expect(restored.ok(), 'The isolated fixture must be restorable after success or failure').toBeTruthy();
    expect(await restored.json()).toMatchObject({ id: fixture.id, ...baseline });
  }
});
