import { describe, expect, it } from "vitest";
import { CMD_CUT, CMD_INIT, encodeText } from "./commands.js";
import { buildPrebillTicket, buildReceiptCopyTicket } from "./templates.js";

describe("encodeText (CP1252)", () => {
  it("lascia invariato l'ASCII", () => {
    expect(encodeText("Margherita x2")).toEqual(Buffer.from("Margherita x2", "ascii"));
  });

  it("codifica accenti italiani e simbolo euro su un byte", () => {
    expect([...encodeText("àèéìòù€")]).toEqual([0xe0, 0xe8, 0xe9, 0xec, 0xf2, 0xf9, 0x80]);
  });

  it("codifica trattino lungo e punto centrale usati nei ticket", () => {
    expect([...encodeText("—·")]).toEqual([0x97, 0xb7]);
  });

  it("rimuove l'accento dai caratteri fuori tabella", () => {
    expect(encodeText("Łódź ă").toString("latin1")).toBe("?ódz a");
  });

  it("sostituisce con ? i caratteri non rappresentabili", () => {
    expect(encodeText("🍕").toString("latin1")).toBe("?");
  });
});

describe("CMD_INIT", () => {
  it("seleziona la code page WPC1252 dopo il reset", () => {
    expect([...CMD_INIT]).toEqual([0x1b, 0x40, 0x1b, 0x74, 16]);
  });
});

describe("CMD_CUT", () => {
  it("avanza la carta prima del taglio per non tagliare le ultime righe", () => {
    expect([...CMD_CUT]).toEqual([0x1b, 0x64, 5, 0x1d, 0x56, 0x00]);
  });
});

describe("preconto", () => {
  it("stampa il simbolo euro come byte CP1252", () => {
    const buf = buildPrebillTicket({
      tableLabel: "T1",
      lines: [{ name: "Caffè", quantity: 1, unitPrice: 1.5, lineTotal: 1.5 }],
      total: 1.5,
    });
    expect(buf.includes(Buffer.from([0x80]))).toBe(true);
    expect(buf.includes(Buffer.from("Caff\xe8", "latin1"))).toBe(true);
    expect(buf.includes(Buffer.from("€", "utf-8"))).toBe(false);
  });

  it("stampa l'intestazione non fiscale in dimensione normale", () => {
    const buf = buildPrebillTicket({ tableLabel: "T1", lines: [], total: 0 });
    const header = buf.indexOf("*** DOCUMENTO NON FISCALE ***");
    const doubleSize = buf.indexOf(Buffer.from([0x1d, 0x21, 0x11]));
    expect(header).toBeGreaterThan(-1);
    expect(doubleSize).toBeGreaterThan(header);
  });
});

describe("copia non fiscale scontrino", () => {
  it("riporta il testo dello scontrino con intestazione non fiscale e taglio", () => {
    const buf = buildReceiptCopyTicket({ receiptText: "Scontrino\nCaffè EUR 1.50\n" });
    expect(buf.includes("*** COPIA NON FISCALE ***")).toBe(true);
    expect(buf.includes(Buffer.from("Caff\xe8 EUR 1.50", "latin1"))).toBe(true);
    expect(buf.subarray(-6)).toEqual(Buffer.from([0x1b, 0x64, 5, 0x1d, 0x56, 0x00]));
  });
});
