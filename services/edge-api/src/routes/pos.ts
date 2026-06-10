import { randomUUID } from "node:crypto";
import { buildPrebillTicket } from "@pizzaguys/escpos";
import { edgeState, printers, tables } from "@pizzaguys/edge-db";
import {
  analyticSplitSchema,
  applyPosDiscountSchema,
  counterSaleSchema,
  payTableSchema,
  romanSplitSchema,
} from "@pizzaguys/validators";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createHardwareBridge } from "@pizzaguys/hardware-bridge";
import { writeEdgeAudit } from "../lib/audit.js";
import { consolidateTableBill } from "../lib/bill.js";
import { executeTablePayment } from "../lib/payment.js";
import { getMenuSnapshot } from "../lib/provision.js";
import {
  consumeDiscountToken,
  createDiscountToken,
  getAnalyticSplit,
  getOrderByTable,
  getPendingPaymentRequests,
  getRomanSplit,
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
} from "../lib/runtime.js";
import { verifyManagerPin } from "../lib/staff-auth.js";
import { broadcast, broadcastTableStatus } from "../lib/ws-hub.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

type MenuSnapshot = { settings?: { maxDiscountPercent?: number } };

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
  app.get("/api/pos/payment-requests", async () => getPendingPaymentRequests());

  app.get<{ Params: { id: string } }>("/api/pos/tables/:id/bill", async (req, reply) => {
    const table = app.edgeDb.select().from(tables).where(eq(tables.id, req.params.id)).get();
    if (!table) return reply.status(404).send({ error: "Tavolo non trovato" });

    const bill = consolidateTableBill(req.params.id);
    return {
      ...bill,
      tableLabel: table.label,
      isVirtual: table.isVirtual,
      virtualType: table.virtualType,
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/discount", async (req, reply) => {
    const parsed = applyPosDiscountSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const table = app.edgeDb.select().from(tables).where(eq(tables.id, req.params.id)).get();
    if (!table) return reply.status(404).send({ error: "Tavolo non trovato" });

    const manager = await verifyManagerPin(app.edgeDb, parsed.data.managerPin);
    if (!manager) return reply.status(401).send({ error: "PIN manager non valido" });

    const menu = getMenuSnapshot(app.edgeDb);
    const maxDiscount = (menu?.snapshot as MenuSnapshot | undefined)?.settings?.maxDiscountPercent ?? 20;
    if (parsed.data.discountPercent > maxDiscount) {
      return reply.status(400).send({ error: `Sconto massimo ${maxDiscount}%` });
    }

    const token = createDiscountToken(parsed.data.discountPercent);
    const result = applyLineDiscount(
      req.params.id,
      parsed.data.lineId,
      parsed.data.discountPercent,
      token,
    );
    if (!result.ok) return reply.status(404).send({ error: result.error });

    if (!consumeDiscountToken(token, parsed.data.discountPercent)) {
      return reply.status(500).send({ error: "Errore token sconto" });
    }

    const bill = consolidateTableBill(req.params.id);
    writeEdgeAudit(app.edgeDb, {
      staffId: manager.id,
      operation: "POS_DISCOUNT_APPLIED",
      severity: "WARNING",
      nextState: {
        tableId: req.params.id,
        lineId: parsed.data.lineId,
        discountPercent: parsed.data.discountPercent,
        authorizedBy: `${manager.firstName} ${manager.lastName}`,
      },
    });
    return {
      ok: true,
      bill,
      authorizedBy: `${manager.firstName} ${manager.lastName}`,
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/split/roman", async (req, reply) => {
    const parsed = romanSplitSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const table = app.edgeDb.select().from(tables).where(eq(tables.id, req.params.id)).get();
    if (!table) return reply.status(404).send({ error: "Tavolo non trovato" });

    const bill = consolidateTableBill(req.params.id);
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
      bill: consolidateTableBill(req.params.id),
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/split/analytic", async (req, reply) => {
    const parsed = analyticSplitSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const table = app.edgeDb.select().from(tables).where(eq(tables.id, req.params.id)).get();
    if (!table) return reply.status(404).send({ error: "Tavolo non trovato" });

    const bill = consolidateTableBill(req.params.id);
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
        bill: consolidateTableBill(req.params.id),
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
      bill: consolidateTableBill(req.params.id),
    };
  });

  app.post<{ Params: { id: string } }>("/api/pos/tables/:id/prebill", async (req, reply) => {
    const table = app.edgeDb.select().from(tables).where(eq(tables.id, req.params.id)).get();
    if (!table) return reply.status(404).send({ error: "Tavolo non trovato" });

    const bill = consolidateTableBill(req.params.id);
    if (bill.lines.length === 0) {
      return reply.status(400).send({ error: "Nessuna voce da stampare" });
    }

    const printer =
      app.edgeDb.select().from(printers).all().find((p) => p.enabled && p.workCenter === "BAR") ??
      app.edgeDb.select().from(printers).all().find((p) => p.enabled);

    const payload = buildPrebillTicket({
      tableLabel: table.label,
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

    const table = app.edgeDb.select().from(tables).where(eq(tables.id, req.params.id)).get();
    if (!table) return reply.status(404).send({ error: "Tavolo non trovato" });

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
      tableId: req.params.id,
      locationId: state?.locationId ?? "unknown",
      paymentMethod: parsed.data.paymentMethod,
      amountReceived: parsed.data.amountReceived,
      splitMode,
      checkId: parsed.data.checkId,
      paymentRequestId: parsed.data.paymentRequestId,
      shiftId: parsed.data.shiftId,
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
      bill: result.tableFreed ? null : consolidateTableBill(req.params.id),
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

    const bill = consolidateTableBill(virtualTable.id);
    return reply.status(201).send({
      ok: true,
      orderId: order.id,
      tableId: virtualTable.id,
      tableLabel: virtualTable.label,
      bill,
    });
  });
}
