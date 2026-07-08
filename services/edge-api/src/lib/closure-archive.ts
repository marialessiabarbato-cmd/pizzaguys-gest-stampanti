import { closureArchive, staff } from "@pizzaguys/edge-db";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { and, asc, eq, gte, lte } from "drizzle-orm";
import type { DailyClosureRecord } from "./closure-state.js";

function mapClosureRow(row: typeof closureArchive.$inferSelect): ClosureArchiveRow {
  return {
    id: row.id,
    closureDate: row.closureDate,
    zNumber: row.zNumber,
    theoretical: JSON.parse(row.theoreticalJson) as DailyClosureRecord["theoretical"],
    declared: JSON.parse(row.declaredJson) as DailyClosureRecord["declared"],
    discrepancy: JSON.parse(row.discrepancyJson) as DailyClosureRecord["discrepancy"],
    syncedAt: row.syncedAt,
    createdAt: row.createdAt,
  };
}

export function persistClosureArchive(
  db: EdgeDatabase,
  record: DailyClosureRecord,
  operatorStaffId?: string,
) {
  db.insert(closureArchive)
    .values({
      id: record.id,
      closureDate: record.closureDate,
      zNumber: record.zNumber ?? null,
      theoreticalJson: JSON.stringify(record.theoretical),
      declaredJson: JSON.stringify(record.declared),
      discrepancyJson: JSON.stringify(record.discrepancy),
      operatorStaffId: operatorStaffId ?? null,
      syncedAt: record.syncedAt ?? null,
      createdAt: record.createdAt,
    })
    .run();
}

export function updateClosureSyncedAt(db: EdgeDatabase, closureId: string, syncedAt: string) {
  db.update(closureArchive).set({ syncedAt }).where(eq(closureArchive.id, closureId)).run();
}

export interface ClosureArchiveRow {
  id: string;
  closureDate: string;
  zNumber: number | null;
  theoretical: DailyClosureRecord["theoretical"];
  declared: DailyClosureRecord["declared"];
  discrepancy: DailyClosureRecord["discrepancy"];
  syncedAt: string | null;
  createdAt: string;
}

export interface ClosureArchiveDetail extends ClosureArchiveRow {
  operatorName: string | null;
}

export function getClosureArchiveById(
  db: EdgeDatabase,
  id: string,
): ClosureArchiveDetail | null {
  const row = db.select().from(closureArchive).where(eq(closureArchive.id, id)).get();
  if (!row) return null;

  let operatorName: string | null = null;
  if (row.operatorStaffId) {
    const member = db.select().from(staff).where(eq(staff.id, row.operatorStaffId)).get();
    if (member) operatorName = `${member.firstName} ${member.lastName}`;
  }

  return { ...mapClosureRow(row), operatorName };
}

export function listClosureArchive(
  db: EdgeDatabase,
  filters?: { from?: string; to?: string },
): ClosureArchiveRow[] {
  const conditions = [];
  if (filters?.from) conditions.push(gte(closureArchive.closureDate, filters.from));
  if (filters?.to) conditions.push(lte(closureArchive.closureDate, filters.to));

  const query = db.select().from(closureArchive).orderBy(asc(closureArchive.closureDate));
  const rows =
    conditions.length > 0 ? query.where(and(...conditions)).all() : query.all();

  return rows.map((row) => mapClosureRow(row));
}

export function buildClosureCsv(rows: ClosureArchiveRow[], locationName?: string): string {
  const paymentMethods = new Set<string>();
  for (const row of rows) {
    for (const method of Object.keys(row.theoretical.byPaymentMethod)) {
      paymentMethods.add(method);
    }
  }
  const methods = [...paymentMethods].sort();

  const header = [
    "sede",
    "data_chiusura",
    "numero_z",
    "totale_lordo",
    "contanti_teorico",
    "pos_teorico",
    "contanti_dichiarato",
    "pos_dichiarato",
    "scostamento_contanti",
    "scostamento_pos",
    "scostamento_totale",
    "transazioni",
    "sync_cloud",
    ...methods.map((m) => `metodo_${m.toLowerCase()}`),
  ];

  const escape = (value: string | number | null | undefined) => {
    const str = value == null ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const lines = [header.join(",")];
  const site = locationName ?? "edge";

  for (const row of rows) {
    const base = [
      site,
      row.closureDate,
      row.zNumber ?? "",
      row.theoretical.total.toFixed(2),
      row.theoretical.cash.toFixed(2),
      row.theoretical.pos.toFixed(2),
      row.declared.cash.toFixed(2),
      row.declared.pos.toFixed(2),
      row.discrepancy.cash.toFixed(2),
      row.discrepancy.pos.toFixed(2),
      row.discrepancy.total.toFixed(2),
      row.theoretical.transactionCount,
      row.syncedAt ? "SI" : "NO",
      ...methods.map((m) => (row.theoretical.byPaymentMethod[m] ?? 0).toFixed(2)),
    ];
    lines.push(base.map(escape).join(","));
  }

  return `\uFEFF${lines.join("\n")}\n`;
}
