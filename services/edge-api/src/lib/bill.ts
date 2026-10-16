import type { OrderLine, TableOrder } from "./runtime.js";
import { roundToFiveCents, splitRoundedTotal } from "@pizzaguys/fiscal";
import {
  getAnalyticSplit,
  getOrderByTable,
  getRomanSplit,
  getSubmittedOrdersByTable,
  getTableRuntime,
} from "./runtime.js";

export interface BillLine {
  id: string;
  orderId: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discountPercent?: number;
  variants?: string[];
}

export interface RomanSplitInfo {
  shares: number;
  shareAmounts: number[];
  paidShares: number;
  remainingShares: number;
  nextShareAmount: number | null;
}

export interface AnalyticCheckInfo {
  id: string;
  label: string;
  lineIds: string[];
  total: number;
  paid: boolean;
}

export interface AnalyticSplitInfo {
  checks: AnalyticCheckInfo[];
  unassignedLineIds: string[];
  allAssigned: boolean;
  allPaid: boolean;
}

export interface TableBill {
  tableId: string;
  lines: BillLine[];
  total: number;
  orderCount: number;
  coverCharge?: { guestCount: number; unitPrice: number; lineTotal: number };
  romanSplit?: RomanSplitInfo;
  analyticSplit?: AnalyticSplitInfo;
  /** Sconto in euro applicato (F12) */
  discountAmount?: number;
  /** Coperti tolti dal conto (F12) */
  coverWaived?: boolean;
}

export interface CoverChargeParams {
  unitPrice: number;
  guestCount: number;
}

export const COVER_LINE_ID = "__cover_charge__";

/** Riga coperto: unica ("__cover_charge__") o, in split analitico, una per persona ("__cover_charge__#1"…). */
/** Sconto libero in euro sul conto: riga negativa in fondo (F12). */
export const DISCOUNT_LINE_ID = "__discount_amount__";

export function isCoverLineId(id: string): boolean {
  return id === COVER_LINE_ID || id.startsWith(`${COVER_LINE_ID}#`);
}

/** Etichetta riga unica scontrino riassuntivo (somministrazione) */
export const FULL_MEAL_RECEIPT_LABEL = "PASTO COMPLETO";

function variantLabels(line: OrderLine): string[] {
  return (line.variants ?? []).map((v) => (v.type === "REMOVE" ? `NO ${v.name}` : v.name));
}

export function calculateLineTotal(line: OrderLine): number {
  const effectiveQty = line.quantity - (line.voidedQuantity ?? 0);
  if (effectiveQty <= 0) return 0;
  const subtotal = effectiveQty * line.unitPrice;
  const discount = line.discountPercent ? 1 - line.discountPercent / 100 : 1;
  return Math.round(subtotal * discount * 100) / 100;
}

function orderToBillLines(order: TableOrder): BillLine[] {
  const lines: BillLine[] = [];
  for (const line of order.lines) {
    const lineTotal = calculateLineTotal(line);
    const effectiveQty = line.quantity - (line.voidedQuantity ?? 0);
    if (effectiveQty <= 0) continue;
    lines.push({
      id: line.id,
      orderId: order.id,
      name: line.name,
      quantity: effectiveQty,
      unitPrice: line.unitPrice,
      lineTotal,
      discountPercent: line.discountPercent,
      variants: variantLabels(line),
    });
  }
  return lines;
}

