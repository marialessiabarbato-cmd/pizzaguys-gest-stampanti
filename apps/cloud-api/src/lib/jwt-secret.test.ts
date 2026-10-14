import { describe, expect, it } from "vitest";
import { DEV_JWT_SECRET, resolveJwtSecret } from "./jwt-secret.js";

const STRONG = "x".repeat(32);

describe("resolveJwtSecret in produzione", () => {
  const prod = (JWT_SECRET?: string) => resolveJwtSecret({ NODE_ENV: "production", JWT_SECRET });

  it.each([
    ["mancante", undefined, "non è impostata"],
    ["vuota", "", "non è impostata"],
    ["solo spazi", "   ", "non è impostata"],
    ["default del codice", "dev-secret-change-me", "default pubblico"],
    ["default di .env.example", "change-me-in-production", "default pubblico"],
    ["corta", "x".repeat(31), "troppo corta"],
  ])("rifiuta JWT_SECRET %s", (_label, value, message) => {
    const result = prod(value);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain(message);
  });

  it("accetta un segreto di almeno 32 caratteri senza avvisi", () => {
    expect(prod(STRONG)).toEqual({ ok: true, secret: STRONG });
  });
});

describe("resolveJwtSecret in sviluppo", () => {
  it("senza variabile usa il default con un avviso", () => {
    const result = resolveJwtSecret({});
    expect(result).toMatchObject({ ok: true, secret: DEV_JWT_SECRET });
    if (result.ok) expect(result.warning).toContain("non è impostata");
  });

  it("accetta il valore di .env.example con un avviso", () => {
    const result = resolveJwtSecret({ NODE_ENV: "development", JWT_SECRET: "change-me-in-production" });
    expect(result).toMatchObject({ ok: true, secret: "change-me-in-production" });
    if (result.ok) expect(result.warning).toContain("default pubblico");
  });

  it("segreto forte: nessun avviso", () => {
    expect(resolveJwtSecret({ JWT_SECRET: STRONG })).toEqual({ ok: true, secret: STRONG });
  });
});
