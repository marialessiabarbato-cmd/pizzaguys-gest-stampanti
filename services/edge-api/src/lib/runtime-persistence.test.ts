import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeDb, runtimeState, type EdgeDatabase } from "@pizzaguys/edge-db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { exportClosureState, importClosureState, setZReportToday, getZReportToday } from "./closure-state.js";
import {
  createCounterOrder,
  exportCounterOrderState,
  getCounterOrder,
  importCounterOrderState,
} from "./counter-order.js";
import {
  createPaymentRequest,
  getKdsSnapshot,
  getOrderByTable,
  getPendingPaymentRequests,
  getRomanSplit,
  getSubmittedOrdersByTable,
  getTableRuntime,
  importRuntimeState,
  markOrderSubmitted,
  rebuildKdsTicketsForOrder,
  requestLock,
  setTableOccupied,
  startRomanSplit,
  upsertOrder,
  type TableOrder,
} from "./runtime.js";
import { restoreRuntimeState, saveRuntimeState } from "./runtime-persistence.js";
import { getShiftTheoretical, importShiftLedgerState, recordShiftPayment } from "./shift-ledger.js";

let dir: string;
let db: EdgeDatabase;

/** Simula il riavvio del processo: tutto ciò che era in memoria sparisce. */
function simulateRestart() {
  importRuntimeState({});
  importCounterOrderState({ counterOrders: [], dailySeq: { date: "", takeaway: 0, delivery: 0 } });
  importShiftLedgerState({});
  importClosureState({});
}

function order(tableId: string, id: string, submitted: boolean): TableOrder {
  const now = new Date().toISOString();
  return {
    id,
    tableId,
    operatorId: "op-mario",
    operatorName: "Mario Cameriere",
    channel: "TABLE",
    lines: [
      {
        id: `${id}-l1`,
        productId: "prod-margherita",
        name: "Margherita",
        quantity: 2,
        unitPrice: 7,
        channel: "TABLE",
        notes: "ben cotta",
        course: 2,
        hold: true,
      },
    ],
    createdAt: now,
    updatedAt: now,
    ...(submitted ? { submittedAt: now } : {}),
  };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pg-edge-state-"));
  db = createEdgeDb(join(dir, "edge.sqlite"));
  simulateRestart();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("salvataggio e ripristino dello stato operativo", () => {
  it("ripristina tavoli, ordini, KDS, split, richieste di pagamento, asporti, turno e Z", () => {
    // Tavolo 1: comanda spedita con portata in attesa + richiesta di pagamento
    upsertOrder(order("t1", "o1", true));
    markOrderSubmitted("o1");
    rebuildKdsTicketsForOrder(getSubmittedOrdersByTable("t1")[0]!, "1");
    setTableOccupied("t1");
    createPaymentRequest({ tableId: "t1", tableLabel: "1", operatorId: "op-mario", operatorName: "Mario", total: 14 });
    // Tavolo 2: bozza non ancora spedita + split alla romana
    upsertOrder(order("t2", "o2", false));
    startRomanSplit("t2", 2, 14);
    // Asporto, incassi del turno, Z del giorno
    const asporto = createCounterOrder({ channel: "TAKEAWAY", customerName: "Rossi", asap: true });
    recordShiftPayment("shift-1", "CASH", 20);
    recordShiftPayment("shift-1", "POS", 12.5);
    setZReportToday(7);

    saveRuntimeState(db);
    simulateRestart();
    expect(getOrderByTable("t2")).toBeUndefined();

    const info = restoreRuntimeState(db);

    expect(getSubmittedOrdersByTable("t1")[0]?.lines[0]?.notes).toBe("ben cotta");
    expect(getTableRuntime("t1").status).toBe("OCCUPIED");
    expect(getKdsSnapshot().tickets.filter((t) => t.tableId === "t1")).toHaveLength(1);
    expect(getPendingPaymentRequests().map((r) => r.tableId)).toEqual(["t1"]);
    expect(getOrderByTable("t2")?.id).toBe("o2");
    expect(getRomanSplit("t2")?.shares).toBe(2);
    expect(getCounterOrder(asporto.id)?.customerName).toBe("Rossi");
    expect(getShiftTheoretical("shift-1")).toMatchObject({ cash: 20, pos: 12.5, total: 32.5 });
    expect(getZReportToday()?.zNumber).toBe(7);
    expect(info).toMatchObject({ openTables: 2, openOrders: 2, openCounterOrders: 1, errors: [] });
  });

  it("continua la numerazione asporti del giorno senza numeri doppi", () => {
    const first = createCounterOrder({ channel: "TAKEAWAY", asap: true });
    saveRuntimeState(db);
    simulateRestart();
    restoreRuntimeState(db);
    const second = createCounterOrder({ channel: "TAKEAWAY", asap: true });
    expect(second.displayNumber).not.toBe(first.displayNumber);
  });

  it("rilascia i blocchi dei tavoli al ripristino senza perdere la comanda", () => {
    upsertOrder(order("t3", "o3", true));
    markOrderSubmitted("o3");
    requestLock("t3", "op-mario", "Mario Cameriere", true);
    expect(getTableRuntime("t3").status).toBe("LOCKED");

    saveRuntimeState(db);
    simulateRestart();
    const info = restoreRuntimeState(db);

    expect(getTableRuntime("t3")).toMatchObject({ status: "OCCUPIED", lockedBy: undefined });
    expect(info?.releasedLocks).toBe(1);
  });

  it("non riscrive su disco se nulla è cambiato", () => {
    upsertOrder(order("t4", "o4", false));
    expect(saveRuntimeState(db)).toBeGreaterThan(0);
    expect(saveRuntimeState(db)).toBe(0);
  });

  it("senza stato salvato non segnala alcun ripristino", () => {
    expect(restoreRuntimeState(db)).toBeNull();
  });

  it("se un modulo è illeggibile riparte comunque, conserva una copia e lo segnala", () => {
    upsertOrder(order("t5", "o5", false));
    createCounterOrder({ channel: "DELIVERY", asap: true });
    saveRuntimeState(db);
    db.update(runtimeState).set({ payload: "{non json" }).where(eq(runtimeState.namespace, "runtime")).run();

    simulateRestart();
    const info = restoreRuntimeState(db);

    expect(info?.errors).toHaveLength(1);
    expect(info?.errors[0]).toMatch(/^runtime:/);
    expect(exportCounterOrderState().counterOrders).toHaveLength(1);
    const backups = db.select().from(runtimeState).all().filter((r) => r.namespace.startsWith("runtime.corrupt-"));
    expect(backups).toHaveLength(1);
  });

  it("rifiuta un formato di versione diversa", () => {
    setZReportToday(3);
    saveRuntimeState(db);
    db.update(runtimeState).set({ version: 99 }).where(eq(runtimeState.namespace, "closure")).run();
    simulateRestart();
    const info = restoreRuntimeState(db);
    expect(info?.errors[0]).toMatch(/closure: versione 99/);
    expect(exportClosureState().zReportToday).toBeNull();
  });
});
