import type { PaymentMethod } from "@pizzaguys/types";

export interface ShiftPayment {
  paymentMethod: PaymentMethod;
  amount: number;
  at: string;
  receiptId?: string;
}

const ledger = new Map<string, ShiftPayment[]>();
const dayLedger = new Map<string, ShiftPayment[]>();

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function appendPayment(
  map: Map<string, ShiftPayment[]>,
  key: string,
  paymentMethod: PaymentMethod,
  amount: number,
  receiptId?: string,
) {
  const entries = map.get(key) ?? [];
  entries.push({
    paymentMethod,
    amount,
    at: new Date().toISOString(),
    receiptId,
  });
  map.set(key, entries);
}

export function recordShiftPayment(
  shiftId: string,
  paymentMethod: PaymentMethod,
  amount: number,
  receiptId?: string,
) {
  appendPayment(ledger, shiftId, paymentMethod, amount, receiptId);
  appendPayment(dayLedger, todayKey(), paymentMethod, amount, receiptId);
}

export function recordDayPayment(
  paymentMethod: PaymentMethod,
  amount: number,
  receiptId?: string,
  date = todayKey(),
) {
  appendPayment(dayLedger, date, paymentMethod, amount, receiptId);
}

export function getShiftPayments(shiftId: string): ShiftPayment[] {
  return ledger.get(shiftId) ?? [];
}

export function getShiftTheoretical(shiftId: string) {
  const entries = getShiftPayments(shiftId);
  const byPaymentMethod: Record<string, number> = {};
  for (const e of entries) {
    byPaymentMethod[e.paymentMethod] = (byPaymentMethod[e.paymentMethod] ?? 0) + e.amount;
  }
  const cash = byPaymentMethod.CASH ?? 0;
  const pos = byPaymentMethod.POS ?? 0;
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  return { byPaymentMethod, cash, pos, total, transactionCount: entries.length };
}

export function clearShiftLedger(shiftId: string) {
  ledger.delete(shiftId);
}

export function getDayTheoretical(date = todayKey()) {
  const entries = dayLedger.get(date) ?? [];
  const byPaymentMethod: Record<string, number> = {};
  for (const e of entries) {
    byPaymentMethod[e.paymentMethod] = (byPaymentMethod[e.paymentMethod] ?? 0) + e.amount;
  }
  const cash = byPaymentMethod.CASH ?? 0;
  const pos = byPaymentMethod.POS ?? 0;
  const total = entries.reduce((sum, e) => sum + e.amount, 0);
  return { byPaymentMethod, cash, pos, total, transactionCount: entries.length, date };
}

export function clearDayLedger(date = todayKey()) {
  dayLedger.delete(date);
}
