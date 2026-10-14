import { randomUUID } from "node:crypto";
import { rooms, tables } from "@pizzaguys/edge-db";
import { createRoomSchema, createTableSchema, updateTableSchema } from "@pizzaguys/validators";
import { asc, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { requireUserAdmin } from "../lib/operator-sessions.js";
import { getTableRuntime } from "../lib/runtime.js";

const TABLE_IN_USE = "Tavolo in uso (aperto, bloccato o unito): incassalo o liberalo prima di eliminarlo";

export async function salaRoutes(app: FastifyInstance) {
  const admin = requireUserAdmin(app.edgeDb);

  /** I camerieri riconoscono i tavoli dall'etichetta: unica tra i tavoli di sala. */
  const labelTaken = (label: string, excludeId?: string) => {
    const wanted = label.trim().toLowerCase();
    return app.edgeDb
      .select({ id: tables.id, label: tables.label, isVirtual: tables.isVirtual })
      .from(tables)
      .all()
      .some((t) => !t.isVirtual && t.id !== excludeId && t.label.trim().toLowerCase() === wanted);
  };

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
    // I tavoli della sala si eliminano a cascata: nessuno deve avere un conto aperto.
    const inUse = app.edgeDb
      .select({ id: tables.id, label: tables.label })
      .from(tables)
      .where(eq(tables.roomId, req.params.id))
      .all()
      .filter((t) => getTableRuntime(t.id).status !== "FREE");
    if (inUse.length > 0) {
      return reply.status(409).send({
        error: `Tavoli in uso in questa sala: ${inUse.map((t) => t.label).join(", ")}. Liberali prima di eliminarla`,
      });
    }
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
    if (!parsed.data.isVirtual && labelTaken(parsed.data.label)) {
      return reply.status(409).send({ error: `Esiste già un tavolo "${parsed.data.label.trim()}"` });
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
      sortOrder: 0,
      createdAt: new Date().toISOString(),
    };
    app.edgeDb.insert(tables).values(row).run();
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/api/tables/:id", { preHandler: admin }, async (req, reply) => {
    const parsed = updateTableSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    if (parsed.data.label !== undefined && labelTaken(parsed.data.label, req.params.id)) {
      return reply.status(409).send({ error: `Esiste già un tavolo "${parsed.data.label.trim()}"` });
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
    if (getTableRuntime(req.params.id).status !== "FREE") {
      return reply.status(409).send({ error: TABLE_IN_USE });
    }
    const deleted = app.edgeDb.delete(tables).where(eq(tables.id, req.params.id)).returning().get();
    if (!deleted) return reply.status(404).send({ error: "Tavolo non trovato" });
    return { ok: true };
  });
}
