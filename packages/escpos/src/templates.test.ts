import { describe, expect, it } from "vitest";
import { stripEscPos } from "./commands.js";
import { buildCallCourseTicket, buildGeneralTicket, buildKitchenTicket, courseLabel, kitchenTicketPreview } from "./templates.js";

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
  it("stampa le rimozioni senza + e la nota sotto le varianti", () => {
    const text = stripEscPos(buildKitchenTicket({
      workCenter: "Pizzeria",
      tableLabel: "T2",
      guests: 2,
      operatorName: "Mario",
      lines: [{ name: "Margherita", quantity: 1, variants: ["NO Basilico", "Bufala"], notes: " ben cotta " }],
    }));
    expect(text).toContain("  NO Basilico\n  + Bufala\n  NOTA: ben cotta\n");
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
    const text = stripEscPos(buildKitchenTicket({
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
    }));
    expect(text).toContain(
      "-- ORA --\n1 x FRENCH FRIES\n" +
        "-- SEGUE >1 (in attesa) --\n1 x MARGHERITA\n" +
        "-- SEGUE >2 (in attesa) --\n1 x BABA GANOUSH\n",
    );
    expect(text).not.toContain("IN ATTESA / HOLD");
  });

  it("mantiene il formato semplice se ci sono solo piatti Ora", () => {
    const text = stripEscPos(buildKitchenTicket({
      workCenter: "Cucina",
      tableLabel: "1",
      guests: 2,
      operatorName: "Mario",
      lines: [{ name: "French Fries", quantity: 2, course: 1 }],
    }));
    expect(text).not.toContain("-- ORA --");
    expect(text).toContain("2 x FRENCH FRIES");
  });
});

describe("layout comanda reparto", () => {
  const buf = buildKitchenTicket({
    workCenter: "Bar",
    tableLabel: "18",
    guests: 4,
    operatorName: "Mario",
    lines: [{ name: "Raffo Grezza 0,5", quantity: 1 }],
  });

  it("non stampa il nome del reparto", () => {
    expect(stripEscPos(buf)).not.toContain("BAR");
  });

  it("stampa il tavolo in negativo", () => {
    const text = buf.toString("latin1");
    expect(text).toContain("\x1dB\x01 TAVOLO 18 \n\x1dB\x00");
  });

  it("stampa gli articoli in doppia altezza e i dettagli in font normale", () => {
    expect(buf.toString("latin1")).toContain("\x1d!\x011 x RAFFO GREZZA 0,5\n\x1d!\x00");
  });

  it("chiude con data/ora e Fine Comanda a tutta larghezza", () => {
    const text = stripEscPos(buf);
    expect(text).toMatch(/Data: \d{2}\/\d{2}\/\d{4}  Ora: \d{2}:\d{2}\n/);
    const fine = text.split("\n").find((l) => l.includes("Fine Comanda"))!;
    expect(fine).toHaveLength(48);
    expect(fine.startsWith("-")).toBe(true);
  });
});

describe("comanda generale", () => {
  const text = stripEscPos(
    buildGeneralTicket({
      tableLabel: "12",
      guests: 4,
      operatorName: "Mario",
      sections: [
        { workCenter: "BAR", lines: [{ name: "Birra Bionda 33cl", quantity: 2 }] },
        {
          workCenter: "PIZZERIA",
          lines: [{ name: "Margherita", quantity: 1, course: 2, hold: true, notes: "ben cotta" }],
        },
      ],
    }),
  );

  it("ha titolo, tavolo e una sezione per reparto con le portate", () => {
    expect(text).toContain("COMANDA GENERALE\n TAVOLO 12 \n");
    expect(text).toContain(" BAR \n2 x BIRRA BIONDA 33CL\n");
    expect(text).toContain(" PIZZERIA \n-- SEGUE >1 (in attesa) --\n1 x MARGHERITA\n  NOTA: ben cotta\n");
  });

  it("conta gli articoli di tutti i reparti", () => {
    expect(text).toContain("Articoli: 3\n");
    expect(text).toContain("Fine Comanda");
  });
});
