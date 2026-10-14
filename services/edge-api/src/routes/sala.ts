import { randomUUID } from "node:crypto";
import { rooms, tables } from "@pizzaguys/edge-db";
import {
  createRoomSchema,
  createTableSchema,
  reorderTablesSchema,
  updateTableSchema,
} from "@pizzaguys/validators";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireUserAdmin } from "../lib/operator-sessions.js";
import { applyTableOrder, nextTableSortOrder } from "../lib/table-order.js";

export async function salaRoutes(app: FastifyInstance) {
  const admin = requireUserAdmin(app.edgeDb);

  app.get("/api/rooms", async (_req, reply) => {
    const rows = app.edgeDb.select().from(rooms).orderBy(asc(rooms.sortOrder)).all();
    return rows;
  });

  app.post("/api/rooms", { preHandler: admin }, async (req, reply) => {
    const parsed = createRoomSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const row = {
      id: randomUUID(),
      name: parsed.data.name,
      sortOrder: parsed.data.sortOrder ?? 0,
      applyCoverCharge: parsed.data.applyCoverCharge ?? true,
      createdAt: new Date().toISOString(),
    };
    app.edgeDb.insert(rooms).values(row).run();
    return reply.status(201).send(row);
  });

  app.delete<{ Params: { id: string } }>("/api/rooms/:id", { preHandler: admin }, async (req, reply) => {
    const deleted = app.edgeDb.delete(rooms).where(eq(rooms.id, req.params.id)).returning().get();
    if (!deleted) return reply.status(404).send({ error: "Sala non trovata" });
    return { ok: true };
  });

  app.get("/api/tables", async (req) => {
    const roomId = (req.query as { roomId?: string }).roomId;
    if (roomId) {
      return app.edgeDb.select().from(tables).where(eq(tables.roomId, roomId)).orderBy(asc(tables.sortOrder)).all();
    }
    return app.edgeDb.select().from(tables).orderBy(asc(tables.sortOrder)).all();
  });

  app.post("/api/tables", { preHandler: admin }, async (req, reply) => {
    const parsed = createTableSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const row = {
      id: randomUUID(),
      roomId: parsed.data.roomId ?? null,
      label: parsed.data.label,
      x: parsed.data.x,
      y: parsed.data.y,
      width: parsed.data.width ?? 80,
      height: parsed.data.height ?? 80,
      defaultGuests: parsed.data.defaultGuests ?? 2,
      isVirtual: parsed.data.isVirtual ?? false,
      virtualType: parsed.data.virtualType ?? null,
      sortOrder: parsed.data.isVirtual ? 0 : nextTableSortOrder(app.edgeDb, parsed.data.roomId ?? null),
      createdAt: new Date().toISOString(),
    };
    app.edgeDb.insert(tables).values(row).run();
    return reply.status(201).send(row);
  });

  app.put("/api/tables/order", { preHandler: admin }, async (req, reply) => {
    const parsed = reorderTablesSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const result = applyTableOrder(app.edgeDb, parsed.data.roomId, parsed.data.tableIds);
    if (!result.ok) return reply.status(409).send({ error: result.error });
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>("/api/tables/:id", { preHandler: admin }, async (req, reply) => {
    const parsed = updateTableSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const updated = app.edgeDb
      .update(tables)
      .set(parsed.data)
      .where(eq(tables.id, req.params.id))
      .returning()
      .get();
    if (!updated) return reply.status(404).send({ error: "Tavolo non trovato" });
    return updated;
  });

  app.delete<{ Params: { id: string } }>("/api/tables/:id", { preHandler: admin }, async (req, reply) => {
    const deleted = app.edgeDb.delete(tables).where(eq(tables.id, req.params.id)).returning().get();
    if (!deleted) return reply.status(404).send({ error: "Tavolo non trovato" });
    return { ok: true };
  });
}
