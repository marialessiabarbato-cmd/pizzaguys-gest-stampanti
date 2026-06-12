import { randomUUID } from "node:crypto";
import { buildCancelTicket, buildKitchenTicket } from "@pizzaguys/escpos";
import { isLinePriceValid } from "@pizzaguys/fiscal";
import { categoryRouting, printers, tables } from "@pizzaguys/edge-db";
import {
  authorizeDiscountSchema,
  callCourseSchema,
  releaseDessertSchema,
  stornoLineSchema,
  upsertOrderSchema,
} from "@pizzaguys/validators";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createHardwareBridge } from "@pizzaguys/hardware-bridge";
import { writeEdgeAudit } from "../lib/audit.js";
import { getMenuSnapshot } from "../lib/provision.js";
import {
  addKdsTickets,
  callCourse,
  consumeDiscountToken,
  createDiscountToken,
  getKdsTickets,
  getOrder,
  getOrderByTable,
  getSubmittedOrdersByTable,
  getTableRuntime,
  markOrderSubmitted,
  setTableOccupied,
  releaseDessertQueue,
  stornoLine,
  type KdsTicket,
  type OrderLine,
  type TableOrder,
  upsertOrder,
} from "../lib/runtime.js";
import { verifyManagerPin } from "../lib/staff-auth.js";

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

function buildKdsFromOrder(
  order: TableOrder,
  tableLabel: string,
): KdsTicket[] {
  const byCourse = new Map<number, OrderLine[]>();
  for (const line of order.lines) {
    const course = line.course ?? 1;
    const group = byCourse.get(course) ?? [];
    group.push(line);
    byCourse.set(course, group);
  }

  const tickets: KdsTicket[] = [];
  for (const [course, lines] of byCourse) {
    const hold = lines.some((l) => l.hold);
    const dessertQueue = lines.some((l) => l.dessertDefer);
    tickets.push({
      id: randomUUID(),
      orderId: order.id,
      tableId: order.tableId,
      tableLabel,
      course,
      lines: lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        variants: variantLabels(l),
      })),
      submittedAt: new Date().toISOString(),
      hold: hold || dessertQueue,
      dessertQueue,
    });
  }
  return tickets;
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

  app.get("/api/kds/tickets", async () => getKdsTickets());

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
      };
    });
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
    const runtime = getTableRuntime(order.tableId);
    const guestCount = runtime.guests ?? table?.defaultGuests ?? 2;
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
        tableLabel: table?.label ?? order.tableId,
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

    const kdsTickets = buildKdsFromOrder(order, table?.label ?? order.tableId);
    addKdsTickets(kdsTickets);
    markOrderSubmitted(order.id);
    setTableOccupied(order.tableId);

    return {
      ok: true,
      printResults,
      kdsTickets,
      orderId: order.id,
      tableId: order.tableId,
      tableLabel: table?.label ?? order.tableId,
    };
  });

  app.post<{ Params: { id: string } }>("/api/orders/:id/storno", async (req, reply) => {
    const parsed = stornoLineSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const manager = await verifyManagerPin(app.edgeDb, parsed.data.managerPin);
    if (!manager) return reply.status(401).send({ error: "PIN manager non valido" });

    const order = getOrder(req.params.id);
    if (!order) return reply.status(404).send({ error: "Ordine non trovato" });

    const result = stornoLine(req.params.id, parsed.data.lineId, parsed.data.quantity);
    if (!result.ok) return reply.status(400).send({ error: result.error });

    const line = order.lines.find((l) => l.id === parsed.data.lineId);
    if (!line) return reply.status(404).send({ error: "Riga non trovata" });

    const table = app.edgeDb.select().from(tables).where(eq(tables.id, order.tableId)).get();
    const qty = parsed.data.quantity ?? line.quantity - (line.voidedQuantity ?? 0);
    const payload = buildCancelTicket({
      tableLabel: table?.label ?? order.tableId,
      itemName: line.name,
      quantity: qty,
      operatorName: order.operatorName,
      authorizedBy: `${manager.firstName} ${manager.lastName}`,
    });
    const printResult = await hardware.printEscPos("printer-cucina", payload, `storno-${parsed.data.lineId}`);

    const value = Math.round(line.unitPrice * qty * 100) / 100;
    writeEdgeAudit(app.edgeDb, {
      staffId: manager.id,
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
        authorizedBy: `${manager.firstName} ${manager.lastName}`,
      },
    });

    return { ok: true, line: result.line, printResult };
  });

  app.post("/api/orders/call-course", async (req, reply) => {
    const parsed = callCourseSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const released = callCourse(parsed.data.tableId, parsed.data.course);
    return { ok: true, released };
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
          tableLabel: table?.label ?? parsed.data.tableId,
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
