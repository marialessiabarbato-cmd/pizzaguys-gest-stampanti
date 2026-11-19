import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { FiscalOrderInput } from "../types.js";
import { AxonFpidFiscal } from "./fiscal.js";
import { startFakeRt } from "./fake-rt.js";
import { describeFailure, isCompleteResponse, parseResponseXml } from "./response.js";
import { buildReceiptLines, sanitizeDescription, Sf20BuildError } from "./sf20.js";

const order = (over: Partial<FiscalOrderInput> = {}): FiscalOrderInput => ({
  locationId: "loc1",
  paymentMethod: "CASH",
  lines: [
    { name: "Margherita", quantity: 2, unitPrice: 6.5, vatRate: 10 },
    { name: "Coca Cola 33cl", quantity: 1, unitPrice: 3, vatRate: 22 },
  ],
  ...over,
});

describe("sf20", () => {
  it("costruisce righe, sottototale e pagamento contanti", () => {
    expect(buildReceiptLines(order())).toEqual([
      "3/S/Margherita//2/6.50/1/10///0/",
      "3/S/Coca Cola 33cl//1/3.00/2/22///0/",
      "U/",
      "5/1/16.00////PC//",
    ]);
  });

  it("mappa POS, ticket e pagamenti misti", () => {
    const lines = buildReceiptLines(
      order({
        paymentSplits: [
          { paymentMethod: "MEAL_VOUCHER", amount: 6 },
          { paymentMethod: "POS", amount: 10 },
        ],
      }),
    );
    expect(lines.slice(-2)).toEqual(["5/3/6.00////NR/TKT/", "5/4/10.00////PE//"]);
  });

  it("aggiunge la riga di identificazione solo se configurata", () => {
    const lines = buildReceiptLines(order(), {
      repartoByVat: { 10: 1, 22: 2, 4: 3 },
      identLine: "I/1/0/",
      maxDescriptionLength: 32,
      serviceFlag: 0,
      cashSendsReceived: false,
    });
    expect(lines[0]).toBe("I/1/0/");
  });

  it("rifiuta fattura, prova, aliquota sconosciuta e pagamenti che non quadrano", () => {
    expect(() => buildReceiptLines(order({ documentType: "INVOICE" }))).toThrow(Sf20BuildError);
    expect(() => buildReceiptLines(order({ documentType: "TRAINING" }))).toThrow(Sf20BuildError);
    expect(() =>
      buildReceiptLines(order({ lines: [{ name: "X", quantity: 1, unitPrice: 1, vatRate: 5 }] })),
    ).toThrow(/aliquota/);
    expect(() =>
      buildReceiptLines(order({ paymentSplits: [{ paymentMethod: "CASH", amount: 15 }] })),
    ).toThrow(/diversi dal totale/);
    expect(() => buildReceiptLines(order({ paymentMethod: "OTHER" }))).toThrow(/non supportato/);
  });

  it("ripulisce le descrizioni", () => {
    expect(sanitizeDescription("Caffè/Èspresso; DOPPIO", 32)).toBe("Caffe Espresso DOPPIO");
    expect(sanitizeDescription("   ", 32)).toBe("ARTICOLO");
    expect(sanitizeDescription("A".repeat(50), 10)).toHaveLength(10);
  });
});

describe("response", () => {
  it("legge esito OK e KO", () => {
    const ok = parseResponseXml("<R><ESITO>OK</ESITO><REPLY>00</REPLY></R>");
    expect(ok.ok).toBe(true);
    const ko = parseResponseXml(
      "<R><ESITO>NON OK</ESITO><REPLY>44</REPLY><ECCEZIONE><RIGA>2</RIGA><CODICE>44</CODICE></ECCEZIONE></R>",
    );
    expect(ko.ok).toBe(false);
    expect(describeFailure(ko)).toContain("Carta finita");
    expect(isCompleteResponse("<R><ESITO>OK")).toBe(false);
  });
});

describe("AxonFpidFiscal con RT finto", () => {
  let dir = "";
  let rt: ReturnType<typeof startFakeRt> | undefined;
  afterEach(() => rt?.stop());

  it("emette lo scontrino e lascia il documento nella cartella", async () => {
    dir = await mkdtemp(join(tmpdir(), "pg-axon-"));
    rt = startFakeRt({ dir });
    const fiscal = new AxonFpidFiscal({ dir, timeoutMs: 3000, pollMs: 20 });
    const res = await fiscal.emitReceipt(order());
    expect(res.success).toBe(true);
    expect(res.receipt?.id).toMatch(/^RT-HUBBI_/);
    expect(rt.documents).toHaveLength(1);
    expect(rt.documents[0]).toContain("3/S/Margherita//2/6.50/1/10///0/");
  });

  it("segnala l'errore dell'RT (carta finita) senza dare lo scontrino per emesso", async () => {
    dir = await mkdtemp(join(tmpdir(), "pg-axon-"));
    rt = startFakeRt({ dir, failWithReply: "44" });
    const res = await new AxonFpidFiscal({ dir, timeoutMs: 3000, pollMs: 20 }).emitReceipt(order());
    expect(res.success).toBe(false);
    expect(res.error).toContain("Carta finita");
  });

  it("al timeout non ripete e avvisa di controllare l'RT", async () => {
    dir = await mkdtemp(join(tmpdir(), "pg-axon-"));
    rt = startFakeRt({ dir, silent: true });
    const res = await new AxonFpidFiscal({ dir, timeoutMs: 300, pollMs: 20 }).emitReceipt(order());
    expect(res.success).toBe(false);
    expect(res.error).toContain("NON ripetere");
    expect(rt.documents).toHaveLength(0);
  });

  it("non scrive nulla nella cartella per documenti non supportati", async () => {
    dir = await mkdtemp(join(tmpdir(), "pg-axon-"));
    rt = startFakeRt({ dir });
    const res = await new AxonFpidFiscal({ dir, timeoutMs: 300, pollMs: 20 }).emitReceipt(
      order({ documentType: "INVOICE" }),
    );
    expect(res.success).toBe(false);
    expect(rt.documents).toHaveLength(0);
  });

  it("la chiusura Z resta bloccata", async () => {
    dir = await mkdtemp(join(tmpdir(), "pg-axon-"));
    const z = await new AxonFpidFiscal({ dir }).emitZReport();
    expect(z.success).toBe(false);
    expect(z.error).toContain("non ancora abilitata");
  });
});
