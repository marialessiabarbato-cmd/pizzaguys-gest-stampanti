/**
 * T9 / T10 — flussi critici dall'inizio alla fine, con l'Edge completo e una stampante
 * di rete simulata (TCP 9100), senza Cloud, senza server avviati e senza carta sprecata:
 *
 *   apertura cassa → comanda → ticket ai reparti → preconto → incasso → chiusura cassa
 *   + stampante spenta durante il servizio: Spedisci veloce, ticket in attesa, uscita
 *     automatica quando la stampante torna.
 *
 * Gira in CI con `pnpm test` come gli altri test unitari.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type { FastifyInstance } from "fastify";
import bcrypt from "bcryptjs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const dir = mkdtempSync(join(tmpdir(), "pg-flows-"));
process.env.HARDWARE_BRIDGE_MODE = "network";
// La finta stampante non risponde ai comandi di stato: si evita l'attesa per ogni ticket
process.env.PRINTER_STATUS_CHECK = "off";
process.env.MOCK_PRINT_DIR = join(dir, "prints");
process.env.CLOUD_API_URL = "http://127.0.0.1:9"; // nessun Cloud: gli invii restano in coda

/** Stampante di rete simulata: raccoglie quello che riceve, si può spegnere e riaccendere. */
class FakePrinter {
  received: Buffer[] = [];
  private server: Server | null = null;
  private sockets = new Set<Socket>();
  port = 0;

  async start(port = 0) {
    this.server = createServer((s) => {
      this.sockets.add(s);
      s.on("data", (d) => this.received.push(d));
      s.on("close", () => this.sockets.delete(s));
      s.on("error", () => {});
    });
    await new Promise<void>((resolve) => this.server!.listen(port, "127.0.0.1", resolve));
    this.port = (this.server!.address() as { port: number }).port;
  }

  async stop() {
    for (const s of this.sockets) s.destroy();
    await new Promise<void>((resolve) => (this.server ? this.server.close(() => resolve()) : resolve()));
    this.server = null;
  }

  text() {
    return Buffer.concat(this.received).toString("latin1");
  }
}

const printer = new FakePrinter();
let app: FastifyInstance;
let tableA = "";
let tableB = "";
const CASHIER_PIN = "5678";
const ids = {
  cashier: randomUUID(),
  waiter: randomUUID(),
  pizza: randomUUID(),
  drink: randomUUID(),
  catPizza: randomUUID(),
  catBar: randomUUID(),
};

async function api<T = Record<string, unknown>>(method: "GET" | "POST" | "PATCH", url: string, payload?: unknown) {
  const res = await app.inject({ method, url, payload: payload as object, remoteAddress: "127.0.0.1" });
  return { status: res.statusCode, body: (res.body ? res.json() : {}) as T };
}

