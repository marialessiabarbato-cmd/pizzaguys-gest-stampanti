import type { EdgeDatabase } from "@pizzaguys/edge-db";
import type { InvoiceCustomer } from "@pizzaguys/types";
import { randomUUID } from "node:crypto";
import {
  getFiscalDocument,
  serviceTypeLabel,
  voidFiscalDocument,
  type FiscalDocumentRow,
} from "./fiscal-document-archive.js";
import { getTableRuntime, updateTableGuests, upsertOrder, type OrderLine } from "./runtime.js";
import { broadcastTableStatus } from "./ws-hub.js";

function channelFromServiceType(serviceType: string | null): "TABLE" | "TAKEAWAY" | "DELIVERY" {
  if (serviceType === "DELIVERY") return "DELIVERY";
  if (serviceType === "TAKEAWAY" || serviceType === "BAR") return "TAKEAWAY";
  return "TABLE";
}

export function formatProformaInvoiceText(
  doc: FiscalDocumentRow,
  locationName?: string,
): string {
  const issued = new Date(doc.issuedAt);
  const customer = doc.meta.invoiceCustomer;
  const lines: string[] = [
    "*** PROFORMA FATTURA ***",
    "",
    locationName ?? "Pizza Guys",
    `Fattura proforma n. ${doc.invoiceNumber ?? doc.documentNumber}`,
    `Emessa: ${issued.toLocaleString("it-IT")}`,
    doc.tableLabel ? `Tavolo: ${doc.tableLabel}` : "",
    doc.meta.serviceTypeLabel ? `Servizio: ${doc.meta.serviceTypeLabel}` : "",
    "",
  ].filter(Boolean);

  if (customer) {
    lines.push("INTESTAZIONE");
    lines.push(customer.businessName);
    if (customer.vatNumber) lines.push(`P.IVA: ${customer.vatNumber}`);
    if (customer.taxCode) lines.push(`CF: ${customer.taxCode}`);
    if (customer.sdiCode) lines.push(`SDI: ${customer.sdiCode}`);
    if (customer.pec) lines.push(`PEC: ${customer.pec}`);
    lines.push("");
  } else if (doc.customerBusinessName) {
    lines.push(`Cliente: ${doc.customerBusinessName}`);
    lines.push("");
  }

  lines.push("DETTAGLIO");
  for (const line of doc.receipt.lines) {
    const total = Math.round(line.quantity * line.unitPrice * 100) / 100;
    lines.push(`${line.quantity} ${line.name}`.padEnd(32) + total.toFixed(2));
  }
  lines.push("");
  lines.push(`TOTALE EUR ${doc.total.toFixed(2)}`);
  lines.push("");
  lines.push("Documento non fiscale — solo per verifica dati fattura.");
  return lines.join("\n");
}

export function voidAndRestoreFiscalDocument(
  db: EdgeDatabase,
  id: string,
  staffId: string,
):
  | { ok: true; document: FiscalDocumentRow; tableId: string; tableLabel: string | null }
  | { ok: false; error: string; status?: number } {
  const doc = getFiscalDocument(db, id);
  if (!doc) return { ok: false, error: "Documento non trovato", status: 404 };
  if (doc.status === "VOIDED") {
    return { ok: false, error: "Documento già annullato", status: 400 };
  }
  if (!doc.tableId) {
    return { ok: false, error: "Nessun tavolo associato al documento", status: 400 };
  }

  const runtime = getTableRuntime(doc.tableId);
  if (runtime.status !== "FREE") {
    return {
      ok: false,
      error: `Tavolo ${doc.tableLabel ?? doc.tableId} non libero — impossibile ripristinare il conto`,
      status: 409,
    };
  }

  const voided = voidFiscalDocument(db, id, {
    staffId,
    reason: "Annulla e ripristina",
  });
  if (!voided) return { ok: false, error: "Annullamento non riuscito", status: 500 };

  const now = new Date().toISOString();
  const channel = channelFromServiceType(doc.serviceType);
  const orderLines: OrderLine[] = doc.receipt.lines.map((line) => ({
    id: randomUUID(),
    productId: "",
    name: line.name,
    quantity: line.quantity,
    unitPrice: line.unitPrice,
    channel,
  }));

  upsertOrder({
    id: randomUUID(),
    tableId: doc.tableId,
    operatorId: doc.operatorStaffId ?? staffId,
    operatorName: doc.operatorName ?? "Cassa",
    channel,
    lines: orderLines,
    createdAt: now,
    updatedAt: now,
  });

  if (doc.meta.guests && doc.meta.guests > 0) {
    updateTableGuests(doc.tableId, doc.meta.guests);
  }

  broadcastTableStatus(doc.tableId, "OCCUPIED");

  return {
    ok: true,
    document: voided,
    tableId: doc.tableId,
    tableLabel: doc.tableLabel,
  };
}

export { serviceTypeLabel };
