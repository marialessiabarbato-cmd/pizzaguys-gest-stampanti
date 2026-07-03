import type { FiscalDocumentType, PaymentMethod } from "@pizzaguys/types";
import type { PaymentSplit } from "@pizzaguys/types";

export interface MockReceiptLine {
  name: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

export interface MockReceipt {
  id: string;
  issuedAt: string;
  locationId: string;
  tableId?: string;
  paymentMethod: PaymentMethod;
  documentType: FiscalDocumentType;
  lines: MockReceiptLine[];
  total: number;
  change?: number;
  paymentSplits?: PaymentSplit[];
  /** Dicitura RT (es. FATTURA ALLEGATA per corrispettivi azzerati) */
  fiscalNote?: string;
  mock: true;
}

export function createMockReceipt(params: {
  locationId: string;
  tableId?: string;
  paymentMethod: PaymentMethod;
  documentType?: FiscalDocumentType;
  lines: MockReceiptLine[];
  amountReceived?: number;
  paymentSplits?: PaymentSplit[];
}): MockReceipt {
  const total = params.lines.reduce(
    (sum, l) => sum + l.quantity * l.unitPrice,
    0,
  );
  const rounded = Math.round(total * 100) / 100;
  const cashSplit = params.paymentSplits?.find((s) => s.paymentMethod === "CASH");
  const amountReceived = cashSplit?.amountReceived ?? params.amountReceived;
  const change =
    amountReceived != null
      ? Math.round((amountReceived - (cashSplit?.amount ?? rounded)) * 100) / 100
      : undefined;

  const documentType = params.documentType ?? "RECEIPT";

  return {
    id: `MOCK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    issuedAt: new Date().toISOString(),
    locationId: params.locationId,
    tableId: params.tableId,
    paymentMethod: params.paymentMethod,
    documentType,
    lines: params.lines,
    total: rounded,
    change: change != null && change > 0 ? change : undefined,
    paymentSplits: params.paymentSplits,
    fiscalNote: documentType === "INVOICE" ? "FATTURA ALLEGATA" : undefined,
    mock: true,
  };
}
