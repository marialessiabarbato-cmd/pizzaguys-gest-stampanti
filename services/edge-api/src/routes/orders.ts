import { randomUUID } from "node:crypto";
import { buildCancelTicket, buildKitchenTicket } from "@pizzaguys/escpos";
import { isLinePriceValid } from "@pizzaguys/fiscal";
import { categoryRouting, edgeState, printers, tables } from "@pizzaguys/edge-db";
import {
  authorizeDiscountSchema,
  callCourseSchema,
  releaseDessertSchema,
  setLinePriceSchema,
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
  getUnionGuestTotal,
  applyGuestsByTable,
  markOrderSubmitted,
  recordKdsCancellation,
  rebuildKdsTicketsForOrder,
  releaseLock,
  requestLock,
  setLineUnitPrice,
  setTableOccupied,
  releaseDessertQueue,
  stornoLine,
  unionMemberIds,
  updateTableGuests,
  type OrderLine,
  type TableOrder,
  upsertOrder,
} from "../lib/runtime.js";
import { broadcastKdsUpdate } from "../lib/kds-broadcast.js";
import { broadcast, broadcastTableStatus } from "../lib/ws-hub.js";
import { processCallCourse } from "../lib/call-course.js";
import { getActiveStaffById, verifyManagerPin } from "../lib/staff-auth.js";
import {
  checkVenueCapacity,
  parseGuestCount,
  effectiveCapacityForTable,
} from "../lib/table-capacity.js";

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

function kitchenTicketTableLabel(
  edgeDb: FastifyInstance["edgeDb"],
  order: TableOrder,
): string {
  const labels = [
    ...new Set(
      order.lines
        .map((l) => l.forTableLabel?.trim())
        .filter((x): x is string => !!x && x.length > 0),
    ),
  ];
  if (labels.length === 1) return labels[0]!;
  return resolveOrderTableLabel(edgeDb, order.tableId);
}

function kitchenLineGuests(orderTableId: string, order: TableOrder): number {
  const forIds = [
    ...new Set(order.lines.map((l) => l.forTableId).filter((x): x is string => !!x)),
  ];
  if (forIds.length === 1) {
    const g = getTableRuntime(forIds[0]!).guests;
    if (g && g > 0) return g;
  }
  return getUnionGuestTotal(orderTableId) || 0;
}

function kitchenLineName(line: OrderLine): string {
  if (!line.forTableLabel) return line.name;
  const short = line.forTableLabel.replace(/^tavolo\s*/i, "").trim() || line.forTableLabel;
  return `[${short}] ${line.name}`;
}

function resolveOrderTableLabel(edgeDb: FastifyInstance["edgeDb"], tableId: string): string {
  return resolveTableContext(tableId, edgeDb)?.label ?? tableId;
}

