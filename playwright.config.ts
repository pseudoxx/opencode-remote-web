import { defineConfig, devices } from "@playwright/test"

const PORT = Number(process.env.E2E_APP_PORT ?? 4174)

// Desktop Chrome/Firefox/Safari plus phone and tablet emulation (WebKit for iOS, Chromium for Android).
export default defineConfig({
  testDir: "./tests",
  globalSetup: "./tests/global-setup.ts",
  timeout: 60_000,
  expect: { timeout: 20_000 },
  fullyParallel: true,
  workers: Number(process.env.E2E_WORKERS ?? 2),
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    serviceWorkers: "block",
  },
  webServer: {
    command: `npm run build && npx vite preview --port ${PORT} --strictPort --host 127.0.0.1`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "unit", testMatch: /unit\.spec\.ts/ },
    ...[
      { name: "desktop-chrome", use: { ...devices["Desktop Chrome"] } },
      { name: "desktop-firefox", use: { ...devices["Desktop Firefox"] } },
      { name: "desktop-safari", use: { ...devices["Desktop Safari"] } },
      { name: "iphone", use: { ...devices["iPhone 15"] } },
      { name: "ipad", use: { ...devices["iPad Pro 11"] } },
      { name: "android", use: { ...devices["Pixel 7"] } },
    ].map((p) => ({ ...p, testIgnore: /unit\.spec\.ts/ })),
  ],
})
