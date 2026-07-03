import { fiscalDocuments } from "@pizzaguys/edge-db";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import type { MockReceipt } from "@pizzaguys/fiscal";
import type { FiscalDocumentType, PaymentMethod } from "@pizzaguys/types";
import type { InvoiceCustomer } from "@pizzaguys/types";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";

export interface FiscalDocumentOrderLine {
  name: string;
  quantity: number;
  unitPrice: number;
  vatRate?: number;
}

export interface FiscalDocumentMeta {
  tableLabel?: string;
  guests?: number;
  operatorName?: string;
  amountReceived?: number;
  paymentSplits?: import("@pizzaguys/types").PaymentSplit[];
  serviceTypeLabel?: string;
  orderLines?: FiscalDocumentOrderLine[];
  invoiceCustomer?: InvoiceCustomer;
}

export interface FiscalDocumentRow {
  id: string;
  documentNumber: number;
  documentType: FiscalDocumentType;
  issuedAt: string;
  closureDate: string;
  locationId: string;
  tableId: string | null;
  tableLabel: string | null;
  paymentMethod: PaymentMethod;
  serviceType: string | null;
  total: number;
  changeAmount: number | null;
  operatorStaffId: string | null;
  operatorName: string | null;
  shiftId: string | null;
  status: "ISSUED" | "VOIDED";
  voidedAt: string | null;
  voidedByStaffId: string | null;
  voidReason: string | null;
  invoiceId: string | null;
  invoiceNumber: string | null;
  customerBusinessName: string | null;
  receipt: MockReceipt;
  meta: FiscalDocumentMeta;
  fileJsonPath: string | null;
  fileTxtPath: string | null;
  createdAt: string;
}

export interface FiscalDocumentListFilters {
  from?: string;
  to?: string;
  documentType?: FiscalDocumentType | "ALL";
  paymentMethod?: PaymentMethod | "ALL";
  operatorStaffId?: string;
  tableLabel?: string;
  customer?: string;
  status?: "ALL" | "ACTIVE" | "VOIDED";
  q?: string;
  limit?: number;
}

function mapRow(row: typeof fiscalDocuments.$inferSelect): FiscalDocumentRow {
  return {
    id: row.id,
    documentNumber: row.documentNumber,
    documentType: row.documentType as FiscalDocumentType,
    issuedAt: row.issuedAt,
    closureDate: row.closureDate,
    locationId: row.locationId,
    tableId: row.tableId,
    tableLabel: row.tableLabel,
    paymentMethod: row.paymentMethod as PaymentMethod,
    serviceType: row.serviceType,
    total: row.total,
    changeAmount: row.changeAmount,
    operatorStaffId: row.operatorStaffId,
    operatorName: row.operatorName,
    shiftId: row.shiftId,
    status: row.status as "ISSUED" | "VOIDED",
    voidedAt: row.voidedAt,
    voidedByStaffId: row.voidedByStaffId,
    voidReason: row.voidReason,
    invoiceId: row.invoiceId,
    invoiceNumber: row.invoiceNumber,
    customerBusinessName: row.customerBusinessName,
    receipt: JSON.parse(row.receiptJson) as MockReceipt,
    meta: row.metaJson ? (JSON.parse(row.metaJson) as FiscalDocumentMeta) : {},
    fileJsonPath: row.fileJsonPath,
    fileTxtPath: row.fileTxtPath,
    createdAt: row.createdAt,
  };
}

function nextDocumentNumber(db: EdgeDatabase): number {
  const row = db
    .select({ max: sql<number>`COALESCE(MAX(${fiscalDocuments.documentNumber}), 0)` })
    .from(fiscalDocuments)
    .get();
  return (row?.max ?? 0) + 1;
}

