import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeDb, staff, staffShifts, type EdgeDatabase } from "@pizzaguys/edge-db";
import { eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { executeTablePayment } from "./payment.js";
import { getShiftStatus, isShiftActive, SHIFT_NOT_ACTIVE } from "./shift-guard.js";

let dir: string;
let db: EdgeDatabase;

function addCashier(id: string) {
  const now = new Date().toISOString();
  db.insert(staff)
    .values({ id, firstName: "Anna", lastName: "Cassa", role: "CASHIER", pinHash: "x", createdAt: now, updatedAt: now })
    .run();
}

function startShift(id: string, staffId: string) {
  db.insert(staffShifts).values({ id, staffId, startedAt: new Date().toISOString(), endedAt: null }).run();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pg-edge-shift-"));
  db = createEdgeDb(join(dir, "edge.sqlite"));
  addCashier("cassa-1");
  addCashier("cassa-2");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("turno attivo", () => {
  it("senza turni aperti il locale non è in turno", () => {
    expect(getShiftStatus(db)).toEqual({ active: false, openShifts: 0 });
    expect(isShiftActive(db)).toBe(false);
  });

  it("basta un turno cassa aperto", () => {
    startShift("t1", "cassa-1");
    expect(getShiftStatus(db)).toEqual({ active: true, openShifts: 1 });
  });

  it("torna non attivo quando l'ultimo turno viene chiuso", () => {
    startShift("t1", "cassa-1");
    startShift("t2", "cassa-2");
    const end = new Date().toISOString();
    db.update(staffShifts).set({ endedAt: end }).where(eq(staffShifts.id, "t1")).run();
    expect(getShiftStatus(db)).toEqual({ active: true, openShifts: 1 });
    db.update(staffShifts).set({ endedAt: end }).where(eq(staffShifts.id, "t2")).run();
    expect(isShiftActive(db)).toBe(false);
  });

  it("l'incasso è rifiutato senza turno, prima di ogni altro controllo", async () => {
    const result = await executeTablePayment({
      edgeDb: db,
      tableId: "tavolo-inesistente",
      locationId: "loc",
      paymentMethod: "CASH",
      splitMode: "FULL",
      operatorId: "cassa-1",
      operatorName: "Anna Cassa",
      tableLabel: "T1",
    });
    expect(result).toEqual({ ok: false, ...SHIFT_NOT_ACTIVE, status: 409 });
  });
});
