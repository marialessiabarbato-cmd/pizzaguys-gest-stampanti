import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { MockReceipt } from "@pizzaguys/fiscal";
import type { FiscalDocumentType, PaymentMethod, WsEnvelope } from "@pizzaguys/types";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { createHardwareBridge } from "@pizzaguys/hardware-bridge";
import { billLinesForCheck, billToReceiptLines, type BillLine } from "./bill.js";
import { consolidateBillForTable } from "./cover-charge.js";
import {
  enrichBillLinesForReport,
  recordDayTransaction,
  resolveServiceType,
} from "./day-report-ledger.js";
import {
  clearRomanSplit,
  clearTableOrders,
  completePaymentRequest,
  getAnalyticSplit,
  getOrderByTable,
  getRomanSplit,
  getSubmittedOrdersByTable,
  isAnalyticSplitComplete,
  markAnalyticCheckPaid,
  recordRomanSharePaid,
  setTableFree,
} from "./runtime.js";
import { recordDayPayment, recordShiftPayment } from "./shift-ledger.js";
import { broadcast } from "./ws-hub.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

async function writeReceiptJson(receipt: MockReceipt) {
  await mkdir(PRINT_DIR, { recursive: true });
  const filePath = join(PRINT_DIR, `${Date.now()}-receipt-${receipt.id}.json`);
  await writeFile(filePath, JSON.stringify(receipt, null, 2));
  return filePath;
}

export interface ExecutePaymentParams {
  edgeDb: EdgeDatabase;
  tableId: string;
  locationId: string;
  paymentMethod: PaymentMethod;
  amountReceived?: number;
  splitMode?: "FULL" | "ROMAN" | "ANALYTIC";
  checkId?: string;
  paymentRequestId?: string;
  shiftId?: string;
  documentType?: FiscalDocumentType;
  operatorId: string;
  operatorName: string;
  tableLabel: string;
  isVirtual?: boolean;
  virtualType?: string | null;
}

export interface ExecutePaymentResult {
  ok: true;
  receipt: MockReceipt;
  receiptPath: string;
  change?: number;
  tableFreed: boolean;
  romanSplitComplete?: boolean;
  analyticSplitComplete?: boolean;
  paidShares?: number;
  totalShares?: number;
  paidCheckId?: string;
}

