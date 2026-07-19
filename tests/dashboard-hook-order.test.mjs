import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const dashboardSource = await readFile(
  new URL('../app/(app)/dashboard/page.jsx', import.meta.url),
  'utf8',
);

test('dashboard declares onboarding state before the unauthenticated early return', () => {
  const onboardingHook = dashboardSource.indexOf('const [onbHidden, setOnbHidden] = useState');
  const unauthenticatedReturn = dashboardSource.indexOf('if (!user) return null;');

  assert.notEqual(onboardingHook, -1, 'onboarding hook must exist');
  assert.notEqual(unauthenticatedReturn, -1, 'session hydration guard must exist');
  assert.ok(
    onboardingHook < unauthenticatedReturn,
    'all dashboard hooks must run before the session hydration early return',
  );
});
