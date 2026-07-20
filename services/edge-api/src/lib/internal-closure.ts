import { randomUUID } from "node:crypto";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { internalClosureArchive } from "@pizzaguys/edge-db";
import { desc, eq } from "drizzle-orm";
import { listCounterOrders } from "./counter-order.js";
import { getDayTheoretical, getDayTransactions } from "./day-report-ledger.js";

export interface BrokerClosureLine {
  broker: string;
  cashAmount: number;
  cardAmount: number;
}

export interface InternalClosureExpense {
  description: string;
  amount: number;
}

export interface InternalClosureExtraLine {
  label: string;
  amount: number;
}

export interface InternalClosurePayload {
  closureDate: string;
  closureTotal: number;
  cashWithdrawal: number;
  posTotal: number;
  brokers: BrokerClosureLine[];
  expenses: InternalClosureExpense[];
  cashFund: number;
  extraLines: InternalClosureExtraLine[];
  notes?: string;
}

export interface InternalClosureRecord extends InternalClosurePayload {
  id: string;
  operatorStaffId?: string;
  operatorName: string;
  emailedAt?: string;
  createdAt: string;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/** Pre-compila voci da incassi giornata e ordini delivery con broker. */
export function buildInternalClosureDraft(
  edgeDb: EdgeDatabase,
  closureDate = todayKey(),
): InternalClosurePayload {
  const theoretical = getDayTheoretical(edgeDb, closureDate);
  const transactions = getDayTransactions(edgeDb, closureDate);
  const closureTotal = round2(theoretical.total);
  const posTotal = round2(theoretical.pos);

  const brokerMap = new Map<string, { cash: number; card: number }>();

  for (const tx of transactions) {
    let broker = tx.deliveryBroker;
    if (!broker) {
      const counter = listCounterOrders({ activeOnly: false }).find((o) =>
        tx.tableLabel.includes(o.displayNumber.replace("#", "")),
      );
      broker = counter?.broker;
    }
    if (!broker && tx.serviceType === "DELIVERY") broker = "Delivery";
    if (!broker) continue;

    const entry = brokerMap.get(broker) ?? { cash: 0, card: 0 };
    const splits = tx.paymentSplits?.length
      ? tx.paymentSplits
      : [{ paymentMethod: tx.paymentMethod, amount: tx.amount }];
    for (const s of splits) {
      if (s.paymentMethod === "CASH") entry.cash += s.amount;
      else if (s.paymentMethod === "POS") entry.card += s.amount;
    }
    brokerMap.set(broker, entry);
  }

  const brokers: BrokerClosureLine[] = [...brokerMap.entries()].map(([broker, v]) => ({
    broker,
    cashAmount: round2(v.cash),
    cardAmount: round2(v.card),
  }));

  return {
    closureDate,
    closureTotal,
    cashWithdrawal: 0,
    posTotal,
    brokers,
    expenses: [],
    cashFund: 0,
    extraLines: [],
  };
}

export function persistInternalClosure(
  edgeDb: EdgeDatabase,
  payload: InternalClosurePayload,
  operator: { staffId?: string; name: string },
): InternalClosureRecord {
  const id = randomUUID();
  const now = new Date().toISOString();
  const record: InternalClosureRecord = {
    id,
    ...payload,
    operatorStaffId: operator.staffId,
    operatorName: operator.name,
    createdAt: now,
  };
  edgeDb
    .insert(internalClosureArchive)
    .values({
      id,
      closureDate: payload.closureDate,
      payloadJson: JSON.stringify(record),
      operatorStaffId: operator.staffId ?? null,
      operatorName: operator.name,
      createdAt: now,
    })
    .run();
  return record;
}

export function listInternalClosures(
  edgeDb: EdgeDatabase,
  from?: string,
  to?: string,
): InternalClosureRecord[] {
  const rows = edgeDb
    .select()
    .from(internalClosureArchive)
    .orderBy(desc(internalClosureArchive.createdAt))
    .all();
  return rows
    .map((r) => JSON.parse(r.payloadJson) as InternalClosureRecord)
    .filter((r) => {
      if (from && r.closureDate < from) return false;
      if (to && r.closureDate > to) return false;
      return true;
    });
}

export function getInternalClosure(
  edgeDb: EdgeDatabase,
  id: string,
): InternalClosureRecord | null {
  const row = edgeDb
    .select()
    .from(internalClosureArchive)
    .where(eq(internalClosureArchive.id, id))
    .get();
  if (!row) return null;
  return JSON.parse(row.payloadJson) as InternalClosureRecord;
}

export function formatInternalClosureText(record: InternalClosureRecord): string {
  const lines: string[] = [
    record.closureDate,
    `CHIUSURA TOT € ${record.closureTotal.toFixed(2)}`,
    `PRELIEVO CONT € ${record.cashWithdrawal.toFixed(2)}`,
    `POS € ${record.posTotal.toFixed(2)}`,
  ];
  for (const b of record.brokers) {
    const parts: string[] = [];
    if (b.cashAmount > 0) parts.push(`€ ${b.cashAmount.toFixed(2)} (CONT)`);
    if (b.cardAmount > 0) parts.push(`€ ${b.cardAmount.toFixed(2)} (CARTA)`);
    lines.push(`${b.broker.toUpperCase()} ${parts.join(" ; ")}`);
  }
  for (const e of record.expenses) {
    lines.push(`SPESE € ${e.amount.toFixed(2)} (${e.description})`);
  }
  for (const x of record.extraLines) {
    lines.push(`${x.label} € ${x.amount.toFixed(2)}`);
  }
  lines.push(`FONDO CASSA € ${record.cashFund.toFixed(2)}`);
  if (record.notes?.trim()) lines.push(`Note: ${record.notes.trim()}`);
  return lines.join("\n");
}
