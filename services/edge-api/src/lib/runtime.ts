import { randomUUID } from "node:crypto";
import type { TableStatus } from "@pizzaguys/types";

export interface OrderLineVariant {
  variantId: string;
  name: string;
  type: "ADD" | "REMOVE";
  priceDelta: number;
}

export interface OrderLine {
  id: string;
  productId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  basePrice?: number;
  channel: "TABLE" | "TAKEAWAY" | "DELIVERY";
  notes?: string;
  variants?: OrderLineVariant[];
  course?: number;
  hold?: boolean;
  dessertDefer?: boolean;
  discountPercent?: number;
  discountToken?: string;
  voidedQuantity?: number;
}

export interface TableOrder {
  id: string;
  tableId: string;
  operatorId: string;
  operatorName: string;
  channel: "TABLE" | "TAKEAWAY" | "DELIVERY";
  lines: OrderLine[];
  createdAt: string;
  updatedAt: string;
  submittedAt?: string;
}

export interface KdsTicketLine {
  lineId: string;
  name: string;
  quantity: number;
  variants?: string[];
}

export interface KdsTicket {
  id: string;
  orderId: string;
  tableId: string;
  tableLabel: string;
  course: number;
  lines: KdsTicketLine[];
  submittedAt: string;
  hold: boolean;
  dessertQueue: boolean;
  calledAt?: string;
  courseCalledAt?: string;
}

export interface KdsCancellation {
  id: string;
  tableLabel: string;
  course: number;
  itemName: string;
  quantity: number;
  cancelledAt: string;
}

export interface TableRuntime {
  tableId: string;
  status: TableStatus;
  lockedBy?: string;
  lockedByName?: string;
  lockedAt?: string;
  guests?: number;
  /** Coperti massimi addebitati (non diminuisce se si riducono i coperti) */
  chargedGuests?: number;
}

export interface RomanSplit {
  tableId: string;
  shares: number;
  shareAmounts: number[];
  paidShares: number;
  startedAt: string;
}

export interface PaymentRequest {
  id: string;
  tableId: string;
  tableLabel: string;
  operatorId: string;
  operatorName: string;
  total: number;
  requestedAt: string;
  status: "PENDING" | "COMPLETED" | "REJECTED";
}

export interface AnalyticCheck {
  id: string;
  label: string;
  lineIds: string[];
  paid: boolean;
}

export interface AnalyticSplit {
  tableId: string;
  checks: AnalyticCheck[];
  startedAt: string;
}

const tableRuntime = new Map<string, TableRuntime>();
const orders = new Map<string, TableOrder>();
const kdsTickets = new Map<string, KdsTicket>();
const kdsCancellations: KdsCancellation[] = [];
const MAX_KDS_CANCELLATIONS = 30;
const discountTokens = new Map<string, { percent: number; used: boolean; createdAt: string }>();
const romanSplits = new Map<string, RomanSplit>();
const analyticSplits = new Map<string, AnalyticSplit>();
const paymentRequests = new Map<string, PaymentRequest>();

let lockTimeoutMinutes = 15;

export function setLockTimeoutMinutes(minutes: number) {
  lockTimeoutMinutes = minutes;
}

export function getLockTimeoutMinutes() {
  return lockTimeoutMinutes;
}

export function getTableRuntime(tableId: string): TableRuntime {
  return tableRuntime.get(tableId) ?? { tableId, status: "FREE" };
}

export function getAllTableRuntime(): TableRuntime[] {
  return [...tableRuntime.values()];
}

export function requestLock(
  tableId: string,
  operatorId: string,
  operatorName: string,
  force = false,
  guests?: number,
): { granted: boolean; reason?: string } {
  const current = getTableRuntime(tableId);
  if (!force && current.status === "LOCKED" && current.lockedBy !== operatorId) {
    if (current.lockedAt) {
      const elapsed = Date.now() - new Date(current.lockedAt).getTime();
      if (elapsed < lockTimeoutMinutes * 60_000) {
        return { granted: false, reason: `Tavolo bloccato da ${current.lockedByName}` };
      }
    } else {
      return { granted: false, reason: "Tavolo già bloccato" };
    }
  }
  const nextGuests = guests ?? current.guests;
  const chargedGuests = Math.max(
    current.chargedGuests ?? 0,
    nextGuests ?? current.chargedGuests ?? 0,
  );
  tableRuntime.set(tableId, {
    tableId,
    status: "LOCKED",
    lockedBy: operatorId,
    lockedByName: operatorName,
    lockedAt: new Date().toISOString(),
    guests: nextGuests,
    chargedGuests: chargedGuests > 0 ? chargedGuests : undefined,
  });
  return { granted: true };
}

