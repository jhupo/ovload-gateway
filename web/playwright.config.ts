import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: '../tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: 'list',
  use: { baseURL: 'http://127.0.0.1:5178', trace: 'off', launchOptions: { executablePath: process.env.OVLOAD_TEST_BROWSER } },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['Pixel 7'] } },
  ],
  webServer: [
    {
      command: 'cargo run --locked -p ovload-server -- preview',
      cwd: '..',
      env: { OVLOAD_LISTEN: '127.0.0.1:18089' },
      url: 'http://127.0.0.1:18089/healthz',
      reuseExistingServer: false,
      timeout: 180000,
    },
    {
      command: 'pnpm dev --port 5178 --strictPort',
      env: { OVLOAD_DEV_API: 'http://127.0.0.1:18089' },
      url: 'http://127.0.0.1:5178',
      reuseExistingServer: false,
      timeout: 60000,
    },
  ],
})
