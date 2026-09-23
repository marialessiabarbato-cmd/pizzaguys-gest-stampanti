import type { MockReceipt } from "@pizzaguys/fiscal";
import type { FiscalDocumentType, PaymentMethod } from "@pizzaguys/types";

export interface PrintResult {
  success: boolean;
  printerId: string;
  filePath?: string;
  error?: string;
}

export interface ReceiptLineInput {
  name: string;
  quantity: number;
  unitPrice: number;
  vatRate: number;
}

export interface FiscalOrderInput {
  locationId: string;
  tableId?: string;
  paymentMethod: PaymentMethod;
  documentType?: FiscalDocumentType;
  lines: ReceiptLineInput[];
  amountReceived?: number;
  paymentSplits?: import("@pizzaguys/types").PaymentSplit[];
}

export interface ReceiptResult {
  success: boolean;
  receipt?: MockReceipt;
  error?: string;
}

export interface ZReportResult {
  success: boolean;
  zNumber?: number;
  error?: string;
}

/** Destinazione di rete di una stampante ESC/POS (TCP raw, porta 9100 standard) */
export interface PrintTarget {
  host: string;
  port: number;
}

export interface HardwareBridge {
  printEscPos(
    printerId: string,
    payload: Buffer,
    label?: string,
    target?: PrintTarget,
  ): Promise<PrintResult>;
  emitReceipt(order: FiscalOrderInput): Promise<ReceiptResult>;
  emitZReport(): Promise<ZReportResult>;
  openCashDrawer(): Promise<void>;
}

export interface HardwareBridgeConfig {
  printDir: string;
}
