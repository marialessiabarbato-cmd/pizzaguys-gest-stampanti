import { expect, test } from "@playwright/test";

test.describe("Cloud API smoke (T6.5)", () => {
  test("health risponde ok", async ({ request }) => {
    const res = await request.get("/health");
    expect(res.ok()).toBeTruthy();
    const body = (await res.json()) as { ok: boolean; service: string };
    expect(body.ok).toBe(true);
    expect(body.service).toBe("cloud-api");
  });

  test("login SuperAdmin rifiuta credenziali vuote", async ({ request }) => {
    const res = await request.post("/api/v2/auth/login", {
      data: { email: "", password: "" },
    });
    expect(res.status()).toBe(400);
  });
});
