import type { PaymentMethod, TableStatus } from "./domain.js";

/** Tipi messaggio WebSocket Edge ↔ Client */
export type WsMessageType =
  | "HANDSHAKE"
  | "HANDSHAKE_ACK"
  | "PING"
  | "PONG"
  | "REQUEST_TABLE_LOCK"
  | "LOCK_GRANTED"
  | "LOCK_DENIED"
  | "RELEASE_TABLE_LOCK"
  | "TABLE_LOCKED_BROADCAST"
  | "TABLE_STATUS_UPDATE"
  | "ORDER_SUBMIT"
  | "ORDER_ACK"
  | "TRIGGER_FISCAL_RECEIPT"
  | "RECEIPT_SUCCESS"
  | "RECEIPT_ERROR"
  | "FORCE_LOGOUT"
  | "REQUEST_STORNO_AUTHORIZATION"
  | "STORNO_AUTHORIZED"
  | "SYNC_DELTA"
  | "KDS_ORDER_UPDATE"
  | "CALL_COURSE"
  | "REQUEST_PAYMENT"
  | "PAYMENT_PENDING"
  | "CONFIRM_PAYMENT"
  | "PAYMENT_COMPLETE"
  | "PAYMENT_REJECTED"
  | "TABLE_ACCOUNT_MOVED"
  | "PRINT_FAILED"
  /** Avviso solo per la cassa: ticket dirottato o stampato in ritardo (R3) */
  | "PRINT_NOTICE"
  /** Stato delle stampanti cambiato (carta, coperchio, raggiungibilità) */
  | "PRINTER_STATUS"
  | "CASH_SESSION_STATUS"
  /** Errore nella gestione di un messaggio, con testo da mostrare */
  | "ERROR";

export interface WsEnvelope<T extends WsMessageType = WsMessageType, P = unknown> {
  type: T;
  payload: P;
  timestamp: string;
  messageId: string;
}

export interface HandshakePayload {
  deviceId: string;
  /** handheld | cassa | kds */
  deviceKind?: string;
  operatorId?: string;
  sessionToken?: string;
  clientVersion: string;
}

export interface HandshakeAckPayload {
  edgeId: string;
  locationId: string;
  schemaVersion: number;
  serverTime: string;
}

export interface RequestTableLockPayload {
  tableId: string;
  operatorId: string;
  operatorName: string;
}

export interface TableLockBroadcastPayload {
  tableId: string;
  operatorId: string;
  operatorName: string;
  status: TableStatus;
}

export interface TriggerFiscalReceiptPayload {
  tableId: string;
  paymentMethod: PaymentMethod;
  amountReceived?: number;
  lineItemIds?: string[];
  splitMode?: "FULL" | "ROMAN" | "ANALYTIC";
}

export interface ReceiptResultPayload {
  tableId: string;
  receiptId: string;
  success: boolean;
  errorCode?: string;
  errorMessage?: string;
}

export interface RequestPaymentPayload {
  tableId: string;
  operatorId: string;
  operatorName: string;
}

export interface PaymentPendingPayload {
  requestId: string;
  tableId: string;
  tableLabel: string;
  total: number;
  operatorId: string;
  operatorName: string;
  requestedAt: string;
}

export interface ConfirmPaymentPayload {
  requestId: string;
  paymentMethod: PaymentMethod;
  amountReceived?: number;
  operatorId: string;
  operatorName: string;
}

export interface PaymentCompletePayload {
  requestId?: string;
  tableId: string;
  receiptId: string;
  change?: number;
  romanSplitComplete?: boolean;
  paidShares?: number;
  totalShares?: number;
}

export interface TableAccountMovedPayload {
  sourceTableIds: string[];
  targetTableId: string;
  operatorId: string;
  movedLineIds: string[];
}

/** Tipo di stampa non riuscita (comanda, marcia, annullo, ...). */
export type PrintJobKind =
  | "COMANDA"
  | "MARCIA"
  | "DOLCI"
  | "ANNULLO"
  | "PRECONTO"
  | "COPIA_SCONTRINO"
  | "CHIUSURA_CASSA"
  | "COPIA_CASSA"
  | "PRENOTAZIONI"
  | "TEST";

/** Broadcast quando una stampa ESC/POS fallisce (stampante spenta, irraggiungibile, ...). */
export interface PrintFailedPayload {
  kind: PrintJobKind;
  tableLabel: string;
  /** Una riga leggibile per stampante non riuscita. */
  messages: string[];
}

/**
 * Avviso per la cassa dalla coda di stampa:
 * - REROUTED: stampato sulla stampante di riserva ("Comanda tavolo 5 stampata su BAR al posto di CUCINA (carta finita)")
 * - RECOVERED: un ticket in attesa è stato stampato dopo nuovi tentativi
 * - GAVE_UP: un ticket non è stato stampato dopo tutti i tentativi
 */
export interface PrintNoticePayload {
  level: "warning" | "info" | "error";
  event: "REROUTED" | "RECOVERED" | "GAVE_UP";
  jobId: string;
  kind: PrintJobKind;
  tableLabel: string;
  message: string;
}

export type PrinterConditionCode =
  | "OK"
  | "PAPER_NEAR_END"
  | "PAPER_OUT"
  | "COVER_OPEN"
  | "ERROR"
  | "UNREACHABLE"
  | "UNKNOWN";

export interface PrinterHealth {
  printerId: string;
  name: string;
  workCenter: string;
  host: string;
  port: number;
  condition: PrinterConditionCode;
  message: string;
  /** La stampante risponde ai comandi di stato (Epson e compatibili). */
  supported: boolean;
  checkedAt: string;
  /** Ticket di questa stampante in attesa di nuovo tentativo. */
  pendingJobs: number;
}

export interface PrinterStatusPayload {
  printers: PrinterHealth[];
}
