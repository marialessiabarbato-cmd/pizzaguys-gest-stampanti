import { tables, type EdgeDatabase } from "@pizzaguys/edge-db";
import { and, eq, isNull, max } from "drizzle-orm";

type ReorderResult = { ok: true } | { ok: false; error: string };

function roomFilter(roomId: string | null) {
  return roomId ? eq(tables.roomId, roomId) : isNull(tables.roomId);
}

/**
 * Salva l'ordine dei tavoli fisici di una sala: sortOrder 1..n nell'ordine ricevuto.
 * Gli id devono essere esattamente i tavoli fisici della sala (niente mancanti o estranei),
 * così un palmare con la lista non aggiornata non lascia ordini a metà.
 */
export function applyTableOrder(
  db: EdgeDatabase,
  roomId: string | null,
  tableIds: string[],
): ReorderResult {
  const roomTables = db
    .select({ id: tables.id })
    .from(tables)
    .where(and(roomFilter(roomId), eq(tables.isVirtual, false)))
    .all();
  const expected = new Set(roomTables.map((t) => t.id));
  const received = new Set(tableIds);
  if (received.size !== tableIds.length) return { ok: false, error: "Tavoli duplicati nell'ordine" };
  if (received.size !== expected.size || tableIds.some((id) => !expected.has(id))) {
    return { ok: false, error: "La sala è cambiata: ricarica la lista dei tavoli e riprova" };
  }
  db.transaction((tx) => {
    tableIds.forEach((id, index) => {
      tx.update(tables).set({ sortOrder: index + 1 }).where(eq(tables.id, id)).run();
    });
  });
  return { ok: true };
}

/**
 * sortOrder per un nuovo tavolo: in coda se la sala ha già un ordine personalizzato,
 * altrimenti 0 (ordine naturale per etichetta).
 */
export function nextTableSortOrder(db: EdgeDatabase, roomId: string | null): number {
  const row = db
    .select({ value: max(tables.sortOrder) })
    .from(tables)
    .where(and(roomFilter(roomId), eq(tables.isVirtual, false)))
    .get();
  const current = row?.value ?? 0;
  return current > 0 ? current + 1 : 0;
}
