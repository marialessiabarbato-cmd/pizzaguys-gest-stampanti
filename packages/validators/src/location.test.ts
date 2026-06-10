import { describe, expect, it } from "vitest";
import { createLocationSchema } from "./location.js";

describe("createLocationSchema", () => {
  it("accetta una sede valida", () => {
    const result = createLocationSchema.safeParse({
      name: "Pizza Guys Caserta",
      address: "Via Roma 1, Caserta",
      vatNumber: "12345678901",
      managerEmail: "manager@pizzaguys.it",
    });
    expect(result.success).toBe(true);
  });

  it("rifiuta P.IVA non valida", () => {
    const result = createLocationSchema.safeParse({
      name: "Test",
      address: "Via 1",
      vatNumber: "ABC",
      managerEmail: "a@b.it",
    });
    expect(result.success).toBe(false);
  });
});
