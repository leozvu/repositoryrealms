import { defineConfig } from '@playwright/test';

// An explicitly separate diagnostic profile. This does not replace the failed
// standard desktop/mobile run and must not be reported as a D60/AAA pass.
const baseURL = 'http://127.0.0.1:3410';
export default defineConfig({
  testDir: './qa/realm-3d/diagnostics',
  testMatch: 'realm-office-diagnostic.spec.mjs',
  outputDir: './test-results/realm-diagnostic',
  workers: 1,
  fullyParallel: false,
  retries: 0,
  timeout: 90000,
  expect: { timeout: 10000 },
  reporter: 'list',
  use: {
    browserName: 'chromium', headless: true, baseURL,
    viewport: { width: 960, height: 600 }, deviceScaleFactor: 1,
    reducedMotion: 'reduce',
    trace: 'off', screenshot: 'off', video: 'off',
    actionTimeout: 10000, navigationTimeout: 30000,
    launchOptions: { timeout: 30000 },
    // Public persisted choices from officeRuntime.js. No runtime flags,
    // geometry suppression, monkeypatches or internal render-scale injection.
    storageState: { cookies: [], origins: [{ origin: baseURL, localStorage: [
      { name: 'realm:3d:graphics:v1', value: 'balanced' },
      { name: 'realm:3d:resolution:v1', value: 'auto' },
    ] }] },
  },
  // The caller verifies/owns the existing preview; this config never starts it.
});
