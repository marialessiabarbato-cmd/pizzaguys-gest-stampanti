import { randomUUID } from "node:crypto";
import { buildPrebillTicket } from "@pizzaguys/escpos";
import { edgeState, printers, tables } from "@pizzaguys/edge-db";
import {
  analyticSplitSchema,
  applyPosDiscountSchema,
  applyTableDiscountPresetSchema,
  counterSaleSchema,
  createCounterOrderSchema,
  payTableSchema,
  romanSplitSchema,
} from "@pizzaguys/validators";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { buildOpenTablesSnapshot } from "../lib/open-tables.js";
import { createHardwareBridge } from "@pizzaguys/hardware-bridge";
import { writeEdgeAudit } from "../lib/audit.js";
import { consolidateBillForTable } from "../lib/cover-charge.js";
import {
  createCounterOrder,
  formatScheduledTime,
  getCounterOrder,
  listCounterOrders,
  removeCounterOrder,
  resolveTableContext,
} from "../lib/counter-order.js";
import { executeTablePayment } from "../lib/payment.js";
import { getMenuSnapshot } from "../lib/provision.js";
import {
  clearTableOrders,
  consumeDiscountToken,
  createDiscountToken,
  getAnalyticSplit,
  getOrderByTable,
  getPendingPaymentRequests,
  getRomanSplit,
  getTableRuntime,
  hasActiveSplit,
  markOrderSubmitted,
  rejectPaymentRequest,
  setBillRequested,
  startAnalyticSplit,
  startRomanSplit,
  updateAnalyticSplit,
  type OrderLine,
  type TableOrder,
  upsertOrder,
  applyLineDiscount,
  applyTableDiscount,
  cancelActiveSplit,
  clearTableDiscounts,
} from "../lib/runtime.js";
import { verifyManagerPin } from "../lib/staff-auth.js";
import { broadcast, broadcastTableStatus } from "../lib/ws-hub.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

type MenuSnapshot = {
  settings?: { maxDiscountPercent?: number; pinDiscountThresholdPercent?: number };
};

const DEFAULT_PIN_DISCOUNT_THRESHOLD = 10;

function findVirtualTable(
  db: FastifyInstance["edgeDb"],
  channel: "TAKEAWAY" | "DELIVERY",
) {
  const virtualType = channel === "TAKEAWAY" ? "ASPORTO" : "DELIVERY";
  return db
    .select()
    .from(tables)
    .where(eq(tables.virtualType, virtualType))
    .get();
}