beforeAll(async () => {
  await printer.start();
  const { createEdgeDb, edgeState, menuCache, printers, rooms, tables, staff, categoryRouting } = await import("@pizzaguys/edge-db");
  const { eq } = await import("drizzle-orm");
  const db = createEdgeDb(join(dir, "edge.sqlite"));
  const now = new Date().toISOString();

  // Edge già collegata a una sede, con un menu minimo (come dopo il provisioning)
  db.update(edgeState)
    .set({ status: "ACTIVE", locationId: "sede-test", locationName: "Sede di prova", apiToken: "t", schemaVersion: 1, updatedAt: now })
    .where(eq(edgeState.id, 1))
    .run();
  const snapshot = {
    categories: [
      { id: ids.catPizza, name: { it: "Pizze" }, colorHex: "#c2410c", sortOrder: 0 },
      { id: ids.catBar, name: { it: "Bibite" }, colorHex: "#0369a1", sortOrder: 1 },
    ],
    products: [
      { id: ids.pizza, categoryId: ids.catPizza, name: { it: "Margherita" }, basePrice: 8, allergenIds: [] },
      { id: ids.drink, categoryId: ids.catBar, name: { it: "Coca Cola" }, basePrice: 3, allergenIds: [] },
    ],
    variantGroups: [],
    prices: [],
    settings: { maxDiscountPercent: 20 },
  };
  db.insert(menuCache).values({ id: 1, schemaVersion: 1, payload: JSON.stringify(snapshot), updatedAt: now }).run();
  db.insert(categoryRouting).values({ categoryId: ids.catPizza, workCenter: "PIZZERIA" }).run();
  db.insert(categoryRouting).values({ categoryId: ids.catBar, workCenter: "BAR" }).run();

  // Una sola stampante fisica per tutti i reparti, come a Caserta
  for (const [id, name, wc] of [["pr-pizzeria", "Pizzeria", "PIZZERIA"], ["pr-bar", "Bar", "BAR"], ["pr-cucina", "Cucina", "CUCINA"]] as const) {
    db.insert(printers).values({ id, name, workCenter: wc, host: "127.0.0.1", port: printer.port, enabled: true, createdAt: now }).run();
  }

  const roomId = randomUUID();
  db.insert(rooms).values({ id: roomId, name: "Interna", createdAt: now }).run();
  tableA = randomUUID();
  tableB = randomUUID();
  db.insert(tables).values({ id: tableA, roomId, label: "T1", defaultGuests: 2, createdAt: now }).run();
  db.insert(tables).values({ id: tableB, roomId, label: "T2", defaultGuests: 2, createdAt: now }).run();

  for (const [id, first, role, pin] of [[ids.cashier, "Carla", "CASHIER", CASHIER_PIN], [ids.waiter, "Marco", "WAITER", "1234"]] as const) {
    db.insert(staff).values({ id, firstName: first, lastName: "Test", role, pinHash: bcrypt.hashSync(pin, 4), createdAt: now, updatedAt: now }).run();
  }

  const { buildEdgeApp } = await import("./app.js");
  const { startPrintQueue } = await import("./lib/print-queue.js");
  app = await buildEdgeApp({ logger: false, db });
  startPrintQueue(db);
  await app.ready();
});

afterAll(async () => {
  const { stopPrintQueue } = await import("./lib/print-queue.js");
  stopPrintQueue();
  await app?.close();
  await printer.stop();
  rmSync(dir, { recursive: true, force: true });
});

function line(productId: string, name: string, price: number, quantity = 1) {
  return { id: randomUUID(), productId, name, quantity, unitPrice: price, basePrice: price, channel: "TABLE", variants: [], course: 1 };
}

async function sendOrder(tableId: string, lines: ReturnType<typeof line>[]) {
  const created = await api<{ id: string }>("POST", "/api/orders", {
    tableId,
    operatorId: ids.waiter,
    operatorName: "Marco Test",
    channel: "TABLE",
    lines,
  });
  expect([200, 201], JSON.stringify(created.body)).toContain(created.status);
  const started = Date.now();
  const submitted = await api<{ ok?: boolean; printWarnings?: string[] }>("POST", `/api/orders/${created.body.id}/submit`);
  return { ...submitted, ms: Date.now() - started };
}

