import { randomUUID } from "node:crypto";
import {
  categoryRouting,
  edgeState,
  menuCache,
  printers,
  type EdgeDatabase,
  tables,
} from "@pizzaguys/edge-db";
import { eq, sql } from "drizzle-orm";
import { cloudHandshake } from "./cloud.js";
import { applyInvoiceCustomersFromSnapshot } from "./invoice-customers.js";
import { setLockTimeoutMinutes } from "./runtime.js";

const DEFAULT_PRINTERS = [
  { id: "printer-cucina", name: "Cucina", workCenter: "CUCINA" as const },
  { id: "printer-pizzeria", name: "Pizzeria", workCenter: "PIZZERIA" as const },
  { id: "printer-bar", name: "Bar", workCenter: "BAR" as const },
  { id: "printer-chef", name: "Riepilogo Chef", workCenter: "CHEF" as const },
];

export async function provisionEdge(db: EdgeDatabase, apiToken: string) {
  const current = db.select().from(edgeState).where(sql`id = 1`).get();
  const edgeDeviceId = current?.edgeDeviceId ?? randomUUID();

  const handshake = await cloudHandshake(apiToken, edgeDeviceId);
  const now = new Date().toISOString();

  db.delete(menuCache).run();
  db.insert(menuCache)
    .values({
      id: 1,
      schemaVersion: handshake.schemaVersion,
      payload: JSON.stringify(handshake.snapshot),
      updatedAt: now,
    })
    .run();

  db.update(edgeState)
    .set({
      status: "ACTIVE",
      locationId: handshake.locationId,
      locationName: handshake.locationName,
      apiToken,
      edgeDeviceId,
      schemaVersion: handshake.schemaVersion,
      updatedAt: now,
    })
    .where(eq(edgeState.id, 1))
    .run();

  const existingPrinters = db.select().from(printers).all();
  if (existingPrinters.length === 0) {
    for (const p of DEFAULT_PRINTERS) {
      db.insert(printers)
        .values({
          id: p.id,
          name: p.name,
          workCenter: p.workCenter,
          host: "127.0.0.1",
          port: 9100,
          enabled: true,
          createdAt: now,
        })
        .run();
    }
  }

  const virtualTables = db
    .select()
    .from(tables)
    .where(eq(tables.isVirtual, true))
    .all();
  if (virtualTables.length === 0) {
    const virtualWidth = 100;
    const virtualGap = 16;
    const virtualStartX = 20;
    const virtualDefs = [
      { label: "ASPORTO", virtualType: "ASPORTO" as const, sortOrder: 0 },
      { label: "DELIVERY", virtualType: "DELIVERY" as const, sortOrder: 1 },
    ];
    for (const [index, def] of virtualDefs.entries()) {
      db.insert(tables)
        .values({
          id: randomUUID(),
          roomId: null,
          label: def.label,
          x: virtualStartX + index * (virtualWidth + virtualGap),
          y: 20,
          width: virtualWidth,
          height: 60,
          defaultGuests: 1,
          isVirtual: true,
          virtualType: def.virtualType,
          sortOrder: def.sortOrder,
          createdAt: now,
        })
        .run();
    }
  }

  const settings = handshake.snapshot.settings as { tableLockTimeoutMinutes?: number } | undefined;
  if (settings?.tableLockTimeoutMinutes) {
    setLockTimeoutMinutes(settings.tableLockTimeoutMinutes);
  }

  applyInvoiceCustomersFromSnapshot(db, handshake.snapshot.invoiceCustomers);

  const categories = handshake.snapshot.categories ?? [];
  for (const cat of categories) {
    const existing = db
      .select()
      .from(categoryRouting)
      .where(eq(categoryRouting.categoryId, cat.id))
      .get();
    if (!existing) {
      db.insert(categoryRouting)
        .values({ categoryId: cat.id, workCenter: "PIZZERIA" })
        .run();
    }
  }

  return handshake;
}

export function getMenuSnapshot(db: EdgeDatabase) {
  const row = db.select().from(menuCache).where(sql`id = 1`).get();
  if (!row) return null;
  return { schemaVersion: row.schemaVersion, snapshot: JSON.parse(row.payload) };
}
