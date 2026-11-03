import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeDb, printJobs, printers, type EdgeDatabase } from "@pizzaguys/edge-db";
import {
  makeStatus,
  type HardwareBridge,
  type PrinterCondition,
  type PrintResult,
  type PrintTarget,
} from "@pizzaguys/hardware-bridge";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  cancelJob,
  printQueued,
  processRetries,
  reprintJob,
  setPrintBridgeForTest,
  startPrintQueue,
  stopPrintQueue,
} from "./print-queue.js";
import { reportPrintFailures } from "./print-alerts.js";

/** Stampanti finte: per ogni host la condizione attuale e i ticket ricevuti. */
class FakeBridge implements HardwareBridge {
  conditions = new Map<string, PrinterCondition>();
  printed: { host: string; label: string }[] = [];
  calls = 0;

  async printEscPos(printerId: string, _payload: Buffer, label = "t", target?: PrintTarget): Promise<PrintResult> {
    this.calls++;
    const host = target?.host ?? "mock";
    const condition = this.conditions.get(host) ?? "OK";
    if (condition !== "OK") {
      return { success: false, printerId, condition, error: condition };
    }
    this.printed.push({ host, label });
    return { success: true, printerId, condition: "OK" };
  }
  async getPrinterStatus(target?: PrintTarget) {
    return makeStatus(this.conditions.get(target?.host ?? "mock") ?? "OK", true);
  }
  async emitReceipt() {
    return { success: true };
  }
  async emitZReport() {
    return { success: true, zNumber: 1 };
  }
  async openCashDrawer() {}
}

let dir: string;
let db: EdgeDatabase;
let bridge: FakeBridge;

function addPrinter(id: string, name: string, workCenter: "CUCINA" | "BAR", host: string, fallbackPrinterId?: string) {
  db.insert(printers)
    .values({
      id,
      name,
      workCenter,
      host,
      port: 9100,
      enabled: true,
      fallbackPrinterId: fallbackPrinterId ?? null,
      createdAt: new Date().toISOString(),
    })
    .run();
}

function job(id: string) {
  return db.select().from(printJobs).where(eq(printJobs.id, id)).get()!;
}

/** Rende subito "scaduti" i ticket in attesa, per non aspettare i secondi veri. */
function makeDue() {
  db.update(printJobs).set({ nextAttemptAt: new Date(0).toISOString() }).where(eq(printJobs.status, "RETRYING")).run();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pg-queue-"));
  db = createEdgeDb(join(dir, "edge.sqlite"));
  bridge = new FakeBridge();
  setPrintBridgeForTest(bridge);
  addPrinter("bar", "Bar", "BAR", "10.0.0.2");
  addPrinter("cucina", "Cucina", "CUCINA", "10.0.0.1", "bar");
});

afterEach(() => {
  stopPrintQueue();
  rmSync(dir, { recursive: true, force: true });
});

const ticket = { kind: "COMANDA" as const, tableLabel: "5", printerId: "cucina", label: "ord-1", payload: Buffer.from("X") };