describe("giro completo della serata (T9)", () => {
  let sessionId = "";

  it("apre la cassa", async () => {
    const res = await api<{ id: string }>("POST", "/api/cash-sessions/open", { pin: CASHIER_PIN, service: "DINNER", openingFund: 100 });
    expect(res.status).toBe(201);
    sessionId = res.body.id;
  });

  it("comanda: i ticket escono ai reparti giusti", async () => {
    printer.received = [];
    const res = await sendOrder(tableA, [line(ids.pizza, "Margherita", 8, 2), line(ids.drink, "Coca Cola", 3)]);
    expect(res.status).toBe(200);
    expect(res.body.printWarnings ?? []).toEqual([]);
    await new Promise((r) => setTimeout(r, 50));
    const out = printer.text().toUpperCase();
    expect(out).toContain("MARGHERITA");
    expect(out).toContain("COCA COLA");
    expect(out).toContain("PIZZERIA");
    // ogni ticket è registrato nella coda come stampato
    const jobs = await api<{ jobs: { status: string; kind: string }[] }>("GET", "/api/print-jobs?limit=10");
    const comande = jobs.body.jobs.filter((j) => j.kind === "COMANDA");
    expect(comande.length).toBeGreaterThanOrEqual(2);
    expect(comande.every((j) => j.status === "PRINTED")).toBe(true);
  });

  it("preconto stampato e conto corretto", async () => {
    printer.received = [];
    const pre = await api("POST", `/api/pos/tables/${tableA}/prebill`);
    expect(pre.status).toBe(200);
    await new Promise((r) => setTimeout(r, 50));
    expect(printer.text().toUpperCase()).toContain("MARGHERITA");
    const bill = await api<{ total: number }>("GET", `/api/pos/tables/${tableA}/bill`);
    expect(bill.status).toBe(200);
    // 2 × 8 + 3 (coperto non configurato)
    expect(bill.body.total).toBeCloseTo(19, 2);
  });

  it("incasso in contanti: tavolo libero e incasso nel turno", async () => {
    const pay = await api<{ change?: number }>("POST", `/api/pos/tables/${tableA}/pay`, {
      operatorId: ids.cashier,
      operatorName: "Carla Test",
      splitMode: "FULL",
      paymentMethod: "CASH",
      amountReceived: 20,
    });
    expect(pay.status, JSON.stringify(pay.body)).toBe(200);
    const live = await api<{ id: string; status: string }[]>("GET", "/api/tables/live");
    expect(live.body.find((t) => t.id === tableA)?.status).toBe("FREE");
    const summary = await api<{ theoretical: { expectedCash: number } }>("GET", `/api/cash-sessions/${sessionId}/summary`);
    expect(summary.body.theoretical.expectedCash).toBeCloseTo(119, 2);
  });

  it("stampante spenta: Spedisci risponde subito e il ticket esce quando torna (T10)", async () => {
    const port = printer.port;
    await printer.stop();
    const res = await sendOrder(tableB, [line(ids.pizza, "Margherita", 8)]);
    expect(res.status).toBe(200);
    expect(res.ms).toBeLessThan(10_000); // il palmare aspetta al massimo 20 s
    expect((res.body.printWarnings ?? []).join(" ")).toMatch(/nuovo tentativo automatico/i);
    const waiting = await api<{ jobs: { status: string }[] }>("GET", "/api/print-jobs?status=RETRYING");
    expect(waiting.body.jobs.length).toBeGreaterThan(0);

    // stampante riaccesa: il giro dei nuovi tentativi la stampa da solo
    printer.received = [];
    await printer.start(port);
    const { processRetries } = await import("./lib/print-queue.js");
    const { printJobs } = await import("@pizzaguys/edge-db");
    const { eq } = await import("drizzle-orm");
    app.edgeDb.update(printJobs).set({ nextAttemptAt: new Date(0).toISOString() }).where(eq(printJobs.status, "RETRYING")).run();
    expect(await processRetries(app.edgeDb)).toBeGreaterThan(0);
    await new Promise((r) => setTimeout(r, 50));
    expect(printer.text().toUpperCase()).toContain("MARGHERITA");
  });

  it("chiude il tavolo e la cassa in quadratura, con il report stampato", async () => {
    await api("POST", `/api/pos/tables/${tableB}/pay`, {
      operatorId: ids.cashier,
      operatorName: "Carla Test",
      splitMode: "FULL",
      paymentMethod: "POS",
    });
    const summary = await api<{ theoretical: { expectedCash: number; posSales: number } }>(
      "GET",
      `/api/cash-sessions/${sessionId}/summary`,
    );
    printer.received = [];
    const closed = await api<{ session: { discrepancyCash: number; status: string } }>(
      "POST",
      `/api/cash-sessions/${sessionId}/close`,
      {
        pin: CASHIER_PIN,
        countedCash: summary.body.theoretical.expectedCash,
        posDeclared: summary.body.theoretical.posSales,
        closingFundLeft: 100,
      },
    );
    expect(closed.status).toBe(200);
    expect(closed.body.session.discrepancyCash).toBe(0);
    await new Promise((r) => setTimeout(r, 100));
    expect(printer.received.length).toBeGreaterThan(0);
  });
});