export function consolidateTableBill(tableId: string, coverCharge?: CoverChargeParams): TableBill {
  const draft = getOrderByTable(tableId);
  const submitted = getSubmittedOrdersByTable(tableId);
  const orders = [...(draft ? [draft] : []), ...submitted];

  const lines = orders.flatMap(orderToBillLines);
  let total = roundToFiveCents(lines.reduce((sum, l) => sum + l.lineTotal, 0));

  const analytic = getAnalyticSplit(tableId);

  let coverChargeInfo: TableBill["coverCharge"];
  if (coverCharge && coverCharge.guestCount > 0 && coverCharge.unitPrice > 0) {
    const lineTotal =
      Math.round(coverCharge.unitPrice * coverCharge.guestCount * 100) / 100;
    // Coperto sempre al primo posto. In split analitico una riga per persona, da spostare
    // sul conto di chi paga (con una riga sola "× N" il coperto restava fuori da tutti i conti).
    const coverLines: BillLine[] = analytic
      ? Array.from({ length: coverCharge.guestCount }, (_, i) => ({
          id: `${COVER_LINE_ID}#${i + 1}`,
          orderId: "cover",
          name: "Coperto",
          quantity: 1,
          unitPrice: coverCharge.unitPrice,
          lineTotal: Math.round(coverCharge.unitPrice * 100) / 100,
        }))
      : [
          {
            id: COVER_LINE_ID,
            orderId: "cover",
            name: "Coperto",
            quantity: coverCharge.guestCount,
            unitPrice: coverCharge.unitPrice,
            lineTotal,
          },
        ];
    lines.unshift(...coverLines);
    total = roundToFiveCents(total + lineTotal);
    coverChargeInfo = {
      guestCount: coverCharge.guestCount,
      unitPrice: coverCharge.unitPrice,
      lineTotal,
    };
  }

  // Sconto in euro: mai oltre il totale
  const discountAmount = getTableRuntime(tableId).discountAmount ?? 0;
  if (discountAmount > 0 && total > 0) {
    const applied = Math.min(discountAmount, total);
    lines.push({
      id: DISCOUNT_LINE_ID,
      orderId: "discount",
      name: "Sconto",
      quantity: 1,
      unitPrice: -applied,
      lineTotal: -applied,
    });
    total = roundToFiveCents(total - applied);
  }

  const split = getRomanSplit(tableId);
  const romanSplit = split
    ? {
        shares: split.shares,
        shareAmounts: split.shareAmounts,
        paidShares: split.paidShares,
        remainingShares: split.shares - split.paidShares,
        nextShareAmount:
          split.paidShares < split.shares ? (split.shareAmounts[split.paidShares] ?? null) : null,
      }
    : undefined;

  let analyticSplit: AnalyticSplitInfo | undefined;
  if (analytic) {
    const assigned = new Set(analytic.checks.flatMap((c) => c.lineIds));
    const unassignedLineIds = lines.filter((l) => !assigned.has(l.id)).map((l) => l.id);
    const checks: AnalyticCheckInfo[] = analytic.checks.map((c) => ({
      id: c.id,
      label: c.label,
      lineIds: c.lineIds,
      total: Math.round(
        lines.filter((l) => c.lineIds.includes(l.id)).reduce((s, l) => s + l.lineTotal, 0) * 100,
      ) / 100,
      paid: c.paid,
    }));
    analyticSplit = {
      checks,
      unassignedLineIds,
      allAssigned: unassignedLineIds.length === 0 && lines.length > 0,
      allPaid: checks.length > 0 && checks.every((c) => c.paid),
    };
  }

  const runtime = getTableRuntime(tableId);
  return {
    tableId,
    lines,
    total,
    orderCount: orders.length,
    coverCharge: coverChargeInfo,
    romanSplit,
    analyticSplit,
    discountAmount: runtime.discountAmount,
    coverWaived: runtime.coverWaived,
  };
}

export function billLinesForCheck(bill: TableBill, checkId: string): BillLine[] {
  const check = bill.analyticSplit?.checks.find((c) => c.id === checkId);
  if (!check) return [];
  return bill.lines.filter((l) => check.lineIds.includes(l.id));
}

export function billToReceiptLines(
  bill: TableBill,
  amount?: number,
  lines?: BillLine[],
  options?: { fullMeal?: boolean; fullMealLabel?: string },
) {
  const source = lines ?? bill.lines;
  const sourceTotal = source.reduce((s, l) => s + l.lineTotal, 0);
  const target = amount ?? sourceTotal;
  if (sourceTotal <= 0) return [];

  if (options?.fullMeal) {
    const label = options.fullMealLabel ?? FULL_MEAL_RECEIPT_LABEL;
    return [
      {
        name: label,
        quantity: 1,
        unitPrice: Math.round(target * 100) / 100,
        vatRate: 10 as const,
      },
    ];
  }

  const ratio = target / sourceTotal;
  return source.map((l) => ({
    name: l.name,
    quantity: l.quantity,
    unitPrice: Math.round((l.lineTotal * ratio) / l.quantity * 100) / 100,
    vatRate: 10 as const,
  }));
}
