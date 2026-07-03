import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { buildReservationsListTicket } from "@pizzaguys/escpos";
import { edgeState, printers, reservations, rooms, tables, type EdgeDatabase } from "@pizzaguys/edge-db";
import { createHardwareBridge } from "@pizzaguys/hardware-bridge";
import { and, asc, desc, eq, gte, lte, sql } from "drizzle-orm";
import { openTableWithGuests } from "./runtime.js";
import { broadcastTableStatus } from "./ws-hub.js";

export type ReservationShift = "LUNCH" | "DINNER_1" | "DINNER_2" | "OTHER";
export type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "ARRIVED"
  | "SEATED"
  | "CANCELLED"
  | "NO_SHOW";

export interface ReservationRow {
  id: string;
  seqNumber: number;
  reservationDate: string;
  reservationTime: string;
  shift: ReservationShift;
  customerName: string;
  phone: string | null;
  guests: number;
  tableId: string | null;
  tableLabel: string | null;
  roomId: string | null;
  roomName: string | null;
  notes: string | null;
  status: ReservationStatus;
  isWaitingList: boolean;
  createdByStaffId: string | null;
  createdByName: string | null;
  confirmedAt: string | null;
  arrivedAt: string | null;
  seatedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ReservationListFilters {
  from?: string;
  to?: string;
  date?: string;
  shift?: ReservationShift | "ALL";
  roomId?: string;
  status?: ReservationStatus | "ALL" | "ACTIVE";
  waitingListOnly?: boolean;
  q?: string;
}

function mapRow(
  row: typeof reservations.$inferSelect,
  roomName?: string | null,
): ReservationRow {
  return {
    id: row.id,
    seqNumber: row.seqNumber,
    reservationDate: row.reservationDate,
    reservationTime: row.reservationTime,
    shift: row.shift as ReservationShift,
    customerName: row.customerName,
    phone: row.phone,
    guests: row.guests,
    tableId: row.tableId,
    tableLabel: row.tableLabel,
    roomId: row.roomId,
    roomName: roomName ?? null,
    notes: row.notes,
    status: row.status as ReservationStatus,
    isWaitingList: row.isWaitingList,
    createdByStaffId: row.createdByStaffId,
    createdByName: row.createdByName,
    confirmedAt: row.confirmedAt,
    arrivedAt: row.arrivedAt,
    seatedAt: row.seatedAt,
    cancelledAt: row.cancelledAt,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function resolveTableMeta(db: EdgeDatabase, tableId?: string | null) {
  if (!tableId) return { tableLabel: null as string | null, roomId: null as string | null };
  const table = db.select().from(tables).where(eq(tables.id, tableId)).get();
  if (!table) return { tableLabel: null, roomId: null };
  return { tableLabel: table.label, roomId: table.roomId };
}

function nextSeqNumber(db: EdgeDatabase, date: string) {
  const row = db
    .select({ max: sql<number>`coalesce(max(${reservations.seqNumber}), 0)` })
    .from(reservations)
    .where(eq(reservations.reservationDate, date))
    .get();
  return (row?.max ?? 0) + 1;
}

export function listReservations(db: EdgeDatabase, filters: ReservationListFilters = {}) {
  const conditions = [];
  if (filters.date) {
    conditions.push(eq(reservations.reservationDate, filters.date));
  } else {
    if (filters.from) conditions.push(gte(reservations.reservationDate, filters.from));
    if (filters.to) conditions.push(lte(reservations.reservationDate, filters.to));
  }
  if (filters.shift && filters.shift !== "ALL") {
    conditions.push(eq(reservations.shift, filters.shift));
  }
  if (filters.roomId) conditions.push(eq(reservations.roomId, filters.roomId));
  if (filters.waitingListOnly) {
    conditions.push(eq(reservations.isWaitingList, true));
  }
  if (filters.status === "ACTIVE") {
    conditions.push(
      sql`${reservations.status} NOT IN ('CANCELLED', 'NO_SHOW', 'SEATED')`,
    );
  } else if (filters.status && filters.status !== "ALL") {
    conditions.push(eq(reservations.status, filters.status));
  }

  const rows = db
    .select()
    .from(reservations)
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(
      asc(reservations.reservationDate),
      asc(reservations.reservationTime),
      asc(reservations.seqNumber),
    )
    .all();

  const roomMap = new Map(db.select().from(rooms).all().map((r) => [r.id, r.name]));
  let mapped = rows.map((r) => mapRow(r, r.roomId ? roomMap.get(r.roomId) : null));

  if (filters.q?.trim()) {
    const q = filters.q.trim().toLowerCase();
    mapped = mapped.filter(
      (r) =>
        r.customerName.toLowerCase().includes(q) ||
        (r.phone?.toLowerCase().includes(q) ?? false) ||
        (r.tableLabel?.toLowerCase().includes(q) ?? false) ||
        (r.notes?.toLowerCase().includes(q) ?? false),
    );
  }

  return mapped;
}

export function getReservation(db: EdgeDatabase, id: string) {
  const row = db.select().from(reservations).where(eq(reservations.id, id)).get();
  if (!row) return null;
  const roomName = row.roomId
    ? db.select().from(rooms).where(eq(rooms.id, row.roomId)).get()?.name
    : null;
  return mapRow(row, roomName);
}

export function createReservation(
  db: EdgeDatabase,
  input: {
    reservationDate: string;
    reservationTime: string;
    shift?: ReservationShift;
    customerName: string;
    phone?: string;
    guests: number;
    tableId?: string;
    roomId?: string;
    notes?: string;
    isWaitingList?: boolean;
    operatorId?: string;
    operatorName?: string;
  },
) {
  const now = new Date().toISOString();
  const tableMeta = resolveTableMeta(db, input.tableId);
  const id = randomUUID();
  const row = {
    id,
    seqNumber: nextSeqNumber(db, input.reservationDate),
    reservationDate: input.reservationDate,
    reservationTime: input.reservationTime,
    shift: input.shift ?? "DINNER_1",
    customerName: input.customerName.trim(),
    phone: input.phone?.trim() || null,
    guests: input.guests,
    tableId: input.tableId ?? null,
    tableLabel: tableMeta.tableLabel,
    roomId: input.roomId ?? tableMeta.roomId,
    notes: input.notes?.trim() || null,
    status: "CONFIRMED" as const,
    isWaitingList: input.isWaitingList ?? false,
    createdByStaffId: input.operatorId ?? null,
    createdByName: input.operatorName ?? null,
    confirmedAt: now,
    arrivedAt: null,
    seatedAt: null,
    cancelledAt: null,
    createdAt: now,
    updatedAt: now,
  };
  db.insert(reservations).values(row).run();
  return getReservation(db, id)!;
}

export function updateReservation(
  db: EdgeDatabase,
  id: string,
  patch: Partial<{
    reservationDate: string;
    reservationTime: string;
    shift: ReservationShift;
    customerName: string;
    phone: string | null;
    guests: number;
    tableId: string | null;
    roomId: string | null;
    notes: string | null;
    status: ReservationStatus;
    isWaitingList: boolean;
  }>,
) {
  const existing = db.select().from(reservations).where(eq(reservations.id, id)).get();
  if (!existing) return null;

  const now = new Date().toISOString();
  const tableMeta =
    patch.tableId !== undefined
      ? resolveTableMeta(db, patch.tableId)
      : { tableLabel: existing.tableLabel, roomId: existing.roomId };

  const updates: Partial<typeof reservations.$inferInsert> = {
    updatedAt: now,
  };
  if (patch.reservationDate !== undefined) updates.reservationDate = patch.reservationDate;
  if (patch.reservationTime !== undefined) updates.reservationTime = patch.reservationTime;
  if (patch.shift !== undefined) updates.shift = patch.shift;
  if (patch.customerName !== undefined) updates.customerName = patch.customerName.trim();
  if (patch.phone !== undefined) updates.phone = patch.phone?.trim() || null;
  if (patch.guests !== undefined) updates.guests = patch.guests;
  if (patch.notes !== undefined) updates.notes = patch.notes?.trim() || null;
  if (patch.isWaitingList !== undefined) updates.isWaitingList = patch.isWaitingList;
  if (patch.tableId !== undefined) {
    updates.tableId = patch.tableId;
    updates.tableLabel = tableMeta.tableLabel;
    if (patch.roomId === undefined) updates.roomId = tableMeta.roomId;
  }
  if (patch.roomId !== undefined) updates.roomId = patch.roomId;
  if (patch.status !== undefined) {
    updates.status = patch.status;
    if (patch.status === "CONFIRMED" && !existing.confirmedAt) updates.confirmedAt = now;
    if (patch.status === "CANCELLED" || patch.status === "NO_SHOW") {
      updates.cancelledAt = now;
    }
  }

  db.update(reservations).set(updates).where(eq(reservations.id, id)).run();
  return getReservation(db, id);
}

export function deleteReservation(db: EdgeDatabase, id: string) {
  const existing = db.select().from(reservations).where(eq(reservations.id, id)).get();
  if (!existing) return false;
  db.delete(reservations).where(eq(reservations.id, id)).run();
  return true;
}

export function restoreReservation(db: EdgeDatabase, id: string) {
  const existing = db.select().from(reservations).where(eq(reservations.id, id)).get();
  if (!existing) return null;
  if (existing.status !== "CANCELLED" && existing.status !== "NO_SHOW") {
    return getReservation(db, id);
  }
  const now = new Date().toISOString();
  db.update(reservations)
    .set({
      status: "CONFIRMED",
      cancelledAt: null,
      confirmedAt: existing.confirmedAt ?? now,
      updatedAt: now,
    })
    .where(eq(reservations.id, id))
    .run();
  return getReservation(db, id);
}

export function assignReservationTable(db: EdgeDatabase, id: string, tableId: string) {
  const table = db.select().from(tables).where(eq(tables.id, tableId)).get();
  if (!table || table.isVirtual) return { ok: false as const, error: "Tavolo non valido" };
  const updated = updateReservation(db, id, {
    tableId,
    roomId: table.roomId,
  });
  if (!updated) return { ok: false as const, error: "Prenotazione non trovata" };
  return { ok: true as const, reservation: updated };
}

export function markReservationArrived(
  db: EdgeDatabase,
  id: string,
  options?: { openTable?: boolean },
) {
  const existing = getReservation(db, id);
  if (!existing) return { ok: false as const, error: "Prenotazione non trovata" };
  if (existing.status === "CANCELLED" || existing.status === "NO_SHOW") {
    return { ok: false as const, error: "Prenotazione annullata" };
  }

  const now = new Date().toISOString();
  let seated = false;

  if (options?.openTable && existing.tableId) {
    const result = openTableWithGuests(existing.tableId, existing.guests);
    if (!result.ok) return result;
    broadcastTableStatus(existing.tableId, "OCCUPIED");
    seated = true;
  }

  db.update(reservations)
    .set({
      status: seated ? "SEATED" : "ARRIVED",
      arrivedAt: existing.arrivedAt ?? now,
      seatedAt: seated ? now : existing.seatedAt,
      updatedAt: now,
    })
    .where(eq(reservations.id, id))
    .run();

  return { ok: true as const, reservation: getReservation(db, id)! };
}

export function summarizeReservationsForDate(db: EdgeDatabase, date: string) {
  const rows = listReservations(db, { date });
  const active = rows.filter(
    (r) => !["CANCELLED", "NO_SHOW"].includes(r.status),
  );
  const guests = active.reduce((s, r) => s + r.guests, 0);
  const waiting = active.filter((r) => r.isWaitingList).length;
  return {
    date,
    total: rows.length,
    active: active.length,
    guests,
    waitingList: waiting,
    arrived: active.filter((r) => r.status === "ARRIVED" || r.status === "SEATED").length,
  };
}

/** Coperti prenotati per fascia oraria su un giorno (disponibilità semplificata). */
export function availabilityByShift(db: EdgeDatabase, date: string) {
  const rows = listReservations(db, { date, status: "ACTIVE" });
  const byShift: Record<ReservationShift, { reservations: number; guests: number }> = {
    LUNCH: { reservations: 0, guests: 0 },
    DINNER_1: { reservations: 0, guests: 0 },
    DINNER_2: { reservations: 0, guests: 0 },
    OTHER: { reservations: 0, guests: 0 },
  };
  for (const row of rows) {
    const bucket = byShift[row.shift];
    bucket.reservations += 1;
    bucket.guests += row.guests;
  }
  const totalCapacity = db
    .select()
    .from(tables)
    .all()
    .filter((t) => !t.isVirtual)
    .reduce((s, t) => s + t.defaultGuests, 0);
  return { date, byShift, totalTableCapacity: totalCapacity };
}

export function listRecentReservations(db: EdgeDatabase, limit = 50) {
  return db
    .select()
    .from(reservations)
    .orderBy(desc(reservations.reservationDate), desc(reservations.reservationTime))
    .limit(limit)
    .all()
    .map((r) => mapRow(r));
}

const SHIFT_PRINT_LABEL: Record<ReservationShift, string> = {
  LUNCH: "Pranzo",
  DINNER_1: "Cena 1°",
  DINNER_2: "Cena 2°",
  OTHER: "Altro",
};

const STATUS_PRINT_LABEL: Record<ReservationStatus, string> = {
  PENDING: "In attesa",
  CONFIRMED: "Confermata",
  ARRIVED: "Arrivato",
  SEATED: "Seduto",
  CANCELLED: "Annullata",
  NO_SHOW: "No show",
};

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

export async function printReservationsList(
  db: EdgeDatabase,
  filters: ReservationListFilters & { operatorName?: string },
) {
  const rows = listReservations(db, { ...filters, status: "ACTIVE" });
  const state = db.select().from(edgeState).get();
  const printedAt = new Date().toLocaleString("it-IT");
  const payload = buildReservationsListTicket({
    locationName: state?.locationName ?? undefined,
    from: filters.from ?? filters.date ?? todayKey(),
    to: filters.to ?? filters.date ?? todayKey(),
    printedAt,
    operatorName: filters.operatorName,
    summaryGuests: rows.reduce((s, r) => s + r.guests, 0),
    rows: rows.map((r) => ({
      seqNumber: r.seqNumber,
      reservationDate: r.reservationDate,
      reservationTime: r.reservationTime,
      customerName: r.customerName,
      guests: r.guests,
      tableLabel: r.tableLabel,
      shiftLabel: SHIFT_PRINT_LABEL[r.shift],
      statusLabel: STATUS_PRINT_LABEL[r.status],
      notes: r.notes,
    })),
  });

  const printer =
    db.select().from(printers).all().find((p) => p.enabled && p.workCenter === "BAR") ??
    db.select().from(printers).all().find((p) => p.enabled);

  const printResult = await hardware.printEscPos(
    printer?.id ?? "cassa",
    payload,
    "reservations-list",
  );

  await mkdir(PRINT_DIR, { recursive: true });
  const txtPath = join(PRINT_DIR, `${Date.now()}-reservations.txt`);
  const txt = [
    "PRENOTAZIONI",
    `${filters.from ?? filters.date} — ${filters.to ?? filters.date}`,
    "",
    ...rows.map(
      (r) =>
        `${r.reservationDate} ${r.reservationTime} #${r.seqNumber} ${r.customerName} (${r.guests}) Tav.${r.tableLabel ?? "—"}`,
    ),
    "",
    `Totale: ${rows.length} prenotazioni, ${rows.reduce((s, r) => s + r.guests, 0)} coperti`,
  ].join("\n");
  await writeFile(txtPath, txt);

  return { ok: true as const, printResult, txtPath, count: rows.length };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}
