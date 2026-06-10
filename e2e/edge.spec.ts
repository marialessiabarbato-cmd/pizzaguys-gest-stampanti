import { expect, test } from "@playwright/test";

test.describe("Edge API smoke (T6.5)", () => {
  test("health risponde ok", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.ok()).toBeTruthy();
  });

  test("status espone stato provisioning", async ({ request }) => {
    const res = await request.get("/api/status");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { status: string };
    expect(["UNPROVISIONED", "ACTIVE"]).toContain(body.status);
  });
});
