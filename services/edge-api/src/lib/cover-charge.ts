import { rooms, tables, type EdgeDatabase } from "@pizzaguys/edge-db";
import { eq } from "drizzle-orm";
import { consolidateTableBill, type CoverChargeParams } from "./bill.js";
import { getMenuSnapshot } from "./provision.js";
import { getChargedGuests } from "./runtime.js";

type MenuSettings = { coverChargeAmount?: number };

export function resolveCoverCharge(
  edgeDb: EdgeDatabase,
  tableId: string,
): CoverChargeParams | undefined {
  const table = edgeDb.select().from(tables).where(eq(tables.id, tableId)).get();
  if (!table || table.isVirtual) return undefined;

  const room = table.roomId
    ? edgeDb.select().from(rooms).where(eq(rooms.id, table.roomId)).get()
    : undefined;
  if (room && !room.applyCoverCharge) return undefined;

  const menu = getMenuSnapshot(edgeDb);
  const settings = (menu?.snapshot as { settings?: MenuSettings } | undefined)?.settings;
  const unitPrice = Number(settings?.coverChargeAmount ?? 0);
  if (unitPrice <= 0) return undefined;

  const guestCount = getChargedGuests(tableId);
  if (!guestCount || guestCount <= 0) return undefined;

  return { unitPrice, guestCount };
}

export function consolidateBillForTable(edgeDb: EdgeDatabase, tableId: string) {
  return consolidateTableBill(tableId, resolveCoverCharge(edgeDb, tableId));
}
