import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { roundToFiveCents } from "@pizzaguys/fiscal";
import type { MockReceipt } from "@pizzaguys/fiscal";
import { formatMockReceiptText } from "@pizzaguys/fiscal";
import type { FiscalDocumentType, InvoiceCustomer, PaymentMethod, PaymentSplit, WsEnvelope } from "@pizzaguys/types";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { createHardwareBridge } from "@pizzaguys/hardware-bridge";
import { billLinesForCheck, billToReceiptLines, FULL_MEAL_RECEIPT_LABEL, type BillLine } from "./bill.js";
import { getCounterOrder, markCounterOrderPaid } from "./counter-order.js";
import { consolidateBillForTable } from "./cover-charge.js";
import {
  enrichBillLinesForReport,
  recordDayTransaction,
  resolveServiceType,
} from "./day-report-ledger.js";
import {
  persistFiscalDocument,
  serviceTypeLabel,
} from "./fiscal-document-archive.js";
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
import { issueElectronicInvoice } from "./invoice.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

async function writeReceiptFiles(
  receipt: MockReceipt,
  meta?: {
    tableLabel?: string;
    guests?: number;
    operatorName?: string;
    amountReceived?: number;
    paymentSplits?: PaymentSplit[];
  },
) {
  await mkdir(PRINT_DIR, { recursive: true });
  const stamp = Date.now();
  const jsonPath = join(PRINT_DIR, `${stamp}-receipt-${receipt.id}.json`);
  const txtPath = join(PRINT_DIR, `${stamp}-receipt-${receipt.id}.txt`);
  await writeFile(jsonPath, JSON.stringify(receipt, null, 2));
  await writeFile(txtPath, formatMockReceiptText(receipt, meta));
  return { jsonPath, txtPath };
}

export interface ExecutePaymentParams {
  edgeDb: EdgeDatabase;
  tableId: string;
  locationId: string;
  paymentMethod?: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  amountReceived?: number;
  splitMode?: "FULL" | "ROMAN" | "ANALYTIC";
  checkId?: string;
  paymentRequestId?: string;
  shiftId?: string;
  documentType?: FiscalDocumentType;
  invoiceCustomer?: InvoiceCustomer;
  fullMealReceipt?: boolean;
  guests?: number;
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
  invoice?: {
    id: string;
    invoiceNumber: string;
    jsonPath: string;
    xmlPath: string;
    syncQueued: boolean;
  };
}

function primaryPaymentMethod(splits: PaymentSplit[]): PaymentMethod {
  if (splits.some((s) => s.paymentMethod === "MEAL_VOUCHER")) return "MEAL_VOUCHER";
  if (splits.length === 1) return splits[0]!.paymentMethod;
  return splits[0]!.paymentMethod;
}