describe("coda di stampa", () => {
  it("salva il ticket e lo segna stampato", async () => {
    const r = await printQueued(db, ticket);
    expect(r.success).toBe(true);
    expect(job(r.jobId).status).toBe("PRINTED");
    expect(job(r.jobId).printedOnName).toBe("Cucina");
    expect(bridge.printed).toEqual([{ host: "10.0.0.1", label: "ord-1" }]);
  });

  it("carta finita in cucina: dirotta sulla stampante di riserva", async () => {
    bridge.conditions.set("10.0.0.1", "PAPER_OUT");
    const r = await printQueued(db, ticket);
    expect(r.success).toBe(true);
    expect(r.reroutedTo).toBe("Bar");
    const row = job(r.jobId);
    expect(row.status).toBe("REROUTED");
    expect(row.printedOnName).toBe("Bar");
    expect(row.lastError).toBe("carta finita");
    // il palmare non riceve errori: l'avviso del dirottamento va solo alla cassa
    expect(reportPrintFailures(db, "COMANDA", "5", [r])).toEqual([]);
  });

  it("nessuna stampante disponibile: resta in attesa e riparte quando torna pronta", async () => {
    bridge.conditions.set("10.0.0.1", "COVER_OPEN");
    bridge.conditions.set("10.0.0.2", "UNREACHABLE");
    const r = await printQueued(db, ticket);
    expect(r.success).toBe(false);
    expect(r.willRetry).toBe(true);
    expect(job(r.jobId).status).toBe("RETRYING");
    const msg = reportPrintFailures(db, "COMANDA", "5", [r]);
    expect(msg[0]).toContain("coperchio aperto");
    expect(msg[0]).toMatch(/nuovo tentativo automatico/i);

    // ancora giù: secondo tentativo fallito, resta in attesa
    makeDue();
    expect(await processRetries(db)).toBe(0);
    expect(job(r.jobId).attempts).toBe(2);

    // coperchio chiuso: esce sulla sua stampante
    bridge.conditions.set("10.0.0.1", "OK");
    makeDue();
    expect(await processRetries(db)).toBe(1);
    expect(job(r.jobId).status).toBe("PRINTED");
    expect(bridge.printed).toHaveLength(1);
  });

  it("stessa stampante ferma per più reparti: un solo messaggio", async () => {
    db.update(printers).set({ host: "10.0.0.9", fallbackPrinterId: null }).run();
    bridge.conditions.set("10.0.0.9", "UNREACHABLE");
    const a = await printQueued(db, ticket);
    const b = await printQueued(db, { ...ticket, printerId: "bar" });
    const c2 = await printQueued(db, { ...ticket, printerId: "bar", label: "generale" });
    const msg = reportPrintFailures(db, "COMANDA", "t7", [a, b, c2]);
    expect(msg).toHaveLength(1);
    expect(msg[0]).toContain("Cucina, Bar (10.0.0.9:9100)");
  });

  it("stampante spenta: i ticket successivi non riaspettano il timeout", async () => {
    db.update(printers).set({ host: "10.0.0.9", fallbackPrinterId: null }).run();
    bridge.conditions.set("10.0.0.9", "UNREACHABLE");
    await printQueued(db, ticket);
    await printQueued(db, { ...ticket, printerId: "bar" });
    await printQueued(db, { ...ticket, printerId: "bar", label: "generale" });
    // solo il primo ticket ha provato la rete, gli altri sono andati subito in attesa
    expect(bridge.calls).toBe(1);
    // il giro dei nuovi tentativi prova la rete una volta per indirizzo
    makeDue();
    await processRetries(db);
    expect(bridge.calls).toBe(2);
    // stampante riaccesa: al giro successivo escono tutti
    bridge.conditions.clear();
    makeDue();
    expect(await processRetries(db)).toBe(3);
  });

  it("dopo un riavvio i ticket rimasti in invio tornano in attesa", async () => {
    const now = new Date().toISOString();
    db.insert(printJobs)
      .values({
        id: "j1",
        kind: "COMANDA",
        tableLabel: "7",
        printerId: "cucina",
        printerName: "Cucina",
        label: "ord-7",
        payload: Buffer.from("Y"),
        status: "QUEUED",
        attempts: 0,
        createdAt: now,
        updatedAt: now,
      })
      .run();
    startPrintQueue(db);
    expect(job("j1").status).toBe("RETRYING");
    await processRetries(db);
    expect(job("j1").status).toBe("PRINTED");
  });

  it("ristampa un ticket già stampato, anche su un'altra stampante", async () => {
    const r = await printQueued(db, ticket);
    const again = await reprintJob(db, r.jobId, "bar");
    expect(again?.success).toBe(true);
    expect(job(again!.jobId).reprintOf).toBe(r.jobId);
    expect(bridge.printed.map((p) => p.host)).toEqual(["10.0.0.1", "10.0.0.2"]);
  });

  it("ristampare un ticket in attesa lo sostituisce (niente doppioni)", async () => {
    bridge.conditions.set("10.0.0.1", "PAPER_OUT");
    bridge.conditions.set("10.0.0.2", "PAPER_OUT");
    const r = await printQueued(db, ticket);
    bridge.conditions.set("10.0.0.1", "OK");
    await reprintJob(db, r.jobId);
    expect(job(r.jobId).status).toBe("CANCELLED");
    makeDue();
    await processRetries(db);
    expect(bridge.printed).toHaveLength(1);
  });

  it("un ticket in attesa si può togliere dalla coda", async () => {
    bridge.conditions.set("10.0.0.1", "PAPER_OUT");
    bridge.conditions.set("10.0.0.2", "PAPER_OUT");
    const r = await printQueued(db, ticket);
    expect(cancelJob(db, r.jobId)).toBe(true);
    bridge.conditions.clear();
    makeDue();
    await processRetries(db);
    expect(bridge.printed).toHaveLength(0);
  });

  it("dopo 2 ore di tentativi si arrende e lo segnala", async () => {
    bridge.conditions.set("10.0.0.1", "UNREACHABLE");
    bridge.conditions.set("10.0.0.2", "UNREACHABLE");
    const r = await printQueued(db, ticket);
    db.update(printJobs)
      .set({ createdAt: new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString() })
      .where(eq(printJobs.id, r.jobId))
      .run();
    makeDue();
    await processRetries(db);
    expect(job(r.jobId).status).toBe("FAILED");
  });

  it("riserva sullo stesso indirizzo della principale: non conta come riserva", async () => {
    db.update(printers).set({ host: "10.0.0.1" }).where(eq(printers.id, "bar")).run();
    bridge.conditions.set("10.0.0.1", "PAPER_OUT");
    const r = await printQueued(db, ticket);
    expect(r.status).toBe("RETRYING");
  });
});