export function persistFiscalDocument(
  db: EdgeDatabase,
  params: {
    receipt: MockReceipt;
    meta?: FiscalDocumentMeta;
    operatorStaffId?: string;
    operatorName?: string;
    shiftId?: string;
    serviceType?: string;
    fileJsonPath?: string;
    fileTxtPath?: string;
    invoiceId?: string;
    invoiceNumber?: string;
    customerBusinessName?: string;
    tableLabel?: string;
  },
): FiscalDocumentRow {
  const now = new Date().toISOString();
  const closureDate = params.receipt.issuedAt.slice(0, 10);
  const documentNumber = nextDocumentNumber(db);

  const row = {
    id: params.receipt.id,
    documentNumber,
    documentType: params.receipt.documentType,
    issuedAt: params.receipt.issuedAt,
    closureDate,
    locationId: params.receipt.locationId,
    tableId: params.receipt.tableId ?? null,
    tableLabel: params.tableLabel ?? params.meta?.tableLabel ?? null,
    paymentMethod: params.receipt.paymentMethod,
    serviceType: params.serviceType ?? null,
    total: params.receipt.total,
    changeAmount: params.receipt.change ?? null,
    operatorStaffId: params.operatorStaffId ?? null,
    operatorName: params.operatorName ?? params.meta?.operatorName ?? null,
    shiftId: params.shiftId ?? null,
    status: "ISSUED" as const,
    voidedAt: null,
    voidedByStaffId: null,
    voidReason: null,
    invoiceId: params.invoiceId ?? null,
    invoiceNumber: params.invoiceNumber ?? null,
    customerBusinessName: params.customerBusinessName ?? null,
    receiptJson: JSON.stringify(params.receipt),
    metaJson: params.meta ? JSON.stringify(params.meta) : null,
    fileJsonPath: params.fileJsonPath ?? null,
    fileTxtPath: params.fileTxtPath ?? null,
    createdAt: now,
  };

  db.insert(fiscalDocuments)
    .values(row)
    .onConflictDoUpdate({
      target: fiscalDocuments.id,
      set: {
        receiptJson: row.receiptJson,
        metaJson: row.metaJson,
        fileJsonPath: row.fileJsonPath,
        fileTxtPath: row.fileTxtPath,
        invoiceId: row.invoiceId,
        invoiceNumber: row.invoiceNumber,
        customerBusinessName: row.customerBusinessName,
      },
    })
    .run();

  return mapRow(row);
}

