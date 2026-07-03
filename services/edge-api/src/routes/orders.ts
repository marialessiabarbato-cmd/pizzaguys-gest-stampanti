import { randomUUID } from "node:crypto";
import { buildCancelTicket, buildKitchenTicket } from "@pizzaguys/escpos";
import { isLinePriceValid } from "@pizzaguys/fiscal";
import { categoryRouting, edgeState, printers, tables } from "@pizzaguys/edge-db";
import {
  authorizeDiscountSchema,
  callCourseSchema,
  releaseDessertSchema,
  stornoLineSchema,
  updateTableGuestsSchema,
  upsertOrderSchema,
} from "@pizzaguys/validators";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createHardwareBridge } from "@pizzaguys/hardware-bridge";
import { writeEdgeAudit } from "../lib/audit.js";
import {
  getCounterOrder,
  resolveTableContext,
} from "../lib/counter-order.js";
import { recordDayStorno } from "../lib/day-report-ledger.js";
import { getMenuSnapshot } from "../lib/provision.js";
import {
  bumpChargedGuests,
  consumeDiscountToken,
  createDiscountToken,
  getKdsSnapshot,
  getOrder,
  getOrderByTable,
  getSubmittedOrdersByTable,
  getTableRuntime,
  markOrderSubmitted,
  recordKdsCancellation,
  rebuildKdsTicketsForOrder,
  releaseLock,
  requestLock,
  setTableOccupied,
  releaseDessertQueue,
  stornoLine,
  updateTableGuests,
  type OrderLine,
  type TableOrder,
  upsertOrder,
} from "../lib/runtime.js";
import { broadcastKdsUpdate } from "../lib/kds-broadcast.js";
import { broadcast, broadcastTableStatus } from "../lib/ws-hub.js";
import { processCallCourse } from "../lib/call-course.js";
import { getActiveStaffById, verifyManagerPin } from "../lib/staff-auth.js";
import { parseGuestCount, effectiveCapacityForTable } from "../lib/table-capacity.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

type MenuProduct = {
  id: string;
  categoryId: string;
  hold?: boolean;
  dessert?: boolean;
};

type MenuCategory = { id: string; hold?: boolean; dessert?: boolean };

type MenuSnapshot = {
  products?: MenuProduct[];
  categories?: MenuCategory[];
  settings?: { maxDiscountPercent?: number };
};

function variantLabels(line: OrderLine): string[] {
  return (line.variants ?? []).map((v) => (v.type === "REMOVE" ? `NO ${v.name}` : v.name));
}

function resolveOrderTableLabel(edgeDb: FastifyInstance["edgeDb"], tableId: string): string {
  return resolveTableContext(tableId, edgeDb)?.label ?? tableId;
}

function validateOrderLines(
  lines: OrderLine[],
  maxDiscount: number,
): { ok: true } | { ok: false; error: string } {
  for (const line of lines) {
    const base = line.basePrice ?? line.unitPrice;
    const fiscalVariants = (line.variants ?? []).map((v) => ({
      type: v.type,
      priceDelta: v.priceDelta,
    }));
    if (!isLinePriceValid(base, fiscalVariants)) {
      return { ok: false, error: `Prezzo non valido per ${line.name}` };
    }
    if (line.discountPercent && line.discountPercent > maxDiscount) {
      return { ok: false, error: `Sconto oltre il massimo (${maxDiscount}%)` };
    }
    if (line.discountPercent && line.discountPercent > 0 && !line.discountToken) {
      return { ok: false, error: "Sconto critico richiede autorizzazione PIN" };
    }
  }
  return { ok: true };
}

