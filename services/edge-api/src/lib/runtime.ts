import { randomUUID } from "node:crypto";
import { roundToFiveCents, splitRoundedTotal } from "@pizzaguys/fiscal";
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
  /** Prezzo unitario impostato manualmente (cassa/cameriere) */
  manualPrice?: boolean;
  channel: "TABLE" | "TAKEAWAY" | "DELIVERY";
  notes?: string;
  variants?: OrderLineVariant[];
  course?: number;
  hold?: boolean;
  dessertDefer?: boolean;
  discountPercent?: number;
  discountToken?: string;
  discountPresetLabel?: string;
  voidedQuantity?: number;
  /** Destinazione fisica in unione tavoli (conto sull'host). */
  forTableId?: string;
  forTableLabel?: string;
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
  /** Capienza effettiva dopo unione di più tavoli fisici */
  tableCapacity?: number;
  /** Tavoli fisici uniti su questo (host) */
  linkedTableIds?: string[];
  /** Se il tavolo è stato unito in un altro (mostrato libero sulla mappa) */
  mergedIntoTableId?: string;
  /** Prima apertura conto del servizio corrente */
  openedAt?: string;
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

export function getTableCapacity(tableId: string, defaultGuests: number): number {
  const runtime = getTableRuntime(tableId);
  return runtime.tableCapacity ?? defaultGuests;
}

export function setTableUnionCapacity(tableId: string, capacity: number) {
  const current = getTableRuntime(tableId);
  tableRuntime.set(tableId, { ...current, tableCapacity: capacity });
}

/** Host + annessi di un'unione (o solo il tavolo se non unito). */
export function unionMemberIds(tableId: string): string[] {
  const runtime = getTableRuntime(tableId);
  const hostId = runtime.mergedIntoTableId ?? tableId;
  const host = getTableRuntime(hostId);
  return [hostId, ...(host.linkedTableIds ?? [])];
}

/** Somma coperti sui tavoli fisici del gruppo (conto unico, coperti separati). */
export function getUnionGuestTotal(tableId: string): number {
  return unionMemberIds(tableId).reduce((sum, id) => {
    const m = getTableRuntime(id);
    return sum + (m.guests ?? 0);
  }, 0);
}

export function applyGuestsByTable(guestsByTable: Record<string, number>) {
  for (const [id, guests] of Object.entries(guestsByTable)) {
    if (!Number.isFinite(guests) || guests < 1) continue;
    updateTableGuests(id, Math.floor(guests));
  }
}

export function registerTableUnion(
  hostTableId: string,
  sourceTableIds: string[],
  combinedCapacity?: number,
) {
  const host = getTableRuntime(hostTableId);
  const linked = new Set(host.linkedTableIds ?? []);
  for (const id of sourceTableIds) {
    if (id !== hostTableId) linked.add(id);
  }
  tableRuntime.set(hostTableId, {
    ...getTableRuntime(hostTableId),
    linkedTableIds: [...linked],
    ...(combinedCapacity && combinedCapacity > 0
      ? { tableCapacity: combinedCapacity }
      : {}),
  });
  for (const id of sourceTableIds) {
    if (id === hostTableId) continue;
    const prev = getTableRuntime(id);
    // Mantieni i coperti sul tavolo fisico (non sommare sull'host).
    tableRuntime.set(id, {
      tableId: id,
      status: "FREE",
      mergedIntoTableId: hostTableId,
      guests: prev.guests,
      chargedGuests: prev.chargedGuests,
    });
  }
}

export function clearTableUnion(hostTableId: string) {
  const host = getTableRuntime(hostTableId);
  for (const id of host.linkedTableIds ?? []) {
    tableRuntime.set(id, { tableId: id, status: "FREE" });
  }
  tableRuntime.set(hostTableId, { tableId: hostTableId, status: "FREE" });
}

