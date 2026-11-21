import { defineConfig, devices } from '../../web/node_modules/@playwright/test'

export default defineConfig({
  testDir: '.',
  timeout: 90_000,
  fullyParallel: false,
  reporter: 'list',
  use: {
    ...devices['Desktop Chrome'],
    baseURL: 'http://127.0.0.1:5191',
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm --dir ../../web dev --host 127.0.0.1 --port 5191 --strictPort',
    url: 'http://127.0.0.1:5191',
    reuseExistingServer: true,
    timeout: 120_000,
  },
})
