import { expect, test } from "@playwright/test";

const FAKE_ID = "00000000-0000-0000-0000-000000000000";

async function loginSuperAdmin(request: import("@playwright/test").APIRequestContext) {
  const res = await request.post("/api/v2/auth/login", {
    data: { email: "admin@pizzaguys.it", password: "PizzaGuys2026!" },
  });
  expect(res.ok()).toBeTruthy();
  const body = (await res.json()) as { token: string };
  return body.token;
}

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

test.describe("Cloud API — dettagli admin", () => {
  test("GET invoice-customers/:id e 404", async ({ request }) => {
    const token = await loginSuperAdmin(request);
    const headers = { Authorization: `Bearer ${token}` };

    const list = await request.get("/api/v2/invoice-customers", { headers });
    expect(list.ok()).toBeTruthy();
    const customers = (await list.json()) as Array<{ id: string; businessName: string }>;
    if (customers.length > 0) {
      const detail = await request.get(`/api/v2/invoice-customers/${customers[0].id}`, { headers });
      expect(detail.ok()).toBeTruthy();
      const row = (await detail.json()) as { businessName: string };
      expect(row.businessName).toBe(customers[0].businessName);
    }

    const missing = await request.get(`/api/v2/invoice-customers/${FAKE_ID}`, { headers });
    expect(missing.status()).toBe(404);
  });

  test("GET invoices/:id e 404", async ({ request }) => {
    const token = await loginSuperAdmin(request);
    const headers = { Authorization: `Bearer ${token}` };

    const list = await request.get("/api/v2/invoices", { headers });
    expect(list.ok()).toBeTruthy();
    const body = (await list.json()) as { invoices: Array<{ id: string; invoiceNumber: string }> };
    if (body.invoices.length > 0) {
      const detail = await request.get(`/api/v2/invoices/${body.invoices[0].id}`, { headers });
      expect(detail.ok()).toBeTruthy();
      const row = (await detail.json()) as { invoiceNumber: string };
      expect(row.invoiceNumber).toBe(body.invoices[0].invoiceNumber);
    }

    const missing = await request.get(`/api/v2/invoices/${FAKE_ID}`, { headers });
    expect(missing.status()).toBe(404);
  });

  test("GET closures/:id e 404", async ({ request }) => {
    const token = await loginSuperAdmin(request);
    const headers = { Authorization: `Bearer ${token}` };

    const locRes = await request.get("/api/v2/locations", { headers });
    expect(locRes.ok()).toBeTruthy();
    const locations = (await locRes.json()) as Array<{ id: string }>;
    expect(locations.length).toBeGreaterThan(0);

    const closuresRes = await request.get(`/api/v2/locations/${locations[0].id}/closures`, { headers });
    expect(closuresRes.ok()).toBeTruthy();
    const closures = (await closuresRes.json()) as Array<{ id: string; locationName: string }>;
    if (closures.length > 0) {
      const detail = await request.get(`/api/v2/closures/${closures[0].id}`, { headers });
      expect(detail.ok()).toBeTruthy();
      const row = (await detail.json()) as { locationName: string };
      expect(row.locationName).toBe(closures[0].locationName);
    }

    const missing = await request.get(`/api/v2/closures/${FAKE_ID}`, { headers });
    expect(missing.status()).toBe(404);
  });
});
