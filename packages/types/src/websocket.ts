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
  | "TABLE_ACCOUNT_MOVED";

export interface WsEnvelope<T extends WsMessageType = WsMessageType, P = unknown> {
  type: T;
  payload: P;
  timestamp: string;
  messageId: string;
}

export interface HandshakePayload {
  deviceId: string;
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