export async function posRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: { roomId?: string; operatorId?: string; shiftId?: string };
  }>("/api/pos/open-tables", async (req) =>
    buildOpenTablesSnapshot(app.edgeDb, {
      shiftId: req.query.shiftId,
      filters: {
        roomId: req.query.roomId,
        operatorId: req.query.operatorId,
      },
    }),
  );

  app.get("/api/pos/payment-requests", async () => getPendingPaymentRequests());

  app.get<{ Querystring: { channel?: "TAKEAWAY" | "DELIVERY" } }>(
    "/api/pos/counter-orders",
    async (req) => {
      const orders = listCounterOrders({
        channel: req.query.channel,
        activeOnly: true,
      });
      return orders.map((order) => {
        const bill = consolidateBillForTable(app.edgeDb, order.id);
        const runtime = getTableRuntime(order.id);
        return {
          ...order,
          scheduledLabel: formatScheduledTime(order),
          status: runtime.status,
          total: bill.total,
          lineCount: bill.lines.length,
        };
      });
    },
  );

  app.post("/api/pos/counter-orders", async (req, reply) => {
    const parsed = createCounterOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const order = createCounterOrder({
      channel: parsed.data.channel,
      customerName: parsed.data.customerName,
      phone: parsed.data.phone,
      address: parsed.data.address,
      notes: parsed.data.notes,
      broker: parsed.data.broker,
      asap: parsed.data.asap,
      scheduledAt: parsed.data.scheduledAt,
    });

    broadcastTableStatus(order.id, "OCCUPIED");

    return reply.status(201).send({
      ok: true,
      order: {
        ...order,
        scheduledLabel: formatScheduledTime(order),
        virtualType: order.channel === "TAKEAWAY" ? "ASPORTO" : "DELIVERY",
      },
    });
  });

  /** Annulla asporto/delivery non pagato (svuota eventuali righe e libera il slot). */
  app.delete<{ Params: { id: string } }>("/api/pos/counter-orders/:id", async (req, reply) => {
    const order = getCounterOrder(req.params.id);
    if (!order) return reply.status(404).send({ error: "Ordine non trovato" });
    if (order.paidAt) return reply.status(409).send({ error: "Ordine già pagato" });

    clearTableOrders(req.params.id);
    removeCounterOrder(req.params.id);
    broadcastTableStatus(req.params.id, "FREE");

    return { ok: true, id: req.params.id };
  });

  app.get<{ Params: { id: string } }>("/api/pos/tables/:id/bill", async (req, reply) => {
    const ctx = resolveTableContext(req.params.id, app.edgeDb);
    if (!ctx) return reply.status(404).send({ error: "Tavolo non trovato" });

    const bill = consolidateBillForTable(app.edgeDb, req.params.id);
    const counter = getCounterOrder(req.params.id);
    return {
      ...bill,
      tableLabel: ctx.label,
      isVirtual: ctx.isVirtual,
      virtualType: ctx.virtualType,
      counterOrder: counter
        ? {
            displayNumber: counter.displayNumber,
            customerName: counter.customerName,
            phone: counter.phone,
            address: counter.address,
            notes: counter.notes,
            broker: counter.broker,
            asap: counter.asap,
            scheduledAt: counter.scheduledAt,
            scheduledLabel: formatScheduledTime(counter),
          }
        : undefined,
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/discount", async (req, reply) => {
    const parsed = applyPosDiscountSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const ctx = resolveTableContext(req.params.id, app.edgeDb);
    if (!ctx) return reply.status(404).send({ error: "Tavolo non trovato" });

    const menu = getMenuSnapshot(app.edgeDb);
    const settings = (menu?.snapshot as MenuSnapshot | undefined)?.settings;
    const maxDiscount = settings?.maxDiscountPercent ?? 20;
    const pinThreshold = settings?.pinDiscountThresholdPercent ?? DEFAULT_PIN_DISCOUNT_THRESHOLD;

    if (parsed.data.discountPercent > maxDiscount) {
      return reply.status(400).send({ error: `Sconto massimo ${maxDiscount}%` });
    }

    const needsPin = parsed.data.discountPercent > pinThreshold;
    let authorizedBy: string | undefined;

    if (needsPin) {
      if (!parsed.data.managerPin) {
        return reply.status(401).send({ error: "PIN manager richiesto per questo sconto" });
      }
      const manager = await verifyManagerPin(app.edgeDb, parsed.data.managerPin);
      if (!manager) return reply.status(401).send({ error: "PIN manager non valido" });
      authorizedBy = `${manager.firstName} ${manager.lastName}`;
    }

    const token = needsPin ? createDiscountToken(parsed.data.discountPercent) : undefined;
    const result = applyLineDiscount(
      req.params.id,
      parsed.data.lineId,
      parsed.data.discountPercent,
      token,
    );
    if (!result.ok) return reply.status(404).send({ error: result.error });

    if (token && !consumeDiscountToken(token, parsed.data.discountPercent)) {
      return reply.status(500).send({ error: "Errore token sconto" });
    }

    const bill = consolidateBillForTable(app.edgeDb,req.params.id);
    if (needsPin && parsed.data.managerPin) {
      const manager = await verifyManagerPin(app.edgeDb, parsed.data.managerPin);
      if (manager) {
        writeEdgeAudit(app.edgeDb, {
          staffId: manager.id,
          operation: "POS_DISCOUNT_APPLIED",
          severity: "WARNING",
          nextState: {
            tableId: req.params.id,
            lineId: parsed.data.lineId,
            discountPercent: parsed.data.discountPercent,
            authorizedBy,
          },
        });
      }
    }
    return {
      ok: true,
      bill,
      authorizedBy,
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/discount-preset", async (req, reply) => {
    const parsed = applyTableDiscountPresetSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const ctx = resolveTableContext(req.params.id, app.edgeDb);
    if (!ctx) return reply.status(404).send({ error: "Tavolo non trovato" });

    const menu = getMenuSnapshot(app.edgeDb);
    const settings = (menu?.snapshot as MenuSnapshot | undefined)?.settings;
    const maxDiscount = settings?.maxDiscountPercent ?? 20;
    const pinThreshold = settings?.pinDiscountThresholdPercent ?? DEFAULT_PIN_DISCOUNT_THRESHOLD;

    if (parsed.data.percent > maxDiscount) {
      return reply.status(400).send({ error: `Sconto massimo ${maxDiscount}%` });
    }

    const needsPin = parsed.data.percent > pinThreshold;
    let authorizedBy: string | undefined;

    if (needsPin) {
      if (!parsed.data.managerPin) {
        return reply.status(401).send({ error: "PIN manager richiesto per questo sconto" });
      }
      const manager = await verifyManagerPin(app.edgeDb, parsed.data.managerPin);
      if (!manager) return reply.status(401).send({ error: "PIN manager non valido" });
      authorizedBy = `${manager.firstName} ${manager.lastName}`;
    }

    const token = needsPin ? createDiscountToken(parsed.data.percent) : undefined;
    const result = applyTableDiscount(
      req.params.id,
      parsed.data.percent,
      token,
      parsed.data.presetLabel,
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });

    if (token && !consumeDiscountToken(token, parsed.data.percent)) {
      return reply.status(500).send({ error: "Errore token sconto" });
    }

    if (needsPin && parsed.data.managerPin) {
      const manager = await verifyManagerPin(app.edgeDb, parsed.data.managerPin);
      if (manager) {
        writeEdgeAudit(app.edgeDb, {
          staffId: manager.id,
          operation: "POS_DISCOUNT_PRESET_APPLIED",
          severity: "WARNING",
          nextState: {
            tableId: req.params.id,
            presetId: parsed.data.presetId,
            presetLabel: parsed.data.presetLabel,
            discountPercent: parsed.data.percent,
            updatedLines: result.updatedLines,
            authorizedBy,
          },
        });
      }
    }

    return {
      ok: true,
      bill: consolidateBillForTable(app.edgeDb, req.params.id),
      updatedLines: result.updatedLines,
      authorizedBy,
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/discount-clear", async (req, reply) => {
    const ctx = resolveTableContext(req.params.id, app.edgeDb);
    if (!ctx) return reply.status(404).send({ error: "Tavolo non trovato" });

    const result = clearTableDiscounts(req.params.id);
    if (!result.ok) return reply.status(400).send({ error: result.error });

    return {
      ok: true,
      bill: consolidateBillForTable(app.edgeDb, req.params.id),
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/split/roman", async (req, reply) => {
    const parsed = romanSplitSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const ctx = resolveTableContext(req.params.id, app.edgeDb);
    if (!ctx) return reply.status(404).send({ error: "Tavolo non trovato" });

    const bill = consolidateBillForTable(app.edgeDb,req.params.id);
    if (bill.lines.length === 0) {
      return reply.status(400).send({ error: "Nessuna voce da dividere" });
    }

    if (hasActiveSplit(req.params.id)) {
      return reply.status(409).send({ error: "Split già attivo su questo tavolo" });
    }

    const split = startRomanSplit(req.params.id, parsed.data.shares, bill.total);
    broadcastTableStatus(req.params.id, "SPLIT_IN_PROGRESS");

    return {
      ok: true,
      romanSplit: {
        shares: split.shares,
        shareAmounts: split.shareAmounts,
        paidShares: split.paidShares,
        remainingShares: split.shares,
        nextShareAmount: split.shareAmounts[0],
      },
      bill: consolidateBillForTable(app.edgeDb,req.params.id),
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/split/analytic", async (req, reply) => {
    const parsed = analyticSplitSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const ctx = resolveTableContext(req.params.id, app.edgeDb);
    if (!ctx) return reply.status(404).send({ error: "Tavolo non trovato" });

    const bill = consolidateBillForTable(app.edgeDb,req.params.id);
    if (bill.lines.length === 0) {
      return reply.status(400).send({ error: "Nessuna voce da dividere" });
    }

    const lineIds = new Set(bill.lines.map((l) => l.id));

    if (parsed.data.checks) {
      const seen = new Set<string>();
      for (const check of parsed.data.checks) {
        for (const lineId of check.lineIds) {
          if (!lineIds.has(lineId)) {
            return reply.status(400).send({ error: `Riga ${lineId} non valida` });
          }
          if (seen.has(lineId)) {
            return reply.status(400).send({ error: "Riga assegnata a più conti" });
          }
          seen.add(lineId);
        }
      }

      let split = getAnalyticSplit(req.params.id);
      if (!split) {
        if (hasActiveSplit(req.params.id)) {
          return reply.status(409).send({ error: "Altro split già attivo" });
        }
        split = startAnalyticSplit(req.params.id, parsed.data.checks.length);
        broadcastTableStatus(req.params.id, "SPLIT_IN_PROGRESS");
      }

      const result = updateAnalyticSplit(req.params.id, parsed.data.checks);
      if (!result.ok) return reply.status(400).send({ error: result.error });

      return {
        ok: true,
        bill: consolidateBillForTable(app.edgeDb,req.params.id),
      };
    }

    const checkCount = parsed.data.checkCount ?? 2;
    if (hasActiveSplit(req.params.id)) {
      return reply.status(409).send({ error: "Split già attivo su questo tavolo" });
    }

    startAnalyticSplit(req.params.id, checkCount);
    broadcastTableStatus(req.params.id, "SPLIT_IN_PROGRESS");

    return {
      ok: true,
      bill: consolidateBillForTable(app.edgeDb,req.params.id),
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/split/cancel", async (req, reply) => {
    const ctx = resolveTableContext(req.params.id, app.edgeDb);
    if (!ctx) return reply.status(404).send({ error: "Tavolo non trovato" });

    const result = cancelActiveSplit(req.params.id);
    if (!result.ok) return reply.status(409).send({ error: result.error });

    broadcastTableStatus(req.params.id, "OCCUPIED");
    return {
      ok: true,
      bill: consolidateBillForTable(app.edgeDb, req.params.id),
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/prebill", async (req, reply) => {
    const ctx = resolveTableContext(req.params.id, app.edgeDb);
    if (!ctx) return reply.status(404).send({ error: "Tavolo non trovato" });

    const bill = consolidateBillForTable(app.edgeDb,req.params.id);
    if (bill.lines.length === 0) {
      return reply.status(400).send({ error: "Nessuna voce da stampare" });
    }

    const printer =
      app.edgeDb.select().from(printers).all().find((p) => p.enabled && p.workCenter === "BAR") ??
      app.edgeDb.select().from(printers).all().find((p) => p.enabled);

    const payload = buildPrebillTicket({
      tableLabel: ctx.label,
      lines: bill.lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        lineTotal: l.lineTotal,
      })),
      total: bill.total,
    });

    const printResult = await hardware.printEscPos(
      printer?.id ?? "cassa",
      payload,
      `prebill-${req.params.id}`,
    );

    setBillRequested(req.params.id);
    broadcastTableStatus(req.params.id, "BILL_REQUESTED");

    return {
      ok: true,
      bill,
      printResult,
      status: "BILL_REQUESTED" as const,
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/pay", async (req, reply) => {
    const parsed = payTableSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const ctx = resolveTableContext(req.params.id, app.edgeDb);
    if (!ctx) return reply.status(404).send({ error: "Tavolo non trovato" });

    const roman = getRomanSplit(req.params.id);
    const analytic = getAnalyticSplit(req.params.id);

    let splitMode: "FULL" | "ROMAN" | "ANALYTIC" = "FULL";
    if (parsed.data.splitMode === "ANALYTIC" || (analytic && parsed.data.checkId)) {
      splitMode = "ANALYTIC";
    } else if (parsed.data.splitMode === "ROMAN" || roman) {
      splitMode = "ROMAN";
    }

    if (roman && splitMode === "FULL") {
      return reply.status(400).send({
        error: "Split romano attivo — paga le quote singolarmente",
      });
    }
    if (analytic && splitMode === "FULL") {
      return reply.status(400).send({
        error: "Split analitico attivo — paga i singoli conti",
      });
    }
    if (splitMode === "ANALYTIC" && !parsed.data.checkId) {
      return reply.status(400).send({ error: "checkId obbligatorio per split analitico" });
    }

    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();

    const result = await executeTablePayment({
      edgeDb: app.edgeDb,
      tableId: req.params.id,
      locationId: state?.locationId ?? "unknown",
      paymentMethod: parsed.data.paymentMethod,
      paymentSplits: parsed.data.paymentSplits,
      amountReceived: parsed.data.amountReceived,
      splitMode,
      checkId: parsed.data.checkId,
      paymentRequestId: parsed.data.paymentRequestId,
      shiftId: parsed.data.shiftId,
      operatorId: parsed.data.operatorId,
      operatorName: parsed.data.operatorName,
      tableLabel: ctx.label,
      isVirtual: ctx.isVirtual,
      virtualType: ctx.virtualType,
      documentType: parsed.data.documentType,
      invoiceCustomer: parsed.data.invoiceCustomer,
      fullMealReceipt: parsed.data.fullMealReceipt,
      guests: getTableRuntime(req.params.id).guests ?? ctx.defaultGuests ?? undefined,
    });

    if (!result.ok) {
      return reply.status(result.status ?? 400).send({ error: result.error });
    }

    return {
      ok: true,
      receipt: result.receipt,
      receiptPath: result.receiptPath,
      change: result.change,
      tableId: req.params.id,
      status: result.tableFreed ? ("FREE" as const) : ("SPLIT_IN_PROGRESS" as const),
      romanSplitComplete: result.romanSplitComplete,
      analyticSplitComplete: result.analyticSplitComplete,
      paidShares: result.paidShares,
      totalShares: result.totalShares,
      paidCheckId: result.paidCheckId,
      invoice: result.invoice,
      bill: result.tableFreed ? null : consolidateBillForTable(app.edgeDb,req.params.id),
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/payment-requests/:id/reject", async (req, reply) => {
    const rejected = rejectPaymentRequest(req.params.id);
    if (!rejected) return reply.status(404).send({ error: "Richiesta non trovata" });

    broadcast({
      type: "PAYMENT_REJECTED",
      payload: { requestId: req.params.id },
      timestamp: new Date().toISOString(),
      messageId: randomUUID(),
    });

    return { ok: true };
  });

  app.post("/api/pos/counter-sale", async (req, reply) => {
    const parsed = counterSaleSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const virtualTable = findVirtualTable(app.edgeDb, parsed.data.channel);
    if (!virtualTable) {
      return reply.status(404).send({ error: "Tavolo virtuale non configurato" });
    }

    const now = new Date().toISOString();
    const lines: OrderLine[] = parsed.data.lines.map((l) => ({
      id: l.id ?? randomUUID(),
      productId: l.productId,
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      basePrice: l.basePrice,
      channel: parsed.data.channel,
      notes: l.notes,
      variants: l.variants,
      course: l.course,
      hold: l.hold,
      dessertDefer: l.dessertDefer,
    }));

    const order: TableOrder = {
      id: randomUUID(),
      tableId: virtualTable.id,
      operatorId: parsed.data.operatorId,
      operatorName: parsed.data.operatorName,
      channel: parsed.data.channel,
      lines,
      createdAt: now,
      updatedAt: now,
      submittedAt: now,
    };

    const existingDraft = getOrderByTable(virtualTable.id);
    if (existingDraft) {
      return reply.status(409).send({ error: "Bozza aperta sul tavolo virtuale — completa o annulla prima" });
    }

    upsertOrder(order);
    markOrderSubmitted(order.id);

    const bill = consolidateBillForTable(app.edgeDb,virtualTable.id);
    return reply.status(201).send({
      ok: true,
      orderId: order.id,
      tableId: virtualTable.id,
      tableLabel: virtualTable.label,
      bill,
    });
  });
}
