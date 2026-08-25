import { rooms, tables, type EdgeDatabase } from "@pizzaguys/edge-db";
import { consolidateBillForTable } from "./cover-charge.js";
import { getDayTheoretical } from "./day-report-ledger.js";
import { sumCollectedGuestsToday } from "./fiscal-document-archive.js";
import {
  getAllTableRuntime,
  getOrderByTable,
  getSubmittedOrdersByTable,
  getTableRuntime,
  getUnionGuestTotal,
  type TableRuntime,
} from "./runtime.js";
import { getShiftTheoretical } from "./shift-ledger.js";

export interface OpenTableFilters {
  roomId?: string;
  operatorId?: string;
}

function deriveOpenedAt(rt: TableRuntime, tableId: string): string | null {
  if (rt.openedAt) return rt.openedAt;
  const draft = getOrderByTable(tableId);
  const submitted = getSubmittedOrdersByTable(tableId);
  const times = [draft?.createdAt, ...submitted.map((o) => o.createdAt)].filter(
    Boolean,
  ) as string[];
  if (!times.length) return null;
  return times.sort()[0]!;
}

function deriveLastOrderAt(tableId: string): string | null {
  const draft = getOrderByTable(tableId);
  const submitted = getSubmittedOrdersByTable(tableId);
  const times = [
    draft?.updatedAt,
    ...submitted.map((o) => o.submittedAt ?? o.updatedAt),
  ].filter(Boolean) as string[];
  if (!times.length) return null;
  return times.sort().reverse()[0]!;
}

function deriveLastOrderLabel(tableId: string): string | null {
  const draft = getOrderByTable(tableId);
  const submitted = getSubmittedOrdersByTable(tableId);
  const allOrders = [...submitted, ...(draft ? [draft] : [])];
  if (!allOrders.length) return null;
  const order = allOrders.sort(
    (a, b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime(),
  )[0]!;
  const lines = order.lines.filter((l) => l.quantity - (l.voidedQuantity ?? 0) > 0);
  if (!lines.length) return null;
  return lines[lines.length - 1]!.name;
}

function deriveCourseLabel(tableId: string): string {
  const draft = getOrderByTable(tableId);
  const submitted = getSubmittedOrdersByTable(tableId);
  const active = [
    ...submitted.flatMap((o) => o.lines),
    ...(draft?.lines ?? []),
  ].filter((l) => l.quantity - (l.voidedQuantity ?? 0) > 0);
  if (!active.length) return "—";
  const maxCourse = Math.max(...active.map((l) => l.course ?? 0));
  if (maxCourse <= 0) return "Immediata";
  return `Portata ${maxCourse}`;
}

export function formatElapsed(iso: string | null): string {
  if (!iso) return "—";
  const ms = Date.now() - new Date(iso).getTime();
  if (ms < 0) return "0h 0m";
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return `${h}h ${m}m`;
}

export function buildOpenTablesSnapshot(
  db: EdgeDatabase,
  options?: { shiftId?: string; filters?: OpenTableFilters },
) {
  const dbTables = db.select().from(tables).all();
  const dbRooms = db.select().from(rooms).all();
  const roomMap = new Map(dbRooms.map((r) => [r.id, r.name]));

  const rows: Array<{
    tableId: string;
    tableLabel: string;
    roomId: string | null;
    roomName: string;
    status: string;
    guests: number;
    subtotal: number;
    averagePerCover: number;
    operatorName: string;
    operatorId: string | null;
    lastOrderLabel: string | null;
    courseLabel: string;
    openedAt: string | null;
    lastOrderAt: string | null;
    openedElapsed: string;
    lastOrderElapsed: string;
  }> = [];

  let uncollectedTotal = 0;
  let uncollectedGuests = 0;

  for (const rt of getAllTableRuntime()) {
    if (rt.mergedIntoTableId) continue;
    const table = dbTables.find((t) => t.id === rt.tableId);
    if (!table || table.isVirtual) continue;
    // LOCKED = in mano a un cameriere: resta visibile come tavolo aperto
    if (rt.status === "FREE") continue;

    if (options?.filters?.roomId && table.roomId !== options.filters.roomId) continue;

    const bill = consolidateBillForTable(db, rt.tableId);
    const guests = getUnionGuestTotal(rt.tableId);
    if (bill.total <= 0 && guests <= 0) continue;

    const draft = getOrderByTable(rt.tableId);
    const submitted = getSubmittedOrdersByTable(rt.tableId);
    const lastOrder = submitted[submitted.length - 1];
    const operatorId =
      draft?.operatorId ?? lastOrder?.operatorId ?? rt.lockedBy ?? null;
    const operatorName =
      draft?.operatorName ?? lastOrder?.operatorName ?? rt.lockedByName ?? "—";

    if (options?.filters?.operatorId && operatorId !== options.filters.operatorId) continue;

    uncollectedTotal += bill.total;
    uncollectedGuests += guests;

    const openedAt = deriveOpenedAt(getTableRuntime(rt.tableId), rt.tableId);
    const lastOrderAt = deriveLastOrderAt(rt.tableId);

    rows.push({
      tableId: rt.tableId,
      tableLabel: table.label,
      roomId: table.roomId,
      roomName: table.roomId ? (roomMap.get(table.roomId) ?? "Sala") : "Sala",
      status: rt.status,
      guests,
      subtotal: bill.total,
      averagePerCover:
        guests > 0 ? Math.round((bill.total / guests) * 100) / 100 : bill.total,
      operatorName,
      operatorId,
      lastOrderLabel: deriveLastOrderLabel(rt.tableId),
      courseLabel: deriveCourseLabel(rt.tableId),
      openedAt,
      lastOrderAt,
      openedElapsed: formatElapsed(openedAt),
      lastOrderElapsed: formatElapsed(lastOrderAt),
    });
  }

  rows.sort((a, b) => a.tableLabel.localeCompare(b.tableLabel, "it", { numeric: true }));

  const dayTheoretical = getDayTheoretical(db);
  const shiftTheoretical = options?.shiftId ? getShiftTheoretical(options.shiftId) : null;
  const collectedTotal = shiftTheoretical?.total ?? dayTheoretical.total;
  const collectedGuests = sumCollectedGuestsToday(db);

  const uncollectedRounded = Math.round(uncollectedTotal * 100) / 100;
  const grandTotal = Math.round((collectedTotal + uncollectedRounded) * 100) / 100;
  const allGuests = collectedGuests + uncollectedGuests;

  return {
    rows,
    summary: {
      collected: {
        guests: collectedGuests,
        total: collectedTotal,
      },
      uncollected: {
        guests: uncollectedGuests,
        total: uncollectedRounded,
        tables: rows.length,
      },
      total: {
        total: grandTotal,
        average: allGuests > 0 ? Math.round((grandTotal / allGuests) * 100) / 100 : grandTotal,
      },
    },
    generatedAt: new Date().toISOString(),
  };
}
