import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: 'html',
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'on-first-retry',
  },

  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],

  // Note: Infrastructure and app must be started separately for local testing
  // 1. Start infrastructure: npm run test:e2e:playwright:infra (or docker-compose -f docker-compose.infra.yml up -d)
  // 2. Start app locally: npm run start:dev
  // 3. Run tests: npm run test:e2e:playwright
  // In CI, the webServer will automatically start the app (requires infrastructure to be running)
  webServer: process.env.CI ? {
    command: 'npm run start:dev',
    url: 'http://localhost:3000',
    reuseExistingServer: false,
    timeout: 120000,
  } : undefined,
});

