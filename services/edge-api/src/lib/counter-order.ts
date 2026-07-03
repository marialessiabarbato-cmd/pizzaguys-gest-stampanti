import { randomUUID } from "node:crypto";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { tables } from "@pizzaguys/edge-db";
import { eq } from "drizzle-orm";
import { getTableRuntime, setTableOccupied, setTableFree } from "./runtime.js";

export interface CounterOrder {
  id: string;
  displayNumber: string;
  channel: "TAKEAWAY" | "DELIVERY";
  customerName?: string;
  phone?: string;
  address?: string;
  notes?: string;
  broker?: string;
  asap: boolean;
  scheduledAt?: string;
  createdAt: string;
  paidAt?: string;
}

export interface TableContext {
  id: string;
  label: string;
  isVirtual: boolean;
  virtualType: string | null;
  isCounterOrder: boolean;
  defaultGuests?: number;
}

const counterOrders = new Map<string, CounterOrder>();

let dailySeq = { date: "", takeaway: 0, delivery: 0 };

function nextDisplayNumber(channel: "TAKEAWAY" | "DELIVERY"): string {
  const today = new Date().toISOString().slice(0, 10);
  if (dailySeq.date !== today) {
    dailySeq = { date: today, takeaway: 0, delivery: 0 };
  }
  if (channel === "TAKEAWAY") {
    dailySeq.takeaway += 1;
    return `#ASP-${String(dailySeq.takeaway).padStart(3, "0")}`;
  }
  dailySeq.delivery += 1;
  return `#DEL-${String(dailySeq.delivery).padStart(3, "0")}`;
}

export function createCounterOrder(params: {
  channel: "TAKEAWAY" | "DELIVERY";
  customerName?: string;
  phone?: string;
  address?: string;
  notes?: string;
  broker?: string;
  asap: boolean;
  scheduledAt?: string;
}): CounterOrder {
  const id = randomUUID();
  const order: CounterOrder = {
    id,
    displayNumber: nextDisplayNumber(params.channel),
    channel: params.channel,
    customerName: params.customerName?.trim() || undefined,
    phone: params.phone?.trim() || undefined,
    address: params.address?.trim() || undefined,
    notes: params.notes?.trim() || undefined,
    broker: params.broker?.trim() || undefined,
    asap: params.asap,
    scheduledAt: params.asap ? undefined : params.scheduledAt,
    createdAt: new Date().toISOString(),
  };
  counterOrders.set(id, order);
  setTableOccupied(id);
  return order;
}

export function getCounterOrder(id: string): CounterOrder | undefined {
  return counterOrders.get(id);
}

export function listCounterOrders(filter?: {
  channel?: "TAKEAWAY" | "DELIVERY";
  activeOnly?: boolean;
}): CounterOrder[] {
  const activeOnly = filter?.activeOnly ?? true;
  return [...counterOrders.values()]
    .filter((o) => {
      if (filter?.channel && o.channel !== filter.channel) return false;
      if (activeOnly && o.paidAt) return false;
      if (activeOnly) {
        const status = getTableRuntime(o.id).status;
        return status !== "FREE";
      }
      return true;
    })
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function markCounterOrderPaid(id: string) {
  const order = counterOrders.get(id);
  if (!order) return;
  counterOrders.set(id, { ...order, paidAt: new Date().toISOString() });
}

export function removeCounterOrder(id: string) {
  counterOrders.delete(id);
  setTableFree(id);
}

export function resolveTableContext(
  tableId: string,
  edgeDb: EdgeDatabase,
): TableContext | null {
  const counter = getCounterOrder(tableId);
  if (counter) {
    return {
      id: tableId,
      label: counter.displayNumber,
      isVirtual: true,
      virtualType: counter.channel === "TAKEAWAY" ? "ASPORTO" : "DELIVERY",
      isCounterOrder: true,
      defaultGuests: 1,
    };
  }

  const table = edgeDb.select().from(tables).where(eq(tables.id, tableId)).get();
  if (!table) return null;

  return {
    id: table.id,
    label: table.label,
    isVirtual: table.isVirtual,
    virtualType: table.virtualType,
    isCounterOrder: false,
    defaultGuests: table.defaultGuests,
  };
}

export function formatScheduledTime(order: CounterOrder): string {
  if (order.asap) return "Il prima possibile";
  if (!order.scheduledAt) return "—";
  const d = new Date(order.scheduledAt);
  return d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
}
