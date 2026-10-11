// Playwright configuration for the desktop targets (gates G4, G9, G11).
// The static server (tools/serve.mjs) is started and stopped by Playwright.
import { defineConfig, devices } from '@playwright/test';

export const PORT = Number(process.env.ETHER_PORT ?? 41731);

export default defineConfig({
  testDir: 'test/e2e',
  outputDir: 'test-results/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  reporter: [['list']],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    trace: 'off',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
    { name: 'firefox', use: { ...devices['Desktop Firefox'] } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
  ],
  webServer: {
    command: `node tools/serve.mjs --port ${PORT}`,
    url: `http://127.0.0.1:${PORT}/dist/blank.html`,
    reuseExistingServer: false,
    timeout: 15_000,
  },
});
