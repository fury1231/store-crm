import { defineConfig, devices } from '@playwright/test';

/**
 * Playwright configuration for Store CRM frontend E2E tests.
 *
 * Targets the Docker Compose dev environment by default:
 *   docker-compose up → backend on :3001, frontend on :5173
 *
 * Override with env vars:
 *   PLAYWRIGHT_BASE_URL=http://localhost:5173
 *   PLAYWRIGHT_API_URL=http://localhost:3001
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  timeout: 30 * 1000,
  expect: {
    timeout: 5 * 1000,
  },
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5173',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
  // Run vite dev server automatically when not in CI (CI should start docker-compose)
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:5173',
        reuseExistingServer: true,
        timeout: 120 * 1000,
      },
});
