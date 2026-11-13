import { defineConfig } from '@playwright/test';

// End-to-end tests load the built extension (dist/) into Chromium.
// Run `npm run build` first. Network-dependent tests run only with E2E_NETWORK=1.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: [['list']],
});