export function listFiscalDocuments(
  db: EdgeDatabase,
  filters: FiscalDocumentListFilters = {},
): FiscalDocumentRow[] {
  const conditions = [];
  if (filters.from) conditions.push(gte(fiscalDocuments.closureDate, filters.from));
  if (filters.to) conditions.push(lte(fiscalDocuments.closureDate, filters.to));
  if (filters.documentType && filters.documentType !== "ALL") {
    conditions.push(eq(fiscalDocuments.documentType, filters.documentType));
  }
  if (filters.paymentMethod && filters.paymentMethod !== "ALL") {
    conditions.push(eq(fiscalDocuments.paymentMethod, filters.paymentMethod));
  }
  if (filters.operatorStaffId) {
    conditions.push(eq(fiscalDocuments.operatorStaffId, filters.operatorStaffId));
  }
  if (filters.status === "ACTIVE") {
    conditions.push(eq(fiscalDocuments.status, "ISSUED"));
  } else if (filters.status === "VOIDED") {
    conditions.push(eq(fiscalDocuments.status, "VOIDED"));
  }

  const limit = Math.min(filters.limit ?? 300, 1000);
  const query = db
    .select()
    .from(fiscalDocuments)
    .orderBy(desc(fiscalDocuments.issuedAt))
    .limit(limit);

  let rows =
    conditions.length > 0 ? query.where(and(...conditions)).all() : query.all();

  const tableLabel = filters.tableLabel?.trim().toLowerCase();
  const customer = filters.customer?.trim().toLowerCase();
  const q = filters.q?.trim().toLowerCase();

  if (tableLabel) {
    rows = rows.filter((r) => (r.tableLabel ?? "").toLowerCase().includes(tableLabel));
  }
  if (customer) {
    rows = rows.filter((r) => (r.customerBusinessName ?? "").toLowerCase().includes(customer));
  }
  if (q) {
    rows = rows.filter((r) => {
      const hay = [
        r.id,
        String(r.documentNumber),
        r.tableLabel,
        r.operatorName,
        r.customerBusinessName,
        r.invoiceNumber,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }

  return rows.map(mapRow);
}

export function getFiscalDocument(db: EdgeDatabase, id: string): FiscalDocumentRow | null {
  const row = db.select().from(fiscalDocuments).where(eq(fiscalDocuments.id, id)).get();
  return row ? mapRow(row) : null;
}

export function voidFiscalDocument(
  db: EdgeDatabase,
  id: string,
  params: { staffId: string; reason?: string },
): FiscalDocumentRow | null {
  const existing = getFiscalDocument(db, id);
  if (!existing || existing.status === "VOIDED") return null;

  const voidedAt = new Date().toISOString();
  db.update(fiscalDocuments)
    .set({
      status: "VOIDED",
      voidedAt,
      voidedByStaffId: params.staffId,
      voidReason: params.reason ?? null,
    })
    .where(eq(fiscalDocuments.id, id))
    .run();

  return getFiscalDocument(db, id);
}

export function updateFiscalDocumentPayment(
  db: EdgeDatabase,
  id: string,
  paymentMethod: PaymentMethod,
): FiscalDocumentRow | null {
  const existing = getFiscalDocument(db, id);
  if (!existing || existing.status === "VOIDED") return null;

  const receipt: MockReceipt = { ...existing.receipt, paymentMethod };
  db.update(fiscalDocuments)
    .set({
      paymentMethod,
      receiptJson: JSON.stringify(receipt),
    })
    .where(eq(fiscalDocuments.id, id))
    .run();

  return getFiscalDocument(db, id);
}

export function buildFiscalDocumentsCsv(rows: FiscalDocumentRow[], locationName?: string): string {
  const header = [
    "sede",
    "data",
    "ora",
    "tipo",
    "numero",
    "tavolo",
    "totale",
    "pagamento",
    "operatore",
    "cliente",
    "stato",
    "id",
  ];
  const escape = (value: string | number | null | undefined) => {
    const str = value == null ? "" : String(value);
    if (str.includes(",") || str.includes('"') || str.includes("\n")) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };
  const site = locationName ?? "edge";
  const typeCode = (t: FiscalDocumentType) =>
    t === "INVOICE" ? "F" : t === "TRAINING" ? "T" : "S";

  const lines = [header.join(",")];
  for (const row of rows) {
    const issued = new Date(row.issuedAt);
    lines.push(
      [
        site,
        issued.toLocaleDateString("it-IT"),
        issued.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
        typeCode(row.documentType),
        row.documentNumber,
        row.tableLabel ?? "",
        row.total.toFixed(2),
        row.paymentMethod,
        row.operatorName ?? "",
        row.customerBusinessName ?? "",
        row.status,
        row.id,
      ]
        .map(escape)
        .join(","),
    );
  }
  return `\uFEFF${lines.join("\n")}\n`;
}

export function serviceTypeLabel(type?: string | null): string | undefined {
  if (!type) return undefined;
  const map: Record<string, string> = {
    BAR: "BAR",
    TABLE: "TAVOLI",
    TAKEAWAY: "ASPORTO E DOMICILIO",
    DELIVERY: "CONSEGNA A DOMICILIO",
  };
  return map[type] ?? type;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/** Somma coperti da documenti fiscali incassati oggi (status ISSUED). */
export function sumCollectedGuestsToday(db: EdgeDatabase, date = todayKey()) {
  const rows = db
    .select()
    .from(fiscalDocuments)
    .where(
      and(eq(fiscalDocuments.closureDate, date), eq(fiscalDocuments.status, "ISSUED")),
    )
    .all();
  let total = 0;
  for (const row of rows) {
    if (!row.metaJson) continue;
    try {
      const meta = JSON.parse(row.metaJson) as FiscalDocumentMeta;
      if (meta.guests && meta.guests > 0) total += meta.guests;
    } catch {
      /* ignore */
    }
  }
  return total;
}
