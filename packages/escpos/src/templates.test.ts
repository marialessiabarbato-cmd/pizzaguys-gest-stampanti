import { describe, expect, it } from "vitest";
import { buildCallCourseTicket, buildKitchenTicket, courseLabel, kitchenTicketPreview } from "./templates.js";

describe("kitchen ticket", () => {
  it("genera buffer non vuoto", () => {
    const buf = buildKitchenTicket({
      workCenter: "Pizzeria",
      tableLabel: "T3",
      guests: 4,
      operatorName: "Mario",
      lines: [{ name: "Margherita", quantity: 2 }],
    });
    expect(buf.length).toBeGreaterThan(0);
  });

  it("include etichetta ristampa", () => {
    const preview = kitchenTicketPreview({
      workCenter: "Cucina",
      tableLabel: "T1",
      guests: 2,
      operatorName: "Luigi",
      lines: [{ name: "Patatine", quantity: 1 }],
      reprint: true,
    });
    expect(preview).toContain("RISTAMPA");
  });
});

describe("call course ticket", () => {
  it("include intestazione portata", () => {
    const buf = buildCallCourseTicket({
      course: 2,
      tableLabel: "T5",
      guests: 4,
      lines: [{ name: "Carbonara", quantity: 1 }],
    });
    const text = buf.toString("utf-8");
    expect(text).toContain("=== MARCIA SEGUE >1 ===");
    expect(text).not.toContain("PORTATA 2");
  });
});

describe("note del cameriere", () => {
  it("stampa la nota libera sotto varianti di aggiunta e rimozione", () => {
    const text = buildKitchenTicket({
      workCenter: "Pizzeria",
      tableLabel: "T2",
      guests: 2,
      operatorName: "Mario",
      lines: [{ name: "Margherita", quantity: 1, variants: ["NO Basilico", "Bufala"], notes: " ben cotta " }],
    }).toString("latin1");
    expect(text).toContain("  + NO Basilico\n  + Bufala\n  NOTA: ben cotta\n");
  });

  it("non stampa la riga nota se vuota", () => {
    const text = buildCallCourseTicket({
      course: 2,
      tableLabel: "T5",
      guests: 4,
      lines: [{ name: "Carbonara", quantity: 1, notes: "   " }],
    }).toString("latin1");
    expect(text).not.toContain("NOTA");
  });

  it("stampa la nota anche sul ticket chiama portata", () => {
    const text = buildCallCourseTicket({
      course: 2,
      tableLabel: "T5",
      guests: 4,
      lines: [{ name: "Carbonara", quantity: 1, notes: "senza pepe" }],
    }).toString("latin1");
    expect(text).toContain("NOTA: senza pepe");
  });
});

describe("portate Ora / Segue", () => {
  it("usa gli stessi nomi del palmare", () => {
    expect([1, 2, 3, 4].map(courseLabel)).toEqual(["ORA", "SEGUE >1", "SEGUE >2", "DOLCE"]);
  });

  it("divide la comanda per portata e marca solo le portate in attesa", () => {
    const text = buildKitchenTicket({
      workCenter: "Pizzeria",
      tableLabel: "4",
      guests: 3,
      operatorName: "Mario",
      hold: true,
      lines: [
        { name: "Margherita", quantity: 1, course: 2, hold: true },
        { name: "French Fries", quantity: 1, course: 1 },
        { name: "Baba Ganoush", quantity: 1, course: 3, hold: true },
      ],
    }).toString("latin1");
    expect(text).toContain(
      "-- ORA --\n1x French Fries\n" +
        "-- SEGUE >1 (in attesa) --\n1x Margherita\n" +
        "-- SEGUE >2 (in attesa) --\n1x Baba Ganoush\n",
    );
    expect(text).not.toContain("IN ATTESA / HOLD");
  });

  it("mantiene il formato semplice se ci sono solo piatti Ora", () => {
    const text = buildKitchenTicket({
      workCenter: "Cucina",
      tableLabel: "1",
      guests: 2,
      operatorName: "Mario",
      lines: [{ name: "French Fries", quantity: 2, course: 1 }],
    }).toString("latin1");
    expect(text).not.toContain("-- ORA --");
    expect(text).toContain("2x French Fries");
  });
});
