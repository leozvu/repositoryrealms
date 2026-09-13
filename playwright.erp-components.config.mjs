import { defineConfig, devices } from '@playwright/test';
export default defineConfig({
  testDir: './tests/e2e', testMatch: ['erp-resource-ui.spec.mjs', 'erp-my-work-ui.spec.mjs', 'erp-lead-board-ui.spec.mjs'], workers: 1,
  outputDir: 'test-results/erp-components', reporter: 'list',
  use: { trace: 'retain-on-failure' },
  projects: [
    { name: 'desktop-chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile-chromium', use: { ...devices['Pixel 5'] } },
  ],
});
