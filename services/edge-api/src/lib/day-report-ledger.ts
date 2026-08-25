import type { DailyReportSnapshot, FiscalDocumentType, PaymentMethod, PaymentSplit } from "@pizzaguys/types";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { categoryRouting, dayReportStornos, dayReportTransactions, tables } from "@pizzaguys/edge-db";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import type { TableBill } from "./bill.js";
import { consolidateBillForTable } from "./cover-charge.js";
import { getMenuSnapshot } from "./provision.js";
import {
  getAllTableRuntime,
  getOrderByTable,
  getSubmittedOrdersByTable,
  type OrderLine,
} from "./runtime.js";

export type { DailyReportSnapshot };

const COVER_LINE_ID = "__cover_charge__";

export type ServiceType = "BAR" | "TABLE" | "TAKEAWAY" | "DELIVERY";

export interface DaySaleLine {
  name: string;
  quantity: number;
  lineTotal: number;
  vatRate: number;
  categoryName: string;
  workCenter: string;
  discountAmount: number;
  promotionAmount: number;
  supplementAmount: number;
  discountPresetLabel?: string;
}

export interface DayTransaction {
  receiptId: string;
  at: string;
  tableLabel: string;
  tableId?: string;
  serviceType: ServiceType;
  paymentMethod: PaymentMethod;
  paymentSplits?: PaymentSplit[];
  documentType: FiscalDocumentType;
  operatorId: string;
  operatorName: string;
  amount: number;
  lines: DaySaleLine[];
  coverGuests: number;
  /** Broker delivery (Glovo, Alfonsino, …) */
  deliveryBroker?: string;
}

function transactionPaymentParts(
  tx: DayTransaction,
): Array<{ paymentMethod: PaymentMethod; amount: number }> {
  if (tx.paymentSplits?.length) {
    return tx.paymentSplits.map((s) => ({
      paymentMethod: s.paymentMethod,
      amount: s.amount,
    }));
  }
  return [{ paymentMethod: tx.paymentMethod, amount: tx.amount }];
}

export interface DayStorno {
  at: string;
  tableLabel: string;
  itemName: string;
  quantity: number;
  amount: number;
  operatorName: string;
}

interface MenuMaps {
  categories: Map<string, string>;
  products: Map<string, string>;
  categoryWorkCenter: Map<string, string>;
}

const dayTransactions = new Map<string, DayTransaction[]>();
const dayStornos = new Map<string, DayStorno[]>();

function loadTransactions(db: EdgeDatabase, date: string): DayTransaction[] {
  const rows = db
    .select()
    .from(dayReportTransactions)
    .where(eq(dayReportTransactions.closureDate, date))
    .all();
  return rows.map((row) => JSON.parse(row.payload) as DayTransaction);
}

function loadStornos(db: EdgeDatabase, date: string): DayStorno[] {
  const rows = db
    .select()
    .from(dayReportStornos)
    .where(eq(dayReportStornos.closureDate, date))
    .all();
  return rows.map((row) => JSON.parse(row.payload) as DayStorno);
}

function readTransactions(db: EdgeDatabase, date: string): DayTransaction[] {
  if (!dayTransactions.has(date)) {
    dayTransactions.set(date, loadTransactions(db, date));
  }
  return dayTransactions.get(date) ?? [];
}

function readStornos(db: EdgeDatabase, date: string): DayStorno[] {
  if (!dayStornos.has(date)) {
    dayStornos.set(date, loadStornos(db, date));
  }
  return dayStornos.get(date) ?? [];
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function localizedName(value: unknown): string {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") {
    const record = value as Record<string, string>;
    return record.it ?? record.en ?? Object.values(record)[0] ?? "—";
  }
  return "—";
}

function loadMenuMaps(db: EdgeDatabase): MenuMaps {
  const menu = getMenuSnapshot(db);
  const snapshot = menu?.snapshot as
    | {
        categories?: Array<{ id: string; name: unknown }>;
        products?: Array<{ id: string; categoryId: string }>;
      }
    | undefined;

  const categories = new Map<string, string>();
  const products = new Map<string, string>();
  for (const c of snapshot?.categories ?? []) {
    categories.set(c.id, localizedName(c.name).toUpperCase());
  }
  for (const p of snapshot?.products ?? []) {
    products.set(p.id, p.categoryId);
  }

  const routing = db.select().from(categoryRouting).all();
  const categoryWorkCenter = new Map(
    routing.map((r) => [r.categoryId, r.workCenter ?? "PIZZERIA"]),
  );

  return { categories, products, categoryWorkCenter };
}

