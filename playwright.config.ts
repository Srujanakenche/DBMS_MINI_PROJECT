import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests",
  testMatch: "**/*.spec.ts",
  workers: 1,
  timeout: 90000,
  expect: { timeout: 20000 },
  use: {
    browserName: "chromium",
    channel: "msedge",
    viewport: { width: 1440, height: 1000 },
  },
  reporter: "list",
});