export function getChargedGuests(tableId: string): number | undefined {
  const runtime = getTableRuntime(tableId);
  return runtime.chargedGuests ?? runtime.guests;
}

export function bumpChargedGuests(tableId: string, guests: number) {
  const current = getTableRuntime(tableId);
  const chargedGuests = Math.max(current.chargedGuests ?? 0, guests);
  if (chargedGuests <= 0) return;
  tableRuntime.set(tableId, { ...current, chargedGuests });
}

export function forceUnlock(tableId: string) {
  tableRuntime.set(tableId, { tableId, status: "FREE" });
}

export function releaseLock(tableId: string, operatorId: string): boolean {
  const current = getTableRuntime(tableId);
  if (current.lockedBy && current.lockedBy !== operatorId) return false;
  const hasSubmitted = getSubmittedOrdersByTable(tableId).length > 0;
  if (hasSubmitted) {
    tableRuntime.set(tableId, {
      ...current,
      tableId,
      status: "OCCUPIED",
      lockedBy: undefined,
      lockedByName: undefined,
      lockedAt: undefined,
    });
  } else {
    tableRuntime.set(tableId, { tableId, status: "FREE" });
  }
  return true;
}

export function setTableOccupied(tableId: string) {
  const current = getTableRuntime(tableId);
  if (current.status === "BILL_REQUESTED" || current.status === "SPLIT_IN_PROGRESS") return;
  tableRuntime.set(tableId, {
    ...current,
    tableId,
    status: "OCCUPIED",
    lockedBy: undefined,
    lockedByName: undefined,
    lockedAt: undefined,
  });
}

export function setBillRequested(tableId: string) {
  const current = getTableRuntime(tableId);
  tableRuntime.set(tableId, {
    ...current,
    tableId,
    status: "BILL_REQUESTED",
    lockedBy: undefined,
    lockedByName: undefined,
    lockedAt: undefined,
  });
}

export function setTableFree(tableId: string) {
  tableRuntime.set(tableId, { tableId, status: "FREE" });
}

export function setSplitInProgress(tableId: string) {
  const current = getTableRuntime(tableId);
  tableRuntime.set(tableId, {
    ...current,
    tableId,
    status: "SPLIT_IN_PROGRESS",
    lockedBy: undefined,
    lockedByName: undefined,
    lockedAt: undefined,
  });
}

export function computeRomanShareAmounts(total: number, shares: number): number[] {
  const amounts: number[] = [];
  let remaining = Math.round(total * 100) / 100;
  const baseCents = Math.floor((total * 100) / shares);
  for (let i = 0; i < shares - 1; i++) {
    const share = baseCents / 100;
    amounts.push(share);
    remaining = Math.round((remaining - share) * 100) / 100;
  }
  amounts.push(remaining);
  return amounts;
}

export function startRomanSplit(tableId: string, shares: number, total: number): RomanSplit {
  const split: RomanSplit = {
    tableId,
    shares,
    shareAmounts: computeRomanShareAmounts(total, shares),
    paidShares: 0,
    startedAt: new Date().toISOString(),
  };
  romanSplits.set(tableId, split);
  setSplitInProgress(tableId);
  return split;
}

export function getRomanSplit(tableId: string): RomanSplit | undefined {
  return romanSplits.get(tableId);
}

export function recordRomanSharePaid(tableId: string): RomanSplit | undefined {
  const split = romanSplits.get(tableId);
  if (!split) return undefined;
  const updated = { ...split, paidShares: split.paidShares + 1 };
  romanSplits.set(tableId, updated);
  return updated;
}

export function clearRomanSplit(tableId: string) {
  romanSplits.delete(tableId);
}

export function getAnalyticSplit(tableId: string): AnalyticSplit | undefined {
  return analyticSplits.get(tableId);
}

export function startAnalyticSplit(tableId: string, checkCount: number): AnalyticSplit {
  const checks: AnalyticCheck[] = Array.from({ length: checkCount }, (_, i) => ({
    id: randomUUID(),
    label: `Conto ${i + 1}`,
    lineIds: [],
    paid: false,
  }));
  const split: AnalyticSplit = { tableId, checks, startedAt: new Date().toISOString() };
  analyticSplits.set(tableId, split);
  setSplitInProgress(tableId);
  return split;
}