function validateOrderLines(
  lines: OrderLine[],
  maxDiscount: number,
): { ok: true } | { ok: false; error: string } {
  for (const line of lines) {
    if (line.manualPrice) {
      if (line.unitPrice <= 0) {
        return { ok: false, error: `Prezzo non valido per ${line.name}` };
      }
    } else {
      const base = line.basePrice ?? line.unitPrice;
      const fiscalVariants = (line.variants ?? []).map((v) => ({
        type: v.type,
        priceDelta: v.priceDelta,
      }));
      if (!isLinePriceValid(base, fiscalVariants)) {
        return { ok: false, error: `Prezzo non valido per ${line.name}` };
      }
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
      let openedAt = runtime.openedAt ?? null;
      if (!openedAt && runtime.status !== "FREE") {
        const draft = getOrderByTable(t.id);
        const submitted = getSubmittedOrdersByTable(t.id);
        const times = [draft?.createdAt, ...submitted.map((o) => o.createdAt)].filter(
          Boolean,
        ) as string[];
        if (times.length) openedAt = times.sort()[0]!;
      }
      return {
        ...t,
        status: runtime.status,
        lockedBy: runtime.lockedBy,
        lockedByName: runtime.lockedByName,
        guests: runtime.guests,
        guestTotal: getUnionGuestTotal(t.id),
        tableCapacity: runtime.tableCapacity,
        linkedTableIds: runtime.linkedTableIds,
        mergedIntoTableId: runtime.mergedIntoTableId,
        openedAt,
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
    const isLinkedMember = !!runtime.mergedIntoTableId;
    if (runtime.status === "FREE" && !isLinkedMember) {
      return reply.status(409).send({ error: "Tavolo non aperto" });
    }

    const capacity = effectiveCapacityForTable(app.edgeDb, req.params.id);

    if (parsed.data.guestsByTable) {
      const hostId = runtime.mergedIntoTableId ?? req.params.id;
      const allowed = new Set(unionMemberIds(hostId));
      for (const memberId of Object.keys(parsed.data.guestsByTable)) {
        if (!allowed.has(memberId) && memberId !== req.params.id) {
          return reply.status(400).send({
            error: `Tavolo ${memberId} non fa parte del gruppo`,
          });
        }
      }
      applyGuestsByTable(parsed.data.guestsByTable);
    } else if (parsed.data.guests != null) {
      const guestsParsed = parseGuestCount(parsed.data.guests, capacity);
      if (!guestsParsed.ok) {
        return reply.status(400).send({ error: guestsParsed.error });
      }
      updateTableGuests(req.params.id, guestsParsed.guests!);
    }

    const updated = getTableRuntime(req.params.id);
    const hostId = updated.mergedIntoTableId ?? req.params.id;
    broadcastTableStatus(hostId, getTableRuntime(hostId).status);
    return {
      tableId: req.params.id,
      guests: updated.guests,
      guestTotal: getUnionGuestTotal(hostId),
      tableCapacity: updated.tableCapacity ?? table.defaultGuests,
      guestsByTable: Object.fromEntries(
        unionMemberIds(hostId).map((id) => [id, getTableRuntime(id).guests ?? 0]),
      ),
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
    // LOCKED is excluded from totalActiveGuests — count these covers as additional.
    const venueCheck = checkVenueCapacity(app.edgeDb, getUnionGuestTotal(req.params.id));
    broadcast({
      type: "TABLE_LOCKED_BROADCAST",
      payload: {
        tableId: req.params.id,
        operatorId: body.operatorId,
        operatorName: body.operatorName,
        status: "LOCKED",
        guests: runtime.guests,
        guestTotal: getUnionGuestTotal(req.params.id),
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
      guestTotal: getUnionGuestTotal(req.params.id),
      tableCapacity: runtime.tableCapacity ?? table?.defaultGuests,
      linkedTableIds: runtime.linkedTableIds,
      openedAt: runtime.openedAt ?? null,
      venueCapacityWarning: venueCheck.ok ? null : venueCheck.warning,
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
      forTableId: l.forTableId,
      forTableLabel: l.forTableLabel,
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
    const guestCount = counter
      ? 1
      : kitchenLineGuests(order.tableId, order) ||
        getUnionGuestTotal(order.tableId) ||
        table?.defaultGuests ||
        2;
    const ticketTableLabel = kitchenTicketTableLabel(app.edgeDb, order);
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
        tableLabel: ticketTableLabel,
        guests: guestCount,
        operatorName: order.operatorName,
        hold,
        lines: activeLines.map((l) => ({
          name: kitchenLineName(l),
          quantity: l.quantity,
          variants: variantLabels(l),
        })),
      });
      const result = await hardware.printEscPos(
        printer?.id ?? center.toLowerCase(),
        payload,
        order.id,
        printer ? { host: printer.host, port: printer.port } : undefined,
      );
      printResults.push(result);
    }

    markOrderSubmitted(order.id);
    rebuildKdsTicketsForOrder(getOrder(order.id)!, ticketTableLabel);
    broadcastKdsUpdate();
    setTableOccupied(order.tableId);
    // Chi ha appena inviato l'ordine resta in controllo del tavolo: evita che
    // ricompaia il banner "Prendi" per lo stesso operatore subito dopo SPEDITO.
    requestLock(order.tableId, order.operatorId, order.operatorName, true);
    broadcast({
      type: "TABLE_LOCKED_BROADCAST",
      payload: {
        tableId: order.tableId,
        operatorId: order.operatorId,
        operatorName: order.operatorName,
        status: "LOCKED",
        guests: getTableRuntime(order.tableId).guests,
        guestTotal: getUnionGuestTotal(order.tableId),
      },
      timestamp: new Date().toISOString(),
      messageId: randomUUID(),
    });
    for (const memberId of unionMemberIds(order.tableId)) {
      const g = getTableRuntime(memberId).guests;
      if (g && g > 0) bumpChargedGuests(memberId, g);
    }

    return {
      ok: true,
      printResults,
      kdsTickets: getKdsSnapshot().tickets,
      orderId: order.id,
      tableId: order.tableId,
      tableLabel: ticketTableLabel,
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
    const cucinaPrinter = app.edgeDb
      .select()
      .from(printers)
      .where(eq(printers.workCenter, "CUCINA"))
      .get();
    const printResult = await hardware.printEscPos(
      cucinaPrinter?.id ?? "printer-cucina",
      payload,
      `storno-${parsed.data.lineId}`,
      cucinaPrinter ? { host: cucinaPrinter.host, port: cucinaPrinter.port } : undefined,
    );

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

  app.post("/api/orders/line-price", async (req, reply) => {
    const parsed = setLinePriceSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const operator = getActiveStaffById(app.edgeDb, parsed.data.operatorId);
    if (!operator) return reply.status(401).send({ error: "Operatore non valido" });

    const ctx = resolveTableContext(parsed.data.tableId, app.edgeDb);
    if (!ctx) return reply.status(404).send({ error: "Tavolo non trovato" });

    const result = setLineUnitPrice(
      parsed.data.tableId,
      parsed.data.lineId,
      parsed.data.unitPrice,
      {
        basePrice: parsed.data.basePrice,
        variants: parsed.data.variants,
      },
    );
    if (!result.ok) return reply.status(400).send({ error: result.error });

    writeEdgeAudit(app.edgeDb, {
      staffId: operator.id,
      operation: "ORDER_LINE_PRICE",
      severity: "INFO",
      nextState: {
        tableId: parsed.data.tableId,
        lineId: parsed.data.lineId,
        unitPrice: parsed.data.unitPrice,
        basePrice: parsed.data.basePrice,
        variants: parsed.data.variants,
        operatorName: parsed.data.operatorName.trim(),
        orderId: result.orderId,
      },
    });

    return { ok: true, line: result.line };
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
    const guestCount = getUnionGuestTotal(parsed.data.tableId) || table?.defaultGuests || 2;
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
        await hardware.printEscPos(
          printer?.id ?? center.toLowerCase(),
          payload,
          ticket.id,
          printer ? { host: printer.host, port: printer.port } : undefined,
        );
      }
    }

    return { ok: true, released };
  });
}
