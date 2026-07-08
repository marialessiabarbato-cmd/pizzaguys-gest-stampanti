import { expect, test } from "@playwright/test";

const ADMIN_EMAIL = "admin@pizzaguys.it";
const ADMIN_PASSWORD = "PizzaGuys2026!";

async function loginAsSuperAdmin(page: import("@playwright/test").Page) {
  await page.goto("/login");
  await page.getByPlaceholder("Email").fill(ADMIN_EMAIL);
  await page.getByPlaceholder("Password").fill(ADMIN_PASSWORD);
  await page.getByRole("button", { name: "Accedi" }).click();
  await expect(page).not.toHaveURL(/\/login/, { timeout: 15_000 });
}

test.describe("Cloud Admin UI", () => {
  test("login SuperAdmin apre la dashboard", async ({ page }) => {
    await loginAsSuperAdmin(page);
    await expect(page.getByRole("heading", { name: "Dashboard" })).toBeVisible();
  });

  test("clienti fiscali — pagina dettaglio profilo azienda", async ({ page }) => {
    await loginAsSuperAdmin(page);
    await Promise.all([
      page.waitForResponse(
        (resp) => resp.url().includes("/api/v2/invoice-customers") && resp.ok(),
      ),
      page.goto("/invoice-customers"),
    ]);
    await expect(page.getByRole("heading", { name: "Clienti fiscali" })).toBeVisible();

    const detail = page.getByRole("link", { name: "Dettaglio" });
    if ((await detail.count()) === 0) {
      test.skip(true, "Nessun cliente fiscale in rubrica");
      return;
    }

    await detail.first().click();
    await expect(page.getByText("Dati anagrafici")).toBeVisible();
    await expect(page.getByText("Dati fiscali")).toBeVisible();
    await expect(page.getByText("Torna ai clienti fiscali")).toBeVisible();
  });

  test("fatture — pagina dettaglio fattura elettronica", async ({ page }) => {
    await loginAsSuperAdmin(page);
    await Promise.all([
      page.waitForResponse((resp) => resp.url().includes("/api/v2/invoices") && resp.ok()),
      page.goto("/invoices"),
    ]);
    await expect(page.getByRole("heading", { name: "Fatture elettroniche" })).toBeVisible();

    const detail = page.getByRole("link", { name: "Dettaglio" });
    if ((await detail.count()) === 0) {
      test.skip(true, "Nessuna fattura in archivio");
      return;
    }

    await detail.first().click();
    await expect(page.getByText("Torna alle fatture")).toBeVisible();
    await expect(page.getByText("Cliente")).toBeVisible();
  });

  test("chiusure — pagina dettaglio report giornaliero", async ({ page }) => {
    await loginAsSuperAdmin(page);
    await Promise.all([
      page.waitForResponse(
        (resp) =>
          resp.url().includes("/api/v2/locations/") &&
          resp.url().includes("/closures") &&
          resp.ok(),
      ),
      page.goto("/closures"),
    ]);
    await expect(page.getByRole("heading", { name: "Chiusure & Report" })).toBeVisible();

    const detail = page.getByRole("link", { name: "Dettaglio" });
    if ((await detail.count()) === 0) {
      test.skip(true, "Nessuna chiusura in archivio");
      return;
    }

    await detail.first().click();
    await expect(page.getByRole("heading", { name: "Dettaglio chiusura" })).toBeVisible();
    await expect(page.getByText("Torna alle chiusure")).toBeVisible();
  });
});