describe("coda di stampa con stampanti di rete (TCP)", () => {
  it("carta finita sulla Cucina: il ticket esce sulla Bar via rete", async () => {
    const { createServer } = await import("node:net");
    const { NetworkHardwareBridge } = await import("@pizzaguys/hardware-bridge");
    const OK = 0x12;
    const startEpson = (reply: number[]) => {
      const received: Buffer[] = [];
      const server = createServer((socket) => {
        socket.on("data", (chunk) => {
          received.push(chunk);
          if (chunk.includes(Buffer.from([0x10, 0x04]))) socket.write(Buffer.from(reply));
        });
        socket.on("error", () => {});
      });
      return new Promise<{ port: number; received: Buffer[]; close: () => void }>((resolve) =>
        server.listen(0, "127.0.0.1", () =>
          resolve({ port: (server.address() as { port: number }).port, received, close: () => server.close() }),
        ),
      );
    };
    const cucina = await startEpson([OK, OK | 0x60]); // carta finita
    const bar = await startEpson([OK, OK]);
    try {
      setPrintBridgeForTest(new NetworkHardwareBridge({ printDir: dir }));
      db.update(printers).set({ host: "127.0.0.1", port: cucina.port }).where(eq(printers.id, "cucina")).run();
      db.update(printers).set({ host: "127.0.0.1", port: bar.port }).where(eq(printers.id, "bar")).run();

      const r = await printQueued(db, { ...ticket, payload: Buffer.from("MARGHERITA x2\n") });
      expect(r.status).toBe("REROUTED");
      expect(job(r.jobId).lastError).toBe("carta finita");
      await new Promise((res) => setTimeout(res, 30));
      expect(Buffer.concat(cucina.received).toString()).not.toContain("MARGHERITA");
      expect(Buffer.concat(bar.received).toString()).toContain("MARGHERITA");
    } finally {
      cucina.close();
      bar.close();
    }
  });
});
