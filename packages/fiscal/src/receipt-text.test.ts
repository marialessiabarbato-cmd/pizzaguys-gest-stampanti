import { describe, expect, it } from "vitest";
import type { MockReceipt } from "./mock-receipt.js";
import { formatMockReceiptText } from "./receipt-text.js";

describe("formatMockReceiptText", () => {
  it("formatta riga pasto completo con IVA 10%", () => {
    const receipt: MockReceipt = {
      id: "MOCK-TEST",
      issuedAt: "2026-05-08T20:58:00.000Z",
      locationId: "loc",
      paymentMethod: "CASH",
      documentType: "RECEIPT",
      lines: [{ name: "PASTO COMPLETO", quantity: 1, unitPrice: 23, vatRate: 10 }],
      total: 23,
      change: 2,
      mock: true,
    };

    const text = formatMockReceiptText(receipt, {
      tableLabel: "T5",
      guests: 1,
      operatorName: "BEA",
      amountReceived: 25,
    });

    expect(text).toContain("1 PASTO COMPLETO");
    expect(text).toContain("Totale EUR 23.00");
    expect(text).toContain("CONTANTI");
    expect(text).toContain("Resto: 2.00");
    expect(text).toContain("10.00");
    expect(text).toContain("20.91");
  });
});
