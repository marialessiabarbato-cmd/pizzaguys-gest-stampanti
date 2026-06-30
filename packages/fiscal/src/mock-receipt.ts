import type { FiscalDocumentType, PaymentMethod } from "@pizzaguys/types";

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
  mock: true;
}

export function createMockReceipt(params: {
  locationId: string;
  tableId?: string;
  paymentMethod: PaymentMethod;
  documentType?: FiscalDocumentType;
  lines: MockReceiptLine[];
  amountReceived?: number;
}): MockReceipt {
  const total = params.lines.reduce(
    (sum, l) => sum + l.quantity * l.unitPrice,
    0,
  );
  const rounded = Math.round(total * 100) / 100;
  const change =
    params.paymentMethod === "CASH" && params.amountReceived != null
      ? Math.round((params.amountReceived - rounded) * 100) / 100
      : undefined;

  return {
    id: `MOCK-${crypto.randomUUID().slice(0, 8).toUpperCase()}`,
    issuedAt: new Date().toISOString(),
    locationId: params.locationId,
    tableId: params.tableId,
    paymentMethod: params.paymentMethod,
    documentType: params.documentType ?? "RECEIPT",
    lines: params.lines,
    total: rounded,
    change,
    mock: true,
  };
}