export function updateTableGuests(tableId: string, guests: number) {
  const current = getTableRuntime(tableId);
  const chargedGuests = Math.max(current.chargedGuests ?? 0, guests);
  tableRuntime.set(tableId, {
    ...current,
    guests,
    chargedGuests: chargedGuests > 0 ? chargedGuests : undefined,
  });
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
  const openedAt =
    current.openedAt ??
    (nextGuests || getSubmittedOrdersByTable(tableId).length > 0
      ? new Date().toISOString()
      : undefined);
  tableRuntime.set(tableId, {
    ...current,
    tableId,
    status: "LOCKED",
    lockedBy: operatorId,
    lockedByName: operatorName,
    lockedAt: new Date().toISOString(),
    guests: nextGuests,
    chargedGuests: chargedGuests > 0 ? chargedGuests : undefined,
    openedAt,
  });
  return { granted: true };
}

export function getChargedGuests(tableId: string): number | undefined {
  let total = 0;
  let any = false;
  for (const id of unionMemberIds(tableId)) {
    const m = getTableRuntime(id);
    const g = m.chargedGuests ?? m.guests;
    if (g != null && g > 0) {
      total += g;
      any = true;
    }
  }
  return any ? total : undefined;
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
  const hasDraft = !!getOrderByTable(tableId);
  const hasGuests = (current.guests ?? 0) > 0 || (current.chargedGuests ?? 0) > 0;
  if (hasSubmitted || hasDraft || hasGuests) {
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
  const openedAt = current.openedAt ?? new Date().toISOString();
  tableRuntime.set(tableId, {
    ...current,
    tableId,
    status: "OCCUPIED",
    lockedBy: undefined,
    lockedByName: undefined,
    lockedAt: undefined,
    openedAt,
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
  const current = getTableRuntime(tableId);
  if (current.linkedTableIds?.length) {
    clearTableUnion(tableId);
    return;
  }
  tableRuntime.set(tableId, { tableId, status: "FREE" });
}

/** Apre un tavolo con coperti (es. da prenotazione) senza lock operatore. */
export function openTableWithGuests(tableId: string, guests: number) {
  const current = getTableRuntime(tableId);
  if (current.status !== "FREE") {
    return { ok: false as const, error: "Tavolo non libero" };
  }
  const openedAt = new Date().toISOString();
  tableRuntime.set(tableId, {
    tableId,
    status: "OCCUPIED",
    guests,
    chargedGuests: guests,
    openedAt,
  });
  return { ok: true as const };
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
  return splitRoundedTotal(roundToFiveCents(total), shares);
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

/** Annulla split non ancora incassato e riporta il tavolo a OCCUPIED. */
export function cancelActiveSplit(
  tableId: string,
): { ok: true } | { ok: false; error: string } {
  const roman = romanSplits.get(tableId);
  const analytic = analyticSplits.get(tableId);
  if (!roman && !analytic) {
    return { ok: false, error: "Nessuno split attivo" };
  }
  if (roman && roman.paidShares > 0) {
    return {
      ok: false,
      error: "Hai già incassato una quota: completa lo split o storna i documenti",
    };
  }
  if (analytic?.checks.some((c) => c.paid)) {
    return {
      ok: false,
      error: "Hai già incassato un conto: completa lo split o storna i documenti",
    };
  }

  clearRomanSplit(tableId);
  clearAnalyticSplit(tableId);
  const current = getTableRuntime(tableId);
  tableRuntime.set(tableId, {
    ...current,
    tableId,
    status: "OCCUPIED",
    lockedBy: undefined,
    lockedByName: undefined,
    lockedAt: undefined,
  });
  return { ok: true };
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

export function applyTableDiscount(
  tableId: string,
  discountPercent: number,
  discountToken?: string,
  discountPresetLabel?: string,
): { ok: boolean; updatedLines: number; error?: string } {
  let updatedLines = 0;
  for (const [orderId, order] of orders) {
    if (order.tableId !== tableId) continue;
    const lines = order.lines.map((l) => {
      const effectiveQty = l.quantity - (l.voidedQuantity ?? 0);
      if (effectiveQty <= 0) return l;
      updatedLines += 1;
      return { ...l, discountPercent, discountToken, discountPresetLabel };
    });
    orders.set(orderId, {
      ...order,
      lines,
      updatedAt: new Date().toISOString(),
    });
  }
  if (updatedLines === 0) return { ok: false, updatedLines: 0, error: "Nessuna riga da scontare" };
  return { ok: true, updatedLines };
}

export function clearTableDiscounts(tableId: string): { ok: boolean; error?: string } {
  let found = false;
  for (const [orderId, order] of orders) {
    if (order.tableId !== tableId) continue;
    found = true;
    orders.set(orderId, {
      ...order,
      lines: order.lines.map((l) => ({
        ...l,
        discountPercent: undefined,
        discountToken: undefined,
        discountPresetLabel: undefined,
      })),
      updatedAt: new Date().toISOString(),
    });
  }
  if (!found) return { ok: false, error: "Nessun ordine trovato" };
  return { ok: true };
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

export function setLineUnitPrice(
  tableId: string,
  lineId: string,
  unitPrice: number,
  extras?: {
    basePrice?: number;
    variants?: OrderLineVariant[];
  },
): { ok: boolean; line?: OrderLine; orderId?: string; error?: string } {
  if (!(unitPrice > 0)) return { ok: false, error: "Prezzo non valido" };

  const patch = (line: OrderLine): OrderLine => ({
    ...line,
    unitPrice,
    manualPrice: true,
    ...(extras?.basePrice != null && extras.basePrice > 0 ? { basePrice: extras.basePrice } : {}),
    ...(extras?.variants != null ? { variants: extras.variants } : {}),
  });

  const draft = getOrderByTable(tableId);
  if (draft) {
    const line = draft.lines.find((l) => l.id === lineId);
    if (line) {
      const updated = patch(line);
      orders.set(draft.id, {
        ...draft,
        lines: draft.lines.map((l) => (l.id === lineId ? updated : l)),
        updatedAt: new Date().toISOString(),
      });
      return { ok: true, line: updated, orderId: draft.id };
    }
  }

  for (const order of getSubmittedOrdersByTable(tableId)) {
    const line = order.lines.find((l) => l.id === lineId);
    if (!line) continue;
    const remaining = line.quantity - (line.voidedQuantity ?? 0);
    if (remaining <= 0) return { ok: false, error: "Riga già stornata" };
    const updated = patch(line);
    orders.set(order.id, {
      ...order,
      lines: order.lines.map((l) => (l.id === lineId ? updated : l)),
      updatedAt: new Date().toISOString(),
    });
    return { ok: true, line: updated, orderId: order.id };
  }

  return { ok: false, error: "Riga non trovata" };
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

function getOrdersForTable(tableId: string): TableOrder[] {
  return [...orders.values()].filter((o) => o.tableId === tableId);
}

export function hasPendingPaymentForTable(tableId: string): boolean {
  return [...paymentRequests.values()].some(
    (r) => r.tableId === tableId && r.status === "PENDING",
  );
}

function relocateKdsTicketsForOrders(
  orderIds: Set<string>,
  toTableId: string,
  toLabel: string,
) {
  for (const [id, ticket] of kdsTickets) {
    if (orderIds.has(ticket.orderId)) {
      kdsTickets.set(id, { ...ticket, tableId: toTableId, tableLabel: toLabel });
    }
  }
}

function mergeRuntimeGuests(sourceTableId: string, targetTableId: string) {
  const src = getTableRuntime(sourceTableId);
  const tgt = getTableRuntime(targetTableId);
  const guests = (tgt.guests ?? 0) + (src.guests ?? 0);
  const chargedGuests =
    (tgt.chargedGuests ?? tgt.guests ?? 0) + (src.chargedGuests ?? src.guests ?? 0);
  const status: TableStatus =
    tgt.status === "FREE" ? "OCCUPIED" : tgt.status === "BILL_REQUESTED" ? tgt.status : "OCCUPIED";
  tableRuntime.set(targetTableId, {
    ...tgt,
    guests: guests > 0 ? guests : tgt.guests,
    chargedGuests: chargedGuests > 0 ? chargedGuests : tgt.chargedGuests,
    status,
    lockedBy: tgt.lockedBy,
    lockedByName: tgt.lockedByName,
    lockedAt: tgt.lockedAt,
  });
}

function refreshSourceTableStatus(sourceTableId: string) {
  const hasDraft = !!getOrderByTable(sourceTableId);
  const hasSubmitted = getSubmittedOrdersByTable(sourceTableId).length > 0;
  if (!hasDraft && !hasSubmitted) {
    tableRuntime.set(sourceTableId, { tableId: sourceTableId, status: "FREE" });
    return;
  }
  const current = getTableRuntime(sourceTableId);
  if (current.status === "SPLIT_IN_PROGRESS" || current.status === "BILL_REQUESTED") return;
  tableRuntime.set(sourceTableId, {
    ...current,
    tableId: sourceTableId,
    status: "OCCUPIED",
    lockedBy: undefined,
    lockedByName: undefined,
    lockedAt: undefined,
    guests: hasDraft || hasSubmitted ? current.guests : undefined,
    chargedGuests: hasDraft || hasSubmitted ? current.chargedGuests : undefined,
  });
}

function appendDraftLines(
  targetTableId: string,
  lines: OrderLine[],
  operatorId: string,
  operatorName: string,
) {
  if (lines.length === 0) return;
  const draft = getOrderByTable(targetTableId);
  const now = new Date().toISOString();
  if (draft) {
    orders.set(draft.id, {
      ...draft,
      lines: [...draft.lines, ...lines],
      updatedAt: now,
    });
    return;
  }
  const order: TableOrder = {
    id: randomUUID(),
    tableId: targetTableId,
    operatorId,
    operatorName,
    channel: "TABLE",
    lines,
    createdAt: now,
    updatedAt: now,
  };
  orders.set(order.id, order);
}

function appendSubmittedLines(
  targetTableId: string,
  lines: OrderLine[],
  submittedAt: string,
  operatorId: string,
  operatorName: string,
): string {
  const now = new Date().toISOString();
  const order: TableOrder = {
    id: randomUUID(),
    tableId: targetTableId,
    operatorId,
    operatorName,
    channel: "TABLE",
    lines,
    createdAt: submittedAt,
    updatedAt: now,
    submittedAt,
  };
  orders.set(order.id, order);
  return order.id;
}

export type TransferTableResult =
  | {
      ok: true;
      movedLineIds: string[];
      sourceStatus: TableStatus;
      targetStatus: TableStatus;
      affectedOrderIds: string[];
    }
  | { ok: false; error: string };

export function transferTableAccount(params: {
  sourceTableId: string;
  targetTableId: string;
  lineIds?: string[];
  operatorId: string;
  operatorName: string;
  sourceTableLabel: string;
  targetTableLabel: string;
  allowEmptyLink?: boolean;
  /** Unione tavoli: sposta il conto ma non somma i coperti sull'host. */
  preserveMemberGuests?: boolean;
}): TransferTableResult {
  const {
    sourceTableId,
    targetTableId,
    operatorId,
    operatorName,
    targetTableLabel,
    allowEmptyLink,
    preserveMemberGuests,
  } = params;

  if (sourceTableId === targetTableId) {
    return { ok: false, error: "Sorgente e destinazione devono essere diversi" };
  }

  const sourceRuntime = getTableRuntime(sourceTableId);
  const targetRuntime = getTableRuntime(targetTableId);

  if (sourceRuntime.status === "SPLIT_IN_PROGRESS") {
    return { ok: false, error: "Split conto in corso sul tavolo sorgente" };
  }
  if (targetRuntime.status === "SPLIT_IN_PROGRESS") {
    return { ok: false, error: "Split conto in corso sul tavolo destinazione" };
  }
  if (hasPendingPaymentForTable(sourceTableId)) {
    return { ok: false, error: "Pagamento in attesa sul tavolo sorgente" };
  }
  if (hasPendingPaymentForTable(targetTableId)) {
    return { ok: false, error: "Pagamento in attesa sul tavolo destinazione" };
  }
  if (hasActiveSplit(sourceTableId) || hasActiveSplit(targetTableId)) {
    return { ok: false, error: "Split attivo — completa o annulla prima dello spostamento" };
  }

  const sourceOrders = getOrdersForTable(sourceTableId);
  const sourceHasGuests = (sourceRuntime.guests ?? 0) > 0;

  if (sourceOrders.length === 0) {
    if (!sourceHasGuests) {
      if (allowEmptyLink) {
        tableRuntime.set(sourceTableId, { tableId: sourceTableId, status: "FREE" });
        if (targetRuntime.status === "FREE") setTableOccupied(targetTableId);
        return {
          ok: true,
          movedLineIds: [],
          sourceStatus: getTableRuntime(sourceTableId).status,
          targetStatus: getTableRuntime(targetTableId).status,
          affectedOrderIds: [],
        };
      }
      return { ok: false, error: "Nessun conto o coperti da spostare sul tavolo sorgente" };
    }
    if (!preserveMemberGuests) {
      mergeRuntimeGuests(sourceTableId, targetTableId);
      tableRuntime.set(sourceTableId, { tableId: sourceTableId, status: "FREE" });
    } else if (targetRuntime.status === "FREE") {
      setTableOccupied(targetTableId);
    }
    return {
      ok: true,
      movedLineIds: [],
      sourceStatus: getTableRuntime(sourceTableId).status,
      targetStatus: getTableRuntime(targetTableId).status,
      affectedOrderIds: [],
    };
  }

  const allLineIds = sourceOrders.flatMap((o) => o.lines.map((l) => l.id));
  const lineIdSet = params.lineIds?.length
    ? new Set(params.lineIds)
    : new Set(allLineIds);

  for (const id of lineIdSet) {
    if (!allLineIds.includes(id)) {
      return { ok: false, error: `Riga ${id} non trovata sul tavolo sorgente` };
    }
  }

  const isFullTransfer = lineIdSet.size === allLineIds.length;
  const movedLineIds: string[] = [];
  const affectedOrderIds = new Set<string>();
  const relocatedOrderIds = new Set<string>();
  const now = new Date().toISOString();

  for (const order of sourceOrders) {
    const toMove = order.lines.filter((l) => lineIdSet.has(l.id));
    const toKeep = order.lines.filter((l) => !lineIdSet.has(l.id));
    if (toMove.length === 0) continue;

    movedLineIds.push(...toMove.map((l) => l.id));
    affectedOrderIds.add(order.id);

    if (toKeep.length === 0) {
      if (!order.submittedAt) {
        const targetDraft = getOrderByTable(targetTableId);
        if (targetDraft && targetDraft.id !== order.id) {
          orders.set(targetDraft.id, {
            ...targetDraft,
            lines: [...targetDraft.lines, ...order.lines],
            updatedAt: now,
          });
          orders.delete(order.id);
          relocatedOrderIds.add(targetDraft.id);
        } else {
          orders.set(order.id, { ...order, tableId: targetTableId, updatedAt: now });
          relocatedOrderIds.add(order.id);
        }
      } else {
        orders.set(order.id, { ...order, tableId: targetTableId, updatedAt: now });
        relocatedOrderIds.add(order.id);
      }
      continue;
    }

    orders.set(order.id, { ...order, lines: toKeep, updatedAt: now });

    if (order.submittedAt) {
      const newOrderId = appendSubmittedLines(
        targetTableId,
        toMove,
        order.submittedAt,
        operatorId,
        operatorName,
      );
      affectedOrderIds.add(newOrderId);
      relocatedOrderIds.add(newOrderId);
    } else {
      appendDraftLines(targetTableId, toMove, operatorId, operatorName);
      const draft = getOrderByTable(targetTableId);
      if (draft) relocatedOrderIds.add(draft.id);
    }
  }

  relocateKdsTicketsForOrders(relocatedOrderIds, targetTableId, targetTableLabel);

  for (const orderId of relocatedOrderIds) {
    const order = orders.get(orderId);
    if (order?.submittedAt) {
      rebuildKdsTicketsForOrder(order, targetTableLabel);
    }
  }
  for (const orderId of affectedOrderIds) {
    const order = orders.get(orderId);
    if (order?.submittedAt && order.tableId === sourceTableId) {
      rebuildKdsTicketsForOrder(order, params.sourceTableLabel);
    }
  }

  if (isFullTransfer) {
    if (!preserveMemberGuests) {
      mergeRuntimeGuests(sourceTableId, targetTableId);
      tableRuntime.set(sourceTableId, { tableId: sourceTableId, status: "FREE" });
    } else {
      // Unione: lascia i coperti sulla sorgente; registerTableUnion li conserverà.
      const src = getTableRuntime(sourceTableId);
      tableRuntime.set(sourceTableId, {
        tableId: sourceTableId,
        status: "FREE",
        guests: src.guests,
        chargedGuests: src.chargedGuests,
      });
    }
  } else {
    refreshSourceTableStatus(sourceTableId);
    const tgt = getTableRuntime(targetTableId);
    if (tgt.status === "FREE") {
      tableRuntime.set(targetTableId, { ...tgt, status: "OCCUPIED" });
    }
  }

  setTableOccupied(targetTableId);

  return {
    ok: true,
    movedLineIds,
    sourceStatus: getTableRuntime(sourceTableId).status,
    targetStatus: getTableRuntime(targetTableId).status,
    affectedOrderIds: [...affectedOrderIds, ...relocatedOrderIds],
  };
}

export function mergeTablesInto(params: {
  sourceTableIds: string[];
  targetTableId: string;
  operatorId: string;
  operatorName: string;
  tableLabels: Map<string, string>;
  combinedCapacity?: number;
  guestsByTable?: Record<string, number>;
}): TransferTableResult & { mergedSources?: string[] } {
  const uniqueSources = [...new Set(params.sourceTableIds)].filter(
    (id) => id !== params.targetTableId,
  );
  if (uniqueSources.length === 0) {
    return { ok: false, error: "Seleziona almeno un tavolo sorgente diverso dalla destinazione" };
  }

  const targetTableLabel =
    params.tableLabels.get(params.targetTableId) ?? params.targetTableId;
  const allMoved: string[] = [];
  const mergedSources: string[] = [];

  for (const sourceId of uniqueSources) {
    const result = transferTableAccount({
      sourceTableId: sourceId,
      targetTableId: params.targetTableId,
      operatorId: params.operatorId,
      operatorName: params.operatorName,
      sourceTableLabel: params.tableLabels.get(sourceId) ?? sourceId,
      targetTableLabel,
      allowEmptyLink: true,
      preserveMemberGuests: true,
    });
    if (!result.ok) return result;
    allMoved.push(...result.movedLineIds);
    mergedSources.push(sourceId);
  }

  if (params.combinedCapacity && params.combinedCapacity > 0) {
    registerTableUnion(
      params.targetTableId,
      mergedSources,
      params.combinedCapacity,
    );
  } else {
    registerTableUnion(params.targetTableId, mergedSources);
  }

  if (params.guestsByTable) {
    applyGuestsByTable(params.guestsByTable);
  }

  return {
    ok: true,
    movedLineIds: allMoved,
    sourceStatus: getTableRuntime(uniqueSources[uniqueSources.length - 1]!).status,
    targetStatus: getTableRuntime(params.targetTableId).status,
    affectedOrderIds: [],
    mergedSources,
  };
}
