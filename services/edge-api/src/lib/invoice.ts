import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  buildMockFatturaPaXml,
  createMockElectronicInvoice,
  type MockElectronicInvoice,
  type MockReceiptLine,
} from "@pizzaguys/fiscal";
import type { InvoiceCustomer, PaymentMethod } from "@pizzaguys/types";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { edgeState } from "@pizzaguys/edge-db";
import { sql } from "drizzle-orm";
import { writeEdgeAudit } from "./audit.js";
import { enqueueInvoiceSync, tryImmediateInvoiceSync } from "./sync-queue.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";

export interface IssueInvoiceParams {
  edgeDb: EdgeDatabase;
  locationId: string;
  receiptId: string;
  tableId?: string;
  tableLabel?: string;
  customer: InvoiceCustomer;
  lines: MockReceiptLine[];
  paymentMethod: PaymentMethod;
  operatorId: string;
  operatorName: string;
}

export interface IssueInvoiceResult {
  invoice: MockElectronicInvoice;
  jsonPath: string;
  xmlPath: string;
}

export async function issueElectronicInvoice(
  params: IssueInvoiceParams,
): Promise<IssueInvoiceResult> {
  const state = params.edgeDb.select().from(edgeState).where(sql`id = 1`).get();

  const invoice = createMockElectronicInvoice({
    locationId: params.locationId,
    locationName: state?.locationName ?? undefined,
    receiptId: params.receiptId,
    tableId: params.tableId,
    tableLabel: params.tableLabel,
    customer: params.customer,
    lines: params.lines,
    paymentMethod: params.paymentMethod,
  });

  await mkdir(PRINT_DIR, { recursive: true });
  const base = `${Date.now()}-invoice-${invoice.invoiceNumber}`;
  const jsonPath = join(PRINT_DIR, `${base}.json`);
  const xmlPath = join(PRINT_DIR, `${base}.xml`);
  const receiptNotePath = join(PRINT_DIR, `${Date.now()}-receipt-${params.receiptId}-fattura-allegata.txt`);

  await writeFile(jsonPath, JSON.stringify(invoice, null, 2));
  await writeFile(xmlPath, buildMockFatturaPaXml(invoice));
  await writeFile(
    receiptNotePath,
    [
      "*** FATTURA ALLEGATA ***",
      `Scontrino RT: ${params.receiptId}`,
      `Fattura mock n. ${invoice.invoiceNumber}`,
      `Cliente: ${params.customer.businessName}`,
      `Totale: € ${invoice.total.toFixed(2)}`,
      "",
      "I corrispettivi RT per questa vendita sono azzerati (mock).",
    ].join("\n"),
  );

  enqueueInvoiceSync(params.edgeDb, {
    edgeInvoiceId: invoice.id,
    locationId: params.locationId,
    invoice,
  });

  await tryImmediateInvoiceSync(params.edgeDb, invoice.id);

  writeEdgeAudit(params.edgeDb, {
    operation: "ELECTRONIC_INVOICE_ISSUED",
    severity: "INFO",
    nextState: {
      invoiceId: invoice.id,
      invoiceNumber: invoice.invoiceNumber,
      receiptId: params.receiptId,
      customer: params.customer.businessName,
      total: invoice.total,
      operatorId: params.operatorId,
      operatorName: params.operatorName,
    },
  });

  return { invoice, jsonPath, xmlPath };
}
