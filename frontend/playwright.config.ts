import { defineConfig, devices } from '@playwright/test'

const FRONTEND_PORT = 5173
const BACKEND_PORT = 8000

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL: `http://localhost:${FRONTEND_PORT}`,
    trace: 'on-first-retry',
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: [
    {
      command: 'firebase emulators:start --only auth,firestore --project demo-mytasks',
      cwd: '..',
      url: 'http://localhost:8080',
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
    {
      command: 'uv run uvicorn mytasks_api.main:app --port 8000',
      cwd: '../backend',
      url: `http://localhost:${BACKEND_PORT}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        GOOGLE_CLOUD_PROJECT: 'demo-mytasks',
        FIRESTORE_EMULATOR_HOST: 'localhost:8080',
        FIREBASE_AUTH_EMULATOR_HOST: 'localhost:9099',
        CORS_ORIGINS: `http://localhost:${FRONTEND_PORT}`,
      },
    },
    {
      command: `npm run dev -- --port ${FRONTEND_PORT}`,
      url: `http://localhost:${FRONTEND_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 30_000,
      env: {
        VITE_API_BASE_URL: `http://localhost:${BACKEND_PORT}`,
        VITE_FIREBASE_PROJECT_ID: 'demo-mytasks',
        VITE_FIREBASE_API_KEY: 'fake-api-key',
        VITE_FIREBASE_AUTH_DOMAIN: 'localhost',
        VITE_USE_EMULATORS: 'true',
      },
    },
  ],
})