export async function orderRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { tableId?: string } }>("/api/orders", async (req) => {
    if (req.query.tableId) {
      const draft = getOrderByTable(req.query.tableId);
      const submitted = getSubmittedOrdersByTable(req.query.tableId);
      return { draft: draft ?? null, submitted };
    }
    return { draft: null, submitted: [] };
  });

  app.get("/api/kds/tickets", async () => getKdsSnapshot());

  app.get("/api/tables/live", async () => {
    const dbTables = app.edgeDb.select().from(tables).all();
    return dbTables.map((t) => {
      const runtime = getTableRuntime(t.id);
      return {
        ...t,
        status: runtime.status,
        lockedBy: runtime.lockedBy,
        lockedByName: runtime.lockedByName,
        guests: runtime.guests,
        tableCapacity: runtime.tableCapacity,
        linkedTableIds: runtime.linkedTableIds,
        mergedIntoTableId: runtime.mergedIntoTableId,
        roomId: t.roomId,
      };
    });
  });

  app.patch<{ Params: { id: string } }>("/api/tables/:id/guests", async (req, reply) => {
    const parsed = updateTableGuestsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const table = app.edgeDb.select().from(tables).where(eq(tables.id, req.params.id)).get();
    if (!table || table.isVirtual) {
      return reply.status(404).send({ error: "Tavolo non trovato" });
    }

    const operator = getActiveStaffById(app.edgeDb, parsed.data.operatorId);
    if (!operator) return reply.status(401).send({ error: "Operatore non valido" });

    const runtime = getTableRuntime(req.params.id);
    if (runtime.status === "FREE") {
      return reply.status(409).send({ error: "Tavolo non aperto" });
    }

    const capacity = effectiveCapacityForTable(app.edgeDb, req.params.id);
    const guestsParsed = parseGuestCount(parsed.data.guests, capacity);
    if (!guestsParsed.ok) {
      return reply.status(400).send({ error: guestsParsed.error });
    }

    updateTableGuests(req.params.id, guestsParsed.guests!);
    const updated = getTableRuntime(req.params.id);
    broadcastTableStatus(req.params.id, updated.status);

    return {
      ok: true,
      tableId: req.params.id,
      guests: updated.guests,
      tableCapacity: updated.tableCapacity ?? table.defaultGuests,
    };
  });

  app.post<{ Params: { id: string } }>("/api/tables/:id/lock", async (req, reply) => {
    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    if (state?.status !== "ACTIVE") {
      return reply.status(503).send({ error: "Edge non provisionata" });
    }

    const table = app.edgeDb.select().from(tables).where(eq(tables.id, req.params.id)).get();
    const counter = getCounterOrder(req.params.id);
    if (!table && !counter) return reply.status(404).send({ error: "Tavolo non trovato" });

    const body = req.body as {
      operatorId?: string;
      operatorName?: string;
      overridePin?: string;
      guests?: number;
    };
    if (!body.operatorId || !body.operatorName) {
      return reply.status(400).send({ error: "operatorId e operatorName richiesti" });
    }

    let force = false;
    if (body.overridePin) {
      const manager = await verifyManagerPin(app.edgeDb, body.overridePin);
      if (!manager) return reply.status(401).send({ error: "PIN sblocco non valido" });
      force = true;
    }

    const guestsParsed = counter
      ? ({ ok: true as const, guests: undefined })
      : parseGuestCount(
          typeof body.guests === "number" ? body.guests : undefined,
          effectiveCapacityForTable(app.edgeDb, req.params.id),
        );
    if (!guestsParsed.ok) {
      return reply.status(400).send({ error: guestsParsed.error });
    }
    const guests = guestsParsed.guests;

    const result = requestLock(req.params.id, body.operatorId, body.operatorName, force, guests);
    if (!result.granted) {
      return reply.status(409).send({ error: result.reason ?? "Lock negato" });
    }

    const runtime = getTableRuntime(req.params.id);
    broadcast({
      type: "TABLE_LOCKED_BROADCAST",
      payload: {
        tableId: req.params.id,
        operatorId: body.operatorId,
        operatorName: body.operatorName,
        status: "LOCKED",
        guests: runtime.guests,
      },
      timestamp: new Date().toISOString(),
      messageId: randomUUID(),
    });

    return {
      tableId: req.params.id,
      status: runtime.status,
      lockedBy: runtime.lockedBy,
      lockedByName: runtime.lockedByName,
      guests: runtime.guests,
      tableCapacity: runtime.tableCapacity ?? table?.defaultGuests,
      linkedTableIds: runtime.linkedTableIds,
    };
  });

  app.post<{ Params: { id: string } }>("/api/tables/:id/unlock", async (req, reply) => {
    const body = req.body as { operatorId?: string };
    if (!body.operatorId) {
      return reply.status(400).send({ error: "operatorId richiesto" });
    }

    const released = releaseLock(req.params.id, body.operatorId);
    if (!released) {
      return reply.status(409).send({ error: "Impossibile sbloccare il tavolo" });
    }

    const runtime = getTableRuntime(req.params.id);
    broadcastTableStatus(req.params.id, runtime.status);
    return { ok: true, status: runtime.status };
  });

  app.post("/api/staff/authorize-discount", async (req, reply) => {
    const parsed = authorizeDiscountSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const manager = await verifyManagerPin(app.edgeDb, parsed.data.managerPin);
    if (!manager) return reply.status(401).send({ error: "PIN manager non valido" });

    const menu = getMenuSnapshot(app.edgeDb);
    const maxDiscount = (menu?.snapshot as MenuSnapshot | undefined)?.settings?.maxDiscountPercent ?? 20;
    if (parsed.data.discountPercent > maxDiscount) {
      return reply.status(400).send({ error: `Sconto massimo ${maxDiscount}%` });
    }

    const token = createDiscountToken(parsed.data.discountPercent);
    writeEdgeAudit(app.edgeDb, {
      staffId: manager.id,
      operation: "DISCOUNT_AUTHORIZED",
      severity: "WARNING",
      nextState: {
        discountPercent: parsed.data.discountPercent,
        authorizedBy: `${manager.firstName} ${manager.lastName}`,
      },
    });
    return { token, percent: parsed.data.discountPercent, authorizedBy: `${manager.firstName} ${manager.lastName}` };
  });

  app.post("/api/orders", async (req, reply) => {
    const parsed = upsertOrderSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const menu = getMenuSnapshot(app.edgeDb);
    const maxDiscount = (menu?.snapshot as MenuSnapshot | undefined)?.settings?.maxDiscountPercent ?? 20;

    const existing = getOrderByTable(parsed.data.tableId);
    const now = new Date().toISOString();
    const lines: OrderLine[] = parsed.data.lines.map((l) => ({
      id: l.id ?? randomUUID(),
      productId: l.productId,
      name: l.name,
      quantity: l.quantity,
      unitPrice: l.unitPrice,
      basePrice: l.basePrice,
      channel: l.channel,
      notes: l.notes,
      variants: l.variants,
      course: l.course,
      hold: l.hold,
      dessertDefer: l.dessertDefer,
      discountPercent: l.discountPercent,
      discountToken: l.discountToken,
    }));

    const validation = validateOrderLines(lines, maxDiscount);
    if (!validation.ok) return reply.status(400).send({ error: validation.error });

    const order: TableOrder = {
      id: existing?.id ?? randomUUID(),
      tableId: parsed.data.tableId,
      operatorId: parsed.data.operatorId,
      operatorName: parsed.data.operatorName,
      channel: parsed.data.channel,
      lines,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
    };

    upsertOrder(order);
    return reply.status(existing ? 200 : 201).send(order);
  });

  app.post<{ Params: { id: string } }>("/api/orders/:id/submit", async (req, reply) => {
    const order = getOrder(req.params.id);
    if (!order) return reply.status(404).send({ error: "Ordine non trovato" });
    if (order.submittedAt) return reply.status(409).send({ error: "Ordine già inviato" });

    const menu = getMenuSnapshot(app.edgeDb);
    const snapshot = menu?.snapshot as MenuSnapshot | undefined;
    const maxDiscount = snapshot?.settings?.maxDiscountPercent ?? 20;
    const validation = validateOrderLines(order.lines, maxDiscount);
    if (!validation.ok) return reply.status(400).send({ error: validation.error });

    for (const line of order.lines) {
      if (line.discountPercent && line.discountPercent > 0 && line.discountToken) {
        if (!consumeDiscountToken(line.discountToken, line.discountPercent)) {
          return reply.status(400).send({ error: "Token sconto non valido o già usato" });
        }
      }
    }

    const table = app.edgeDb.select().from(tables).where(eq(tables.id, order.tableId)).get();
    const counter = getCounterOrder(order.tableId);
    const runtime = getTableRuntime(order.tableId);
    const guestCount = counter ? 1 : runtime.guests ?? table?.defaultGuests ?? 2;
    const routing = app.edgeDb.select().from(categoryRouting).all();
    const printerList = app.edgeDb.select().from(printers).all();

    const byCenter = new Map<string, OrderLine[]>();
    for (const line of order.lines) {
      const product = snapshot?.products?.find((p) => p.id === line.productId);
      const categoryId = product?.categoryId;
      const route = routing.find((r) => r.categoryId === categoryId);
      const center = route?.workCenter ?? "PIZZERIA";
      const group = byCenter.get(center) ?? [];
      group.push(line);
      byCenter.set(center, group);
    }

    const printResults = [];
    for (const [center, lines] of byCenter) {
      const activeLines = lines.filter((l) => !l.dessertDefer);
      if (activeLines.length === 0) continue;
      const printer = printerList.find((p) => p.workCenter === center && p.enabled);
      const hold = activeLines.some((l) => l.hold);
      const payload = buildKitchenTicket({
        workCenter: center,
        tableLabel: resolveOrderTableLabel(app.edgeDb, order.tableId),
        guests: guestCount,
        operatorName: order.operatorName,
        hold,
        lines: activeLines.map((l) => ({
          name: l.name,
          quantity: l.quantity,
          variants: variantLabels(l),
        })),
      });
      const result = await hardware.printEscPos(printer?.id ?? center.toLowerCase(), payload, order.id);
      printResults.push(result);
    }

    markOrderSubmitted(order.id);
    rebuildKdsTicketsForOrder(
      getOrder(order.id)!,
      resolveOrderTableLabel(app.edgeDb, order.tableId),
    );
    broadcastKdsUpdate();
    setTableOccupied(order.tableId);
    bumpChargedGuests(order.tableId, guestCount);

    return {
      ok: true,
      printResults,
      kdsTickets: getKdsSnapshot().tickets,
      orderId: order.id,
      tableId: order.tableId,
      tableLabel: resolveOrderTableLabel(app.edgeDb, order.tableId),
    };
  });

  app.post<{ Params: { id: string } }>("/api/orders/:id/storno", async (req, reply) => {
    const parsed = stornoLineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const operator = getActiveStaffById(app.edgeDb, parsed.data.operatorId);
    if (!operator) return reply.status(401).send({ error: "Operatore non valido" });

    const order = getOrder(req.params.id);
    if (!order) return reply.status(404).send({ error: "Ordine non trovato" });

    const result = stornoLine(req.params.id, parsed.data.lineId, parsed.data.quantity);
    if (!result.ok) return reply.status(400).send({ error: result.error });

    const line = order.lines.find((l) => l.id === parsed.data.lineId);
    if (!line) return reply.status(404).send({ error: "Riga non trovata" });

    const table = app.edgeDb.select().from(tables).where(eq(tables.id, order.tableId)).get();
    const qty = parsed.data.quantity ?? line.quantity - (line.voidedQuantity ?? 0);
    const stornoBy = parsed.data.operatorName.trim();
    const payload = buildCancelTicket({
      tableLabel: resolveOrderTableLabel(app.edgeDb, order.tableId),
      itemName: line.name,
      quantity: qty,
      operatorName: order.operatorName,
      authorizedBy: stornoBy,
    });
    const printResult = await hardware.printEscPos("printer-cucina", payload, `storno-${parsed.data.lineId}`);

    const value = Math.round(line.unitPrice * qty * 100) / 100;
    recordDayStorno(app.edgeDb, new Date().toISOString().slice(0, 10), {
      at: new Date().toISOString(),
      tableLabel: resolveOrderTableLabel(app.edgeDb, order.tableId),
      itemName: line.name,
      quantity: qty,
      amount: value,
      operatorName: stornoBy,
    });
    writeEdgeAudit(app.edgeDb, {
      staffId: operator.id,
      operation: "ORDER_STORNO",
      severity: "WARNING",
      nextState: {
        orderId: order.id,
        tableId: order.tableId,
        lineId: parsed.data.lineId,
        itemName: line.name,
        quantity: qty,
        value,
        operatorId: order.operatorId,
        operatorName: order.operatorName,
        stornoBy,
      },
    });

    const tableLabel = resolveOrderTableLabel(app.edgeDb, order.tableId);
    const updatedOrder = getOrder(order.id)!;
    rebuildKdsTicketsForOrder(updatedOrder, tableLabel);
    const cancellation = recordKdsCancellation({
      tableLabel,
      course: line.course ?? 1,
      itemName: line.name,
      quantity: qty,
      cancelledAt: new Date().toISOString(),
    });
    broadcastKdsUpdate({ cancellation });

    return { ok: true, line: result.line, printResult, cancellation };
  });

  app.post("/api/orders/call-course", async (req, reply) => {
    const parsed = callCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const result = await processCallCourse(app, parsed.data.tableId, parsed.data.course);
    return result;
  });

  app.post("/api/orders/release-dessert", async (req, reply) => {
    const parsed = releaseDessertSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const table = app.edgeDb.select().from(tables).where(eq(tables.id, parsed.data.tableId)).get();
    const runtime = getTableRuntime(parsed.data.tableId);
    const guestCount = runtime.guests ?? table?.defaultGuests ?? 2;
    const released = releaseDessertQueue(parsed.data.tableId);

    const routing = app.edgeDb.select().from(categoryRouting).all();
    const printerList = app.edgeDb.select().from(printers).all();
    const menu = getMenuSnapshot(app.edgeDb);
    const snapshot = menu?.snapshot as MenuSnapshot | undefined;

    for (const ticket of released) {
      const byCenter = new Map<string, typeof ticket.lines>();
      for (const line of ticket.lines) {
        byCenter.set("PIZZERIA", [...(byCenter.get("PIZZERIA") ?? []), line]);
      }
      for (const [center, lines] of byCenter) {
        const printer = printerList.find((p) => p.workCenter === center && p.enabled);
        const payload = buildKitchenTicket({
          workCenter: center,
          tableLabel: resolveOrderTableLabel(app.edgeDb, parsed.data.tableId),
          guests: guestCount,
          operatorName: "X DOLCE",
          lines,
        });
        await hardware.printEscPos(printer?.id ?? center.toLowerCase(), payload, ticket.id);
      }
    }

    return { ok: true, released };
  });
}
