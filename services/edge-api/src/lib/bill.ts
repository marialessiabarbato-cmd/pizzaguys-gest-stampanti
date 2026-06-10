import type { OrderLine, TableOrder } from "./runtime.js";
import {
  getAnalyticSplit,
  getOrderByTable,
  getRomanSplit,
  getSubmittedOrdersByTable,
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
  romanSplit?: RomanSplitInfo;
  analyticSplit?: AnalyticSplitInfo;
}

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

export function consolidateTableBill(tableId: string): TableBill {
  const draft = getOrderByTable(tableId);
  const submitted = getSubmittedOrdersByTable(tableId);
  const orders = [...(draft ? [draft] : []), ...submitted];

  const lines = orders.flatMap(orderToBillLines);
  const total = Math.round(lines.reduce((sum, l) => sum + l.lineTotal, 0) * 100) / 100;

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

  const analytic = getAnalyticSplit(tableId);
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

  return { tableId, lines, total, orderCount: orders.length, romanSplit, analyticSplit };
}

export function billLinesForCheck(bill: TableBill, checkId: string): BillLine[] {
  const check = bill.analyticSplit?.checks.find((c) => c.id === checkId);
  if (!check) return [];
  return bill.lines.filter((l) => check.lineIds.includes(l.id));
}

export function billToReceiptLines(bill: TableBill, amount?: number, lines?: BillLine[]) {
  const source = lines ?? bill.lines;
  const sourceTotal = source.reduce((s, l) => s + l.lineTotal, 0);
  const target = amount ?? sourceTotal;
  if (sourceTotal <= 0) return [];
  const ratio = target / sourceTotal;
  return source.map((l) => ({
    name: l.name,
    quantity: l.quantity,
    unitPrice: Math.round((l.lineTotal * ratio) / l.quantity * 100) / 100,
    vatRate: 10 as const,
  }));
}