function normalizePaymentSplits(
  payAmount: number,
  params: Pick<ExecutePaymentParams, "paymentMethod" | "paymentSplits" | "amountReceived">,
): { ok: true; splits: PaymentSplit[]; primary: PaymentMethod } | { ok: false; error: string } {
  if (params.paymentSplits?.length) {
    const total = Math.round(params.paymentSplits.reduce((s, p) => s + p.amount, 0) * 100) / 100;
    if (Math.abs(total - payAmount) > 0.01) {
      return { ok: false, error: "La somma dei pagamenti non coincide con il totale" };
    }
    for (const split of params.paymentSplits) {
      if (split.paymentMethod === "CASH") {
        if (split.amountReceived == null) {
          return { ok: false, error: "Importo contanti obbligatorio per la quota in contanti" };
        }
        if (split.amountReceived < split.amount) {
          return { ok: false, error: "Importo contanti insufficiente" };
        }
      }
    }
    return {
      ok: true,
      splits: params.paymentSplits,
      primary: primaryPaymentMethod(params.paymentSplits),
    };
  }
  if (!params.paymentMethod) {
    return { ok: false, error: "Metodo di pagamento richiesto" };
  }
  return {
    ok: true,
    splits: [
      {
        paymentMethod: params.paymentMethod,
        amount: payAmount,
        amountReceived:
          params.paymentMethod === "CASH" ? params.amountReceived : undefined,
      },
    ],
    primary: params.paymentMethod,
  };
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

  const docType = params.documentType ?? "RECEIPT";

  if (params.fullMealReceipt && docType !== "INVOICE") {
    return {
      ok: false,
      error: "Pasto completo disponibile solo in fattura",
      status: 400,
    };
  }
  if (params.fullMealReceipt && (isRoman || isAnalytic)) {
    return {
      ok: false,
      error: "Pasto completo disponibile solo su pagamento intero del tavolo",
      status: 400,
    };
  }
  if (params.paymentSplits?.length && (isRoman || isAnalytic)) {
    return {
      ok: false,
      error: "Pagamento misto non disponibile con split conto",
      status: 400,
    };
  }


  let payAmount = bill.total;
  let receiptLines: ReturnType<typeof billToReceiptLines>;

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
    payAmount = roundToFiveCents(checkLines.reduce((s, l) => s + l.lineTotal, 0));
    receiptLines = billToReceiptLines(bill, payAmount, checkLines);
  } else if (analytic && !isAnalytic) {
    return {
      ok: false,
      error: "Split analitico attivo — paga i singoli conti",
      status: 400,
    };
  } else {
    payAmount = roundToFiveCents(payAmount);
    const useFullMeal = params.fullMealReceipt && docType === "INVOICE";
    receiptLines = billToReceiptLines(
      bill,
      payAmount,
      undefined,
      useFullMeal ? { fullMeal: true, fullMealLabel: FULL_MEAL_RECEIPT_LABEL } : undefined,
    );
  }

  if (docType === "INVOICE" && !params.invoiceCustomer) {
    return { ok: false, error: "Dati cliente obbligatori per fattura", status: 400 };
  }

  const normalized = normalizePaymentSplits(payAmount, params);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error, status: 400 };
  }
  const paymentSplits = normalized.splits;
  const paymentMethod = normalized.primary;
  const cashSplit = paymentSplits.find((s) => s.paymentMethod === "CASH");

  const receiptResult = await hardware.emitReceipt({
    locationId: params.locationId,
    tableId: params.tableId,
    paymentMethod,
    documentType: params.documentType ?? "RECEIPT",
    lines: receiptLines,
    amountReceived: cashSplit?.amountReceived,
    paymentSplits,
  });

  if (!receiptResult.success || !receiptResult.receipt) {
    return { ok: false, error: receiptResult.error ?? "Errore emissione scontrino", status: 500 };
  }

  if (cashSplit) {
    await hardware.openCashDrawer();
  }

  const { jsonPath: receiptPath, txtPath: receiptTxtPath } = await writeReceiptFiles(
    receiptResult.receipt,
    {
      tableLabel: params.tableLabel,
      guests: params.guests,
      operatorName: params.operatorName,
      amountReceived: cashSplit?.amountReceived,
      paymentSplits,
    },
  );

  for (const split of paymentSplits) {
    if (params.shiftId) {
      recordShiftPayment(params.shiftId, split.paymentMethod, split.amount, receiptResult.receipt.id);
    } else {
      recordDayPayment(split.paymentMethod, split.amount, receiptResult.receipt.id);
    }
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

  const serviceType = resolveServiceType({
    channel,
    tableLabel: params.tableLabel,
    isVirtual: params.isVirtual,
    virtualType: params.virtualType,
    lines: saleLines,
  });

  const counterOrder = getCounterOrder(params.tableId);
  const deliveryBroker = counterOrder?.broker;

  recordDayTransaction(params.edgeDb, closureDate, {
    receiptId: receiptResult.receipt.id,
    at: receiptResult.receipt.issuedAt,
    tableLabel: params.tableLabel,
    tableId: params.tableId,
    serviceType,
    paymentMethod,
    paymentSplits: paymentSplits.length > 1 ? paymentSplits : undefined,
    documentType: params.documentType ?? receiptResult.receipt.documentType ?? "RECEIPT",
    operatorId: params.operatorId,
    operatorName: params.operatorName,
    amount: payAmount,
    lines: saleLines,
    coverGuests: bill.coverCharge?.guestCount ?? 0,
    deliveryBroker,
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
    if (getCounterOrder(params.tableId)) {
      markCounterOrderPaid(params.tableId);
    }
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

  let invoiceInfo: ExecutePaymentResult["invoice"];
  if (docType === "INVOICE" && params.invoiceCustomer) {
    const issued = await issueElectronicInvoice({
      edgeDb: params.edgeDb,
      locationId: params.locationId,
      receiptId: receiptResult.receipt.id,
      tableId: params.tableId,
      tableLabel: params.tableLabel,
      customer: params.invoiceCustomer,
      lines: receiptLines,
      paymentMethod,
      operatorId: params.operatorId,
      operatorName: params.operatorName,
    });
    invoiceInfo = {
      id: issued.invoice.id,
      invoiceNumber: issued.invoice.invoiceNumber,
      jsonPath: issued.jsonPath,
      xmlPath: issued.xmlPath,
      syncQueued: true,
    };
  }

  persistFiscalDocument(params.edgeDb, {
    receipt: receiptResult.receipt,
    meta: {
      tableLabel: params.tableLabel,
      guests: params.guests,
      operatorName: params.operatorName,
      amountReceived: cashSplit?.amountReceived,
      paymentSplits: paymentSplits.length > 1 ? paymentSplits : undefined,
      serviceTypeLabel: serviceTypeLabel(serviceType),
      orderLines: receiptLines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate,
      })),
      invoiceCustomer: params.invoiceCustomer,
    },
    operatorStaffId: params.operatorId,
    operatorName: params.operatorName,
    shiftId: params.shiftId,
    serviceType,
    fileJsonPath: receiptPath,
    fileTxtPath: receiptTxtPath,
    tableLabel: params.tableLabel,
    customerBusinessName: params.invoiceCustomer?.businessName,
    invoiceId: invoiceInfo?.id,
    invoiceNumber: invoiceInfo?.invoiceNumber,
  });

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
    invoice: invoiceInfo,
  };
}