export function updateAnalyticSplit(
  tableId: string,
  checks: Array<{ id: string; label: string; lineIds: string[] }>,
): { ok: true; split: AnalyticSplit } | { ok: false; error: string } {
  const existing = analyticSplits.get(tableId);
  if (!existing) return { ok: false, error: "Split analitico non attivo" };

  const paidById = new Map(existing.checks.map((c) => [c.id, c.paid]));
  const updated: AnalyticSplit = {
    ...existing,
    checks: checks.map((c) => ({
      id: c.id,
      label: c.label,
      lineIds: c.lineIds,
      paid: paidById.get(c.id) ?? false,
    })),
  };
  analyticSplits.set(tableId, updated);
  return { ok: true, split: updated };
}

export function markAnalyticCheckPaid(tableId: string, checkId: string): AnalyticSplit | undefined {
  const split = analyticSplits.get(tableId);
  if (!split) return undefined;
  const updated: AnalyticSplit = {
    ...split,
    checks: split.checks.map((c) => (c.id === checkId ? { ...c, paid: true } : c)),
  };
  analyticSplits.set(tableId, updated);
  return updated;
}

export function isAnalyticSplitComplete(split: AnalyticSplit): boolean {
  return split.checks.length > 0 && split.checks.every((c) => c.paid);
}

export function clearAnalyticSplit(tableId: string) {
  analyticSplits.delete(tableId);
}

export function hasActiveSplit(tableId: string): boolean {
  return romanSplits.has(tableId) || analyticSplits.has(tableId);
}

export function createPaymentRequest(params: {
  tableId: string;
  tableLabel: string;
  operatorId: string;
  operatorName: string;
  total: number;
}): PaymentRequest {
  const existing = [...paymentRequests.values()].find(
    (r) => r.tableId === params.tableId && r.status === "PENDING",
  );
  if (existing) return existing;

  const request: PaymentRequest = {
    id: randomUUID(),
    ...params,
    requestedAt: new Date().toISOString(),
    status: "PENDING",
  };
  paymentRequests.set(request.id, request);
  return request;
}

export function getPaymentRequest(id: string) {
  return paymentRequests.get(id);
}

export function getPendingPaymentRequests(): PaymentRequest[] {
  return [...paymentRequests.values()].filter((r) => r.status === "PENDING");
}

export function completePaymentRequest(id: string): boolean {
  const request = paymentRequests.get(id);
  if (!request || request.status !== "PENDING") return false;
  paymentRequests.set(id, { ...request, status: "COMPLETED" });
  return true;
}

export function rejectPaymentRequest(id: string): boolean {
  const request = paymentRequests.get(id);
  if (!request || request.status !== "PENDING") return false;
  paymentRequests.set(id, { ...request, status: "REJECTED" });
  return true;
}

export function applyLineDiscount(
  tableId: string,
  lineId: string,
  discountPercent: number,
  discountToken?: string,
): { ok: boolean; error?: string } {
  for (const [orderId, order] of orders) {
    if (order.tableId !== tableId) continue;
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) continue;
    orders.set(orderId, {
      ...order,
      lines: order.lines.map((l) =>
        l.id === lineId ? { ...l, discountPercent, discountToken } : l,
      ),
      updatedAt: new Date().toISOString(),
    });
    return { ok: true };
  }
  return { ok: false, error: "Riga non trovata" };
}

export function clearTableOrders(tableId: string) {
  for (const [id, order] of orders) {
    if (order.tableId === tableId) orders.delete(id);
  }
  for (const [id, ticket] of kdsTickets) {
    if (ticket.tableId === tableId) kdsTickets.delete(id);
  }
  clearRomanSplit(tableId);
  clearAnalyticSplit(tableId);
  for (const [id, request] of paymentRequests) {
    if (request.tableId === tableId && request.status === "PENDING") {
      paymentRequests.set(id, { ...request, status: "REJECTED" });
    }
  }
}

export function getOrderByTable(tableId: string): TableOrder | undefined {
  return [...orders.values()].find((o) => o.tableId === tableId && !o.submittedAt);
}

export function getSubmittedOrdersByTable(tableId: string): TableOrder[] {
  return [...orders.values()].filter((o) => o.tableId === tableId && o.submittedAt);
}

export function upsertOrder(order: TableOrder) {
  orders.set(order.id, order);
  setTableOccupied(order.tableId);
}

export function getOrder(id: string) {
  return orders.get(id);
}

export function markOrderSubmitted(id: string) {
  const order = orders.get(id);
  if (!order) return;
  orders.set(id, { ...order, submittedAt: new Date().toISOString() });
}

