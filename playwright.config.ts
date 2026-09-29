import { defineConfig } from '@playwright/test'

// O globalSetup sobe banco, API e `vite preview` em portas escolhidas na hora e publica a URL do
// front em E2E_WEB_URL; por isso o baseURL vem do teste (test.use), não daqui.
export default defineConfig({
  testDir: 'e2e',
  testMatch: '**/*.spec.ts',
  globalSetup: './e2e/global-setup.ts',
  globalTeardown: './e2e/global-teardown.ts',
  workers: 1,
  timeout: 60_000,
  use: { headless: true, actionTimeout: 10_000 },
})