function workCenterLabel(center: string): string {
  const map: Record<string, string> = {
    CUCINA: "CUCINA",
    PIZZERIA: "PIZZERIA",
    BAR: "BAR",
    CHEF: "RIEPILOGO CHEF",
  };
  return map[center] ?? center;
}

function serviceTypeLabel(type: ServiceType): string {
  const map: Record<ServiceType, string> = {
    BAR: "BAR",
    TABLE: "TAVOLI",
    TAKEAWAY: "ASPORTO",
    DELIVERY: "CONSEGNA A DOMICILIO",
  };
  return map[type];
}

function paymentLabel(method: PaymentMethod): string {
  const map: Record<PaymentMethod, string> = {
    CASH: "CONTANTI",
    POS: "CARTE",
    MEAL_VOUCHER: "BUONI PASTO",
    SATISPAY: "SATISPAY",
    OTHER: "ALTRO",
  };
  return map[method];
}

function resolveServiceType(params: {
  channel: "TABLE" | "TAKEAWAY" | "DELIVERY";
  tableLabel: string;
  isVirtual?: boolean;
  virtualType?: string | null;
  lines: DaySaleLine[];
}): ServiceType {
  const label = params.tableLabel.toUpperCase();
  if (label === "BAR" || label.includes("BAR")) return "BAR";
  if (params.lines.length > 0 && params.lines.every((l) => l.workCenter === "BAR")) {
    return "BAR";
  }
  if (params.virtualType === "DELIVERY" || params.channel === "DELIVERY") return "DELIVERY";
  if (params.virtualType === "ASPORTO" || params.channel === "TAKEAWAY") return "TAKEAWAY";
  return "TABLE";
}

function orderLinesForTable(tableId: string): OrderLine[] {
  const draft = getOrderByTable(tableId);
  const submitted = getSubmittedOrdersByTable(tableId);
  return [...(draft?.lines ?? []), ...submitted.flatMap((o) => o.lines)];
}

export function enrichBillLinesForReport(
  db: EdgeDatabase,
  tableId: string,
  bill: TableBill,
): DaySaleLine[] {
  const maps = loadMenuMaps(db);
  const orderLines = orderLinesForTable(tableId);

  return bill.lines.map((billLine) => {
    if (billLine.id === COVER_LINE_ID) {
      return {
        name: "Coperto",
        quantity: billLine.quantity,
        lineTotal: billLine.lineTotal,
        vatRate: 10,
        categoryName: "COPERTO",
        workCenter: "NO STAMPA",
        discountAmount: 0,
        promotionAmount: 0,
        supplementAmount: 0,
      };
    }

    const orderLine = orderLines.find((l) => l.id === billLine.id);
    const categoryId = orderLine?.productId
      ? maps.products.get(orderLine.productId)
      : undefined;
    const categoryName = categoryId
      ? (maps.categories.get(categoryId) ?? "VARIE")
      : billLine.name.toUpperCase();
    const workCenter = categoryId
      ? (maps.categoryWorkCenter.get(categoryId) ?? "PIZZERIA")
      : "NO STAMPA";
    const grossBeforeDiscount = billLine.quantity * billLine.unitPrice;
    const totalDiscount = Math.max(
      0,
      Math.round((grossBeforeDiscount - billLine.lineTotal) * 100) / 100,
    );
    const supplementAmount = Math.round(
      (orderLine?.variants ?? [])
        .filter((v) => v.type === "ADD" && v.priceDelta > 0)
        .reduce((s, v) => s + v.priceDelta * billLine.quantity, 0) * 100,
    ) / 100;
    const isPromotion = Boolean(orderLine?.discountToken);
    const promotionAmount = isPromotion ? totalDiscount : 0;
    const discountAmount = isPromotion ? 0 : totalDiscount;

    return {
      name: billLine.name,
      quantity: billLine.quantity,
      lineTotal: billLine.lineTotal,
      vatRate: 10,
      categoryName,
      workCenter,
      discountAmount,
      promotionAmount,
      supplementAmount,
      discountPresetLabel: orderLine?.discountPresetLabel,
    };
  });
}

