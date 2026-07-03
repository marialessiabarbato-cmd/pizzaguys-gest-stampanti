import { describe, expect, it } from "vitest";
import { invoiceCustomerSchema } from "./invoice.js";

describe("invoiceCustomerSchema", () => {
  it("accetta P.IVA + codice SDI", () => {
    const result = invoiceCustomerSchema.safeParse({
      businessName: "Acme S.r.l.",
      vatNumber: "12345678901",
      sdiCode: "ABCDEFG",
    });
    expect(result.success).toBe(true);
  });

  it("accetta CF + PEC", () => {
    const result = invoiceCustomerSchema.safeParse({
      businessName: "Mario Rossi",
      taxCode: "RSSMRA80A01H501U",
      pec: "mario.rossi@pec.it",
    });
    expect(result.success).toBe(true);
  });

  it("rifiuta senza identificativo fiscale", () => {
    const result = invoiceCustomerSchema.safeParse({
      businessName: "Senza CF",
      sdiCode: "ABCDEFG",
    });
    expect(result.success).toBe(false);
  });

  it("rifiuta senza SDI né PEC", () => {
    const result = invoiceCustomerSchema.safeParse({
      businessName: "Acme S.r.l.",
      vatNumber: "12345678901",
    });
    expect(result.success).toBe(false);
  });
});
