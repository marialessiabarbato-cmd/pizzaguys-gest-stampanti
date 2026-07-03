import type { PaymentMethod } from "./domain.js";

export interface DailyReportSnapshot {
  header: {
    locationName: string;
    closureDate: string;
    printedAt: string;
    printedBy: string;
    zNumber?: number;
  };
  totals: {
    dailyTotal: number;
    collected: number;
    uncollected: number;
  };
  coverCharge: { quantity: number; average: number; total: number };
  serviceTypes: Array<{ label: string; quantity: number; total: number; average: number }>;
  adjustments: {
    discounts: number;
    promotions: number;
    supplements: number;
    voided: number;
    corrections: number;
    openTables: number;
  };
  payments: Array<{ label: string; quantity: number; total: number }>;
  operators: Array<{ name: string; cash: number; pos: number; card: number; total: number }>;
  collected: {
    cash: number;
    prepaidCash: number;
    pos: number;
    prepaidPos: number;
    mealVoucher: number;
    other: number;
    total: number;
  };
  vat: Array<{ label: string; rate: number; net: number; tax: number; gross: number }>;
  vatReceipts: Array<{ label: string; rate: number; net: number; tax: number; gross: number }>;
  vatInvoices: Array<{ label: string; rate: number; net: number; tax: number; gross: number }>;
  salesGroups: Array<{ name: string; quantity: number; total: number }>;
  productionCenters: Array<{ name: string; quantity: number; total: number }>;
  openTables: Array<{ room: string; table: string; amount: number }>;
  fiscalDocuments: {
    receipts: { count: number; total: number; paid: number; unpaid: number };
    invoices: { count: number; total: number; paid: number; unpaid: number };
    training: { count: number; total: number; paid: number; unpaid: number };
  };
  stornos: Array<{
    at: string;
    tableLabel: string;
    itemName: string;
    quantity: number;
    amount: number;
    operatorName: string;
  }>;
  discountDetails?: Array<{ label: string; quantity: number; total: number }>;
  transactionCount: number;
}

export interface DailyReportReceiptPayload {
  type: "daily_report";
  snapshot: DailyReportSnapshot;
  paths?: { txt?: string; html?: string; json?: string };
}

export function extractDailyReportFromReceipts(
  receipts: unknown[] | null | undefined,
): DailyReportSnapshot | null {
  if (!receipts?.length) return null;
  for (const entry of receipts) {
    if (
      entry &&
      typeof entry === "object" &&
      "type" in entry &&
      (entry as DailyReportReceiptPayload).type === "daily_report" &&
      "snapshot" in entry
    ) {
      return (entry as DailyReportReceiptPayload).snapshot;
    }
  }
  return null;
}

export type { PaymentMethod };
