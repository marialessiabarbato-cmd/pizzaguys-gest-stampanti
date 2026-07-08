import { defineConfig } from "@playwright/test";

const cloudApi = process.env.CLOUD_API_URL ?? "http://localhost:4000";
const cloudWeb = process.env.CLOUD_WEB_URL ?? "http://localhost:3000";
const edgeApi = process.env.EDGE_API_URL ?? "http://localhost:4100";

export default defineConfig({
  testDir: ".",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  use: {
    baseURL: cloudApi,
    trace: "on-first-retry",
  },
  projects: [
    { name: "cloud-api", testMatch: /cloud\.spec\.ts/ },
    {
      name: "cloud-admin",
      testMatch: /cloud-admin\.spec\.ts/,
      use: { baseURL: cloudWeb },
    },
    { name: "edge-api", testMatch: /edge\.spec\.ts/, use: { baseURL: edgeApi } },
  ],
});