function aggregateDiscountDetails(
  lines: DaySaleLine[],
): Array<{ label: string; quantity: number; total: number }> {
  const map = new Map<string, { quantity: number; total: number }>();
  for (const line of lines) {
    const discount = line.discountAmount + line.promotionAmount;
    if (discount <= 0) continue;
    const label =
      line.discountPresetLabel ??
      (line.promotionAmount > 0 ? "Sconto autorizzato (manager)" : "Sconto manuale");
    const prev = map.get(label) ?? { quantity: 0, total: 0 };
    map.set(label, {
      quantity: prev.quantity + line.quantity,
      total: Math.round((prev.total + discount) * 100) / 100,
    });
  }
  return [...map.entries()]
    .map(([label, v]) => ({ label, quantity: v.quantity, total: -v.total }))
    .sort((a, b) => a.total - b.total);
}

export function recordDayTransaction(db: EdgeDatabase, date: string, tx: DayTransaction) {
  const now = new Date().toISOString();
  db.insert(dayReportTransactions)
    .values({
      id: tx.receiptId,
      closureDate: date,
      payload: JSON.stringify(tx),
      createdAt: now,
    })
    .onConflictDoUpdate({
      target: dayReportTransactions.id,
      set: { payload: JSON.stringify(tx), createdAt: now },
    })
    .run();

  const list = readTransactions(db, date);
  const idx = list.findIndex((t) => t.receiptId === tx.receiptId);
  if (idx >= 0) list[idx] = tx;
  else list.push(tx);
  dayTransactions.set(date, list);
}

export function recordDayStorno(db: EdgeDatabase, date: string, storno: DayStorno) {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.insert(dayReportStornos)
    .values({
      id,
      closureDate: date,
      payload: JSON.stringify(storno),
      createdAt: now,
    })
    .run();

  const list = readStornos(db, date);
  list.push(storno);
  dayStornos.set(date, list);
}

export function clearDayReportLedger(db: EdgeDatabase, date = todayKey()) {
  db.delete(dayReportTransactions).where(eq(dayReportTransactions.closureDate, date)).run();
  db.delete(dayReportStornos).where(eq(dayReportStornos.closureDate, date)).run();
  dayTransactions.delete(date);
  dayStornos.delete(date);
}

export function getDayTransactions(db: EdgeDatabase, date = todayKey()): DayTransaction[] {
  return readTransactions(db, date).filter((t) => t.documentType !== "TRAINING");
}

export function getDayTheoretical(db: EdgeDatabase, date = todayKey()) {
  const transactions = getDayTransactions(db, date);
  const byPaymentMethod: Record<string, number> = {};
  for (const tx of transactions) {
    for (const part of transactionPaymentParts(tx)) {
      byPaymentMethod[part.paymentMethod] =
        Math.round(((byPaymentMethod[part.paymentMethod] ?? 0) + part.amount) * 100) / 100;
    }
  }
  const cash = byPaymentMethod.CASH ?? 0;
  const pos = byPaymentMethod.POS ?? 0;
  const total = Math.round(transactions.reduce((sum, tx) => sum + tx.amount, 0) * 100) / 100;
  return { byPaymentMethod, cash, pos, total, transactionCount: transactions.length, date };
}

function aggregateRows(
  items: Array<{ key: string; quantity: number; total: number }>,
): Array<{ label: string; quantity: number; total: number; average: number }> {
  const map = new Map<string, { quantity: number; total: number }>();
  for (const item of items) {
    const prev = map.get(item.key) ?? { quantity: 0, total: 0 };
    map.set(item.key, {
      quantity: prev.quantity + item.quantity,
      total: Math.round((prev.total + item.total) * 100) / 100,
    });
  }
  return [...map.entries()]
    .map(([label, v]) => ({
      label,
      quantity: v.quantity,
      total: v.total,
      average: v.quantity > 0 ? Math.round((v.total / v.quantity) * 100) / 100 : 0,
    }))
    .sort((a, b) => b.total - a.total);
}

function sumVat(lines: DaySaleLine[], label: string) {
  const byRate = new Map<number, number>();
  for (const line of lines) {
    byRate.set(line.vatRate, (byRate.get(line.vatRate) ?? 0) + line.lineTotal);
  }
  return [...byRate.entries()].map(([rate, gross]) => {
    const net = Math.round((gross / (1 + rate / 100)) * 100) / 100;
    const tax = Math.round((gross - net) * 100) / 100;
    return { label, rate, net, tax, gross: Math.round(gross * 100) / 100 };
  });
}

