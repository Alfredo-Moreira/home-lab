import { defineConfig, devices } from '@playwright/test';

/*
 * End-to-end tests against a running site, by default the demo stack:
 *   docker compose -f docker-compose.demo.yml up -d --build --wait
 *   npm test --prefix e2e
 * BASE_URL points elsewhere; CHROME_PATH uses an installed Chrome instead of
 * Playwright's bundled Chromium.
 */
const launchOptions = process.env.CHROME_PATH ? { executablePath: process.env.CHROME_PATH } : {};

export default defineConfig({
  testDir: './tests',
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: process.env.BASE_URL ?? 'http://localhost:3080',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 }, launchOptions } },
    { name: 'mobile', use: { ...devices['Pixel 7'], launchOptions } },
  ],
});