export async function executeTablePayment(
  params: ExecutePaymentParams,
): Promise<ExecutePaymentResult | { ok: false; error: string; status?: number }> {
  const bill = consolidateBillForTable(params.edgeDb, params.tableId);
  if (bill.lines.length === 0) {
    return { ok: false, error: "Nessuna voce da pagare", status: 400 };
  }

  const roman = getRomanSplit(params.tableId);
  const analytic = getAnalyticSplit(params.tableId);
  const isRoman = params.splitMode === "ROMAN" && roman != null;
  const isAnalytic = params.splitMode === "ANALYTIC" && analytic != null;

  let payAmount = bill.total;
  let receiptLines = billToReceiptLines(bill);

  if (isRoman && roman) {
    if (roman.paidShares >= roman.shares) {
      return { ok: false, error: "Split romano già completato", status: 400 };
    }
    payAmount = roman.shareAmounts[roman.paidShares] ?? bill.total;
    receiptLines = billToReceiptLines(bill, payAmount);
    if (receiptLines.length === 0) {
      receiptLines = [
        {
          name: `Quota ${roman.paidShares + 1}/${roman.shares}`,
          quantity: 1,
          unitPrice: payAmount,
          vatRate: 10,
        },
      ];
    }
  } else if (isAnalytic && analytic && params.checkId) {
    const check = analytic.checks.find((c) => c.id === params.checkId);
    if (!check) return { ok: false, error: "Conto non trovato", status: 404 };
    if (check.paid) return { ok: false, error: "Conto già pagato", status: 400 };
    const checkLines = billLinesForCheck(bill, params.checkId);
    if (checkLines.length === 0) {
      return { ok: false, error: "Nessuna riga nel conto selezionato", status: 400 };
    }
    payAmount = Math.round(checkLines.reduce((s, l) => s + l.lineTotal, 0) * 100) / 100;
    receiptLines = billToReceiptLines(bill, payAmount, checkLines);
  } else if (analytic && !isAnalytic) {
    return {
      ok: false,
      error: "Split analitico attivo — paga i singoli conti",
      status: 400,
    };
  }

  if (params.paymentMethod === "CASH") {
    if (params.amountReceived == null) {
      return { ok: false, error: "Importo ricevuto obbligatorio per contanti", status: 400 };
    }
    if (params.amountReceived < payAmount) {
      return { ok: false, error: "Importo insufficiente", status: 400 };
    }
  }

  const receiptResult = await hardware.emitReceipt({
    locationId: params.locationId,
    tableId: params.tableId,
    paymentMethod: params.paymentMethod,
    documentType: params.documentType ?? "RECEIPT",
    lines: receiptLines,
    amountReceived: params.paymentMethod === "CASH" ? params.amountReceived : undefined,
  });

  if (!receiptResult.success || !receiptResult.receipt) {
    return { ok: false, error: receiptResult.error ?? "Errore emissione scontrino", status: 500 };
  }

  if (params.paymentMethod === "CASH") {
    await hardware.openCashDrawer();
  }

  const receiptPath = await writeReceiptJson(receiptResult.receipt);

  if (params.shiftId) {
    recordShiftPayment(
      params.shiftId,
      params.paymentMethod,
      payAmount,
      receiptResult.receipt.id,
    );
  } else {
    recordDayPayment(params.paymentMethod, payAmount, receiptResult.receipt.id);
  }

  let paidBillLines: BillLine[] = bill.lines;
  if (isAnalytic && params.checkId) {
    paidBillLines = billLinesForCheck(bill, params.checkId);
  } else if (isRoman && bill.total > 0) {
    const ratio = payAmount / bill.total;
    paidBillLines = bill.lines.map((l) => ({
      ...l,
      lineTotal: Math.round(l.lineTotal * ratio * 100) / 100,
    }));
  }

  const saleLines = enrichBillLinesForReport(params.edgeDb, params.tableId, {
    ...bill,
    lines: paidBillLines,
  });
  const submitted = getSubmittedOrdersByTable(params.tableId);
  const draft = getOrderByTable(params.tableId);
  const channel = submitted[0]?.channel ?? draft?.channel ?? "TABLE";
  const closureDate = new Date().toISOString().slice(0, 10);

  recordDayTransaction(params.edgeDb, closureDate, {
    receiptId: receiptResult.receipt.id,
    at: receiptResult.receipt.issuedAt,
    tableLabel: params.tableLabel,
    serviceType: resolveServiceType({
      channel,
      tableLabel: params.tableLabel,
      isVirtual: params.isVirtual,
      virtualType: params.virtualType,
      lines: saleLines,
    }),
    paymentMethod: params.paymentMethod,
    documentType: params.documentType ?? receiptResult.receipt.documentType ?? "RECEIPT",
    operatorId: params.operatorId,
    operatorName: params.operatorName,
    amount: payAmount,
    lines: saleLines,
    coverGuests: bill.coverCharge?.guestCount ?? 0,
  });

  let tableFreed = false;
  let romanSplitComplete = false;
  let analyticSplitComplete = false;
  let paidShares: number | undefined;
  let totalShares: number | undefined;

  if (isRoman && roman) {
    const updated = recordRomanSharePaid(params.tableId);
    paidShares = updated?.paidShares;
    totalShares = updated?.shares;
    if (updated && updated.paidShares >= updated.shares) {
      clearTableOrders(params.tableId);
      setTableFree(params.tableId);
      tableFreed = true;
      romanSplitComplete = true;
    }
  } else if (isAnalytic && analytic && params.checkId) {
    const updated = markAnalyticCheckPaid(params.tableId, params.checkId);
    if (updated && isAnalyticSplitComplete(updated)) {
      clearTableOrders(params.tableId);
      setTableFree(params.tableId);
      tableFreed = true;
      analyticSplitComplete = true;
    }
  } else {
    if (roman) clearRomanSplit(params.tableId);
    clearTableOrders(params.tableId);
    setTableFree(params.tableId);
    tableFreed = true;
  }

  if (params.paymentRequestId) {
    completePaymentRequest(params.paymentRequestId);
  }

  if (tableFreed) {
    broadcast({
      type: "TABLE_STATUS_UPDATE",
      payload: { tableId: params.tableId, status: "FREE" },
      timestamp: new Date().toISOString(),
      messageId: randomUUID(),
    });
  }

  broadcast({
    type: "PAYMENT_COMPLETE",
    payload: {
      requestId: params.paymentRequestId,
      tableId: params.tableId,
      receiptId: receiptResult.receipt.id,
      change: receiptResult.receipt.change,
      romanSplitComplete,
      paidShares,
      totalShares,
    },
    timestamp: new Date().toISOString(),
    messageId: randomUUID(),
  } satisfies WsEnvelope);

  return {
    ok: true,
    receipt: receiptResult.receipt,
    receiptPath,
    change: receiptResult.receipt.change,
    tableFreed,
    romanSplitComplete,
    analyticSplitComplete,
    paidShares,
    totalShares,
    paidCheckId: params.checkId,
  };
}