export function stornoLine(
  orderId: string,
  lineId: string,
  quantity?: number,
): { ok: boolean; line?: OrderLine; error?: string } {
  const order = orders.get(orderId);
  if (!order?.submittedAt) return { ok: false, error: "Ordine non trovato o non inviato" };
  const line = order.lines.find((l) => l.id === lineId);
  if (!line) return { ok: false, error: "Riga non trovata" };
  const voided = line.voidedQuantity ?? 0;
  const remaining = line.quantity - voided;
  const qty = quantity ?? remaining;
  if (qty > remaining) return { ok: false, error: "Quantità non valida" };
  const updated = { ...line, voidedQuantity: voided + qty };
  orders.set(orderId, {
    ...order,
    lines: order.lines.map((l) => (l.id === lineId ? updated : l)),
  });
  return { ok: true, line: updated };
}

export function createDiscountToken(percent: number): string {
  const token = randomUUID();
  discountTokens.set(token, { percent, used: false, createdAt: new Date().toISOString() });
  return token;
}

export function consumeDiscountToken(token: string, percent: number): boolean {
  const entry = discountTokens.get(token);
  if (!entry || entry.used || entry.percent !== percent) return false;
  entry.used = true;
  return true;
}

export function addKdsTickets(tickets: KdsTicket[]) {
  for (const t of tickets) kdsTickets.set(t.id, t);
}

function variantLabels(line: OrderLine): string[] {
  return (line.variants ?? []).map((v) => (v.type === "REMOVE" ? `NO ${v.name}` : v.name));
}

/** Ricostruisce i ticket KDS di un ordine (es. dopo storno). */
export function rebuildKdsTicketsForOrder(order: TableOrder, tableLabel: string): void {
  const previous = [...kdsTickets.values()].filter((t) => t.orderId === order.id);
  for (const ticket of previous) kdsTickets.delete(ticket.id);

  const effectiveLines = order.lines
    .map((l) => ({
      ...l,
      quantity: l.quantity - (l.voidedQuantity ?? 0),
    }))
    .filter((l) => l.quantity > 0);

  if (!order.submittedAt || effectiveLines.length === 0) return;

  const byCourse = new Map<number, OrderLine[]>();
  for (const line of effectiveLines) {
    const course = line.course ?? 1;
    const group = byCourse.get(course) ?? [];
    group.push(line);
    byCourse.set(course, group);
  }

  for (const [course, lines] of byCourse) {
    const prev = previous.find((t) => t.course === course);
    const hold = lines.some((l) => l.hold);
    const dessertQueue = lines.some((l) => l.dessertDefer);
    const id = randomUUID();
    kdsTickets.set(id, {
      id,
      orderId: order.id,
      tableId: order.tableId,
      tableLabel,
      course,
      lines: lines.map((l) => ({
        lineId: l.id,
        name: l.name,
        quantity: l.quantity,
        variants: variantLabels(l),
      })),
      submittedAt: order.submittedAt,
      hold: hold || dessertQueue,
      dessertQueue,
      calledAt: prev?.calledAt,
      courseCalledAt: prev?.courseCalledAt,
    });
  }
}

export function recordKdsCancellation(
  entry: Omit<KdsCancellation, "id">,
): KdsCancellation {
  const row: KdsCancellation = { id: randomUUID(), ...entry };
  kdsCancellations.unshift(row);
  if (kdsCancellations.length > MAX_KDS_CANCELLATIONS) {
    kdsCancellations.length = MAX_KDS_CANCELLATIONS;
  }
  return row;
}

export function getKdsCancellations(maxAgeMs = 600_000): KdsCancellation[] {
  const cutoff = Date.now() - maxAgeMs;
  return kdsCancellations.filter((c) => new Date(c.cancelledAt).getTime() >= cutoff);
}

export function getKdsSnapshot() {
  return {
    tickets: getKdsTickets(),
    cancellations: getKdsCancellations(),
  };
}

export function getKdsTickets(): KdsTicket[] {
  return [...kdsTickets.values()].filter((t) => !t.calledAt);
}

export function callCourse(tableId: string, course: number): KdsTicket[] {
  const released: KdsTicket[] = [];
  const now = new Date().toISOString();
  for (const [id, ticket] of kdsTickets) {
    if (ticket.tableId === tableId && ticket.course === course) {
      const updated = {
        ...ticket,
        hold: false,
        courseCalledAt: now,
      };
      kdsTickets.set(id, updated);
      released.push(updated);
    }
  }
  return released;
}

export function releaseDessertQueue(tableId: string): KdsTicket[] {
  const released: KdsTicket[] = [];
  for (const [id, ticket] of kdsTickets) {
    if (ticket.tableId === tableId && ticket.dessertQueue) {
      const updated = { ...ticket, dessertQueue: false, hold: false };
      kdsTickets.set(id, updated);
      released.push(updated);
    }
  }
  return released;
}
