import { describe, expect, it } from "vitest";
import type { MockReceipt } from "./mock-receipt.js";
import { RECEIPT_WIDTH, formatMockReceiptText } from "./receipt-text.js";

function receipt(overrides: Partial<MockReceipt>): MockReceipt {
  return {
    id: "MOCK-TEST",
    issuedAt: "2026-05-08T20:58:00.000Z",
    locationId: "loc",
    paymentMethod: "CASH",
    documentType: "RECEIPT",
    lines: [],
    total: 0,
    mock: true,
    ...overrides,
  };
}

describe("formatMockReceiptText", () => {
  it("segue il layout del documento commerciale RT", () => {
    const text = formatMockReceiptText(
      receipt({
        lines: [{ name: "PASTO COMPLETO", quantity: 1, unitPrice: 23, vatRate: 10 }],
        total: 23,
        change: 2,
      }),
      { tableLabel: "T5", guests: 1, operatorName: "BEA", amountReceived: 25, documentNumber: 7 },
    );

    expect(text).toContain("DOCUMENTO COMMERCIALE\n");
    expect(text).toContain("di vendita o prestazione\n");
    expect(text).toMatch(/^DESCRIZIONE +IVA +Prezzo\(€\)$/m);
    expect(text).toMatch(/^PASTO COMPLETO +10,00% +23,00$/m);
    expect(text).toMatch(/^TOTALE COMPLESSIVO +23,00$/m);
    expect(text).toMatch(/^di cui IVA +2,09$/m);
    expect(text).toMatch(/^Pagamento contante +25,00$/m);
    expect(text).toMatch(/^Resto +2,00$/m);
    expect(text).toMatch(/^Importo pagato +23,00$/m);
    expect(text).toContain("Vi ha servito: BEA");
    expect(text).toContain("DOCUMENTO N. 0007");
    expect(text).not.toContain("MOCK-TEST");
  });

  it("calcola l'IVA per aliquota e mostra la quantità sopra la riga", () => {
    const text = formatMockReceiptText(
      receipt({
        paymentMethod: "POS",
        lines: [
          { name: "Birra Bionda 33cl", quantity: 2, unitPrice: 4, vatRate: 22 },
          { name: "Margherita", quantity: 1, unitPrice: 7, vatRate: 10 },
        ],
        total: 15,
      }),
    );

    expect(text).toMatch(/^2 x 4,00\nBIRRA BIONDA 33CL +22,00% +8,00$/m);
    expect(text).toMatch(/^di cui IVA +2,08$/m); // 1,44 (22%) + 0,64 (10%)
    expect(text).toMatch(/^Pagamento elettronico +15,00$/m);
    expect(text).not.toContain("Resto");
  });

  it("manda a capo le descrizioni lunghe senza superare la carta", () => {
    const text = formatMockReceiptText(
      receipt({
        lines: [
          { name: "Kimchi & Funghi Porcini Misti con Extra Fior di Latte", quantity: 1, unitPrice: 10, vatRate: 10 },
        ],
        total: 10,
      }),
    );

    expect(text.split("\n").every((r) => r.length <= RECEIPT_WIDTH)).toBe(true);
    expect(text).toMatch(/^KIMCHI & FUNGHI PORCINI MISTI CON +10,00% +10,00\nEXTRA FIOR DI LATTE$/m);
  });
});
