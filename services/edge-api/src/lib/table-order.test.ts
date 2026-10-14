import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeDb, rooms, tables, type EdgeDatabase } from "@pizzaguys/edge-db";
import { asc, eq } from "drizzle-orm";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { applyTableOrder, nextTableSortOrder } from "./table-order.js";

let dir: string;
let db: EdgeDatabase;

function addTable(id: string, roomId: string | null, opts: { isVirtual?: boolean; sortOrder?: number } = {}) {
  db.insert(tables)
    .values({
      id,
      roomId,
      label: id,
      isVirtual: opts.isVirtual ?? false,
      sortOrder: opts.sortOrder ?? 0,
      createdAt: new Date().toISOString(),
    })
    .run();
}

function orderOf(roomId: string) {
  return db
    .select({ id: tables.id, sortOrder: tables.sortOrder })
    .from(tables)
    .where(eq(tables.roomId, roomId))
    .orderBy(asc(tables.sortOrder))
    .all();
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pg-edge-table-order-"));
  db = createEdgeDb(join(dir, "edge.sqlite"));
  const now = new Date().toISOString();
  db.insert(rooms).values([
    { id: "sala", name: "Interna", createdAt: now },
    { id: "fuori", name: "Esterna", createdAt: now },
  ]).run();
  addTable("T1", "sala");
  addTable("T2", "sala");
  addTable("T10", "sala");
  addTable("E1", "fuori");
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("applyTableOrder", () => {
  it("salva l'ordine ricevuto come sortOrder 1..n", () => {
    expect(applyTableOrder(db, "sala", ["T10", "T1", "T2"])).toEqual({ ok: true });
    expect(orderOf("sala")).toEqual([
      { id: "T10", sortOrder: 1 },
      { id: "T1", sortOrder: 2 },
      { id: "T2", sortOrder: 3 },
    ]);
    expect(orderOf("fuori")).toEqual([{ id: "E1", sortOrder: 0 }]);
  });

  it("rifiuta liste incomplete, con tavoli di altre sale o duplicati", () => {
    expect(applyTableOrder(db, "sala", ["T1", "T2"]).ok).toBe(false);
    expect(applyTableOrder(db, "sala", ["T1", "T2", "E1"]).ok).toBe(false);
    expect(applyTableOrder(db, "sala", ["T1", "T1", "T2", "T10"]).ok).toBe(false);
    expect(orderOf("sala").every((t) => t.sortOrder === 0)).toBe(true);
  });
});

describe("nextTableSortOrder", () => {
  it("resta 0 finché la sala non ha un ordine personalizzato, poi accoda", () => {
    expect(nextTableSortOrder(db, "sala")).toBe(0);
    applyTableOrder(db, "sala", ["T2", "T1", "T10"]);
    expect(nextTableSortOrder(db, "sala")).toBe(4);
    expect(nextTableSortOrder(db, "fuori")).toBe(0);
  });

  it("ignora i tavoli virtuali", () => {
    addTable("ASPORTO", null, { isVirtual: true, sortOrder: 9 });
    expect(nextTableSortOrder(db, null)).toBe(0);
  });
});