function fiscalBucket(transactions: DayTransaction[], type: FiscalDocumentType) {
  const filtered = transactions.filter((t) => t.documentType === type);
  const total = Math.round(filtered.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  return {
    count: filtered.length,
    total,
    paid: total,
    unpaid: 0,
  };
}

export function buildDailyReportSnapshot(
  db: EdgeDatabase,
  params: {
    locationName: string;
    closureDate?: string;
    printedBy: string;
    zNumber?: number;
  },
): DailyReportSnapshot {
  const closureDate = params.closureDate ?? todayKey();
  const transactions = readTransactions(db, closureDate);
  const stornos = readStornos(db, closureDate);

  const allLines = transactions.flatMap((t) => t.lines);
  const fiscalLines = transactions
    .filter((t) => t.documentType !== "TRAINING")
    .flatMap((t) => t.lines);
  const receiptLines = transactions
    .filter((t) => t.documentType === "RECEIPT")
    .flatMap((t) => t.lines);
  const invoiceLines = transactions
    .filter((t) => t.documentType === "INVOICE")
    .flatMap((t) => t.lines);

  const dailyTotal = Math.round(transactions.reduce((s, t) => s + t.amount, 0) * 100) / 100;
  const collected = Math.round(
    transactions
      .filter((t) => t.documentType !== "TRAINING")
      .reduce((s, t) => s + t.amount, 0) * 100,
  ) / 100;
  const totalDiscounts = Math.round(
    allLines.reduce((s, l) => s + l.discountAmount, 0) * 100,
  ) / 100;
  const totalPromotions = Math.round(
    allLines.reduce((s, l) => s + l.promotionAmount, 0) * 100,
  ) / 100;
  const totalSupplements = Math.round(
    allLines.reduce((s, l) => s + l.supplementAmount, 0) * 100,
  ) / 100;
  const voidedTotal = Math.round(stornos.reduce((s, st) => s + st.amount, 0) * 100) / 100;

  const coverGuests = transactions.reduce((s, t) => s + t.coverGuests, 0);
  const coverTotal = Math.round(
    allLines.filter((l) => l.categoryName === "COPERTO").reduce((s, l) => s + l.lineTotal, 0) * 100,
  ) / 100;

  const serviceTypes = aggregateRows(
    transactions.flatMap((t) =>
      t.lines.map((l) => ({
        key: serviceTypeLabel(t.serviceType),
        quantity: l.quantity,
        total: l.lineTotal,
      })),
    ),
  );

  const salesGroups = aggregateRows(
    allLines.map((l) => ({
      key: l.categoryName,
      quantity: l.quantity,
      total: l.lineTotal,
    })),
  ).map(({ label, quantity, total }) => ({ name: label, quantity, total }));

  const productionCenters = aggregateRows(
    allLines.map((l) => ({
      key: workCenterLabel(l.workCenter),
      quantity: l.quantity,
      total: l.lineTotal,
    })),
  ).map(({ label, quantity, total }) => ({ name: label, quantity, total }));

  const paymentMap = new Map<string, { quantity: number; total: number }>();
  for (const tx of transactions.filter((t) => t.documentType !== "TRAINING")) {
    for (const part of transactionPaymentParts(tx)) {
      const label = paymentLabel(part.paymentMethod);
      const prev = paymentMap.get(label) ?? { quantity: 0, total: 0 };
      paymentMap.set(label, {
        quantity: prev.quantity + 1,
        total: Math.round((prev.total + part.amount) * 100) / 100,
      });
    }
  }
  const payments = [...paymentMap.entries()]
    .map(([label, v]) => ({ label, ...v }))
    .sort((a, b) => b.total - a.total);

  const operatorMap = new Map<string, { cash: number; pos: number; card: number; total: number }>();
  for (const tx of transactions.filter((t) => t.documentType !== "TRAINING")) {
    const prev = operatorMap.get(tx.operatorName) ?? { cash: 0, pos: 0, card: 0, total: 0 };
    let addCash = 0;
    let addPos = 0;
    let addCard = 0;
    for (const part of transactionPaymentParts(tx)) {
      if (part.paymentMethod === "CASH") addCash += part.amount;
      else if (part.paymentMethod === "POS") addPos += part.amount;
      else addCard += part.amount;
    }
    operatorMap.set(tx.operatorName, {
      cash: Math.round((prev.cash + addCash) * 100) / 100,
      pos: Math.round((prev.pos + addPos) * 100) / 100,
      card: Math.round((prev.card + addCard) * 100) / 100,
      total: Math.round((prev.total + tx.amount) * 100) / 100,
    });
  }
  const operators = [...operatorMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.total - a.total);

  const fiscalTx = transactions.filter((t) => t.documentType !== "TRAINING");
  let cashTotal = 0;
  let posTotal = 0;
  let mealTotal = 0;
  let otherTotal = 0;
  for (const tx of fiscalTx) {
    for (const part of transactionPaymentParts(tx)) {
      if (part.paymentMethod === "CASH") cashTotal += part.amount;
      else if (part.paymentMethod === "POS") posTotal += part.amount;
      else if (part.paymentMethod === "MEAL_VOUCHER") mealTotal += part.amount;
      else if (part.paymentMethod === "SATISPAY" || part.paymentMethod === "OTHER") {
        otherTotal += part.amount;
      }
    }
  }
  cashTotal = Math.round(cashTotal * 100) / 100;
  posTotal = Math.round(posTotal * 100) / 100;
  mealTotal = Math.round(mealTotal * 100) / 100;
  otherTotal = Math.round(otherTotal * 100) / 100;
  const trainingTotal = transactions
    .filter((t) => t.documentType === "TRAINING")
    .reduce((s, t) => s + t.amount, 0);

  const dbTables = db.select().from(tables).all();
  const runtime = getAllTableRuntime();
  const openTables: DailyReportSnapshot["openTables"] = [];
  let openTablesTotal = 0;
  for (const rt of runtime) {
    if (rt.status === "FREE") continue;
    const table = dbTables.find((t) => t.id === rt.tableId);
    if (!table) continue;
    const bill = consolidateBillForTable(db, rt.tableId);
    if (bill.total <= 0) continue;
    openTables.push({
      room: "SALA",
      table: table.label,
      amount: bill.total,
    });
    openTablesTotal += bill.total;
  }
  openTablesTotal = Math.round(openTablesTotal * 100) / 100;

  const discountDetails = aggregateDiscountDetails(allLines);

  return {
    header: {
      locationName: params.locationName,
      closureDate,
      printedAt: new Date().toISOString(),
      printedBy: params.printedBy,
      zNumber: params.zNumber,
    },
    totals: {
      dailyTotal,
      collected,
      uncollected: Math.round((mealTotal + otherTotal + trainingTotal) * 100) / 100,
    },
    coverCharge: {
      quantity: coverGuests,
      average: coverGuests > 0 ? Math.round((coverTotal / coverGuests) * 100) / 100 : 0,
      total: coverTotal,
    },
    serviceTypes,
    adjustments: {
      discounts: -totalDiscounts,
      promotions: -totalPromotions,
      supplements: totalSupplements,
      voided: 0,
      corrections: -voidedTotal,
      openTables: openTablesTotal,
    },
    payments,
    operators,
    collected: {
      cash: Math.round(cashTotal * 100) / 100,
      prepaidCash: 0,
      pos: Math.round(posTotal * 100) / 100,
      prepaidPos: 0,
      mealVoucher: Math.round(mealTotal * 100) / 100,
      other: Math.round(otherTotal * 100) / 100,
      total: collected,
    },
    vat: sumVat(fiscalLines, "Generale"),
    vatReceipts: sumVat(receiptLines, "Scontrini"),
    vatInvoices: sumVat(invoiceLines, "Fatture"),
    salesGroups,
    productionCenters,
    openTables,
    fiscalDocuments: {
      receipts: fiscalBucket(transactions, "RECEIPT"),
      invoices: fiscalBucket(transactions, "INVOICE"),
      training: fiscalBucket(transactions, "TRAINING"),
    },
    stornos,
    transactionCount: transactions.length,
    discountDetails,
  };
}

export function buildByChannelFromSnapshot(snapshot: DailyReportSnapshot): Record<string, number> {
  const result: Record<string, number> = { TABLE: 0, TAKEAWAY: 0, DELIVERY: 0 };
  for (const row of snapshot.serviceTypes) {
    if (row.label === "TAVOLI") result.TABLE = row.total;
    else if (row.label === "CONSEGNA A DOMICILIO") result.DELIVERY = row.total;
    else result.TAKEAWAY = Math.round(((result.TAKEAWAY ?? 0) + row.total) * 100) / 100;
  }
  return result;
}

export {
  localizedName,
  paymentLabel,
  resolveServiceType,
  serviceTypeLabel,
  workCenterLabel,
};
