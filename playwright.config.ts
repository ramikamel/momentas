import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./e2e",
  timeout: 60000,
  expect: { timeout: 15000 },
  workers: 1,
  use: {
    baseURL: "http://127.0.0.1:3010",
    headless: true,
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "npm run dev -- --port 3010",
    url: "http://127.0.0.1:3010",
    reuseExistingServer: false,
    timeout: 90000,
    env: {
      E2E_TEST_MODE: "1",
      SUPABASE_URL: "",
      SUPABASE_SERVICE_ROLE_KEY: "",
      MODEL_API_KEY: "",
      LOCAL_DATA_DIR: `.data/e2e-${Date.now()}`,
      NEXT_DIST_DIR: ".next-e2e",
      APP_ORIGIN: "http://127.0.0.1:3010",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
