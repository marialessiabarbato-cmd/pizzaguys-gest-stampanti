import {
  arriveReservationSchema,
  assignReservationTableSchema,
  createReservationSchema,
  printReservationsSchema,
  updateReservationSchema,
} from "@pizzaguys/validators";
import type { FastifyInstance } from "fastify";
import {
  assignReservationTable,
  availabilityByShift,
  createReservation,
  deleteReservation,
  getReservation,
  listReservations,
  markReservationArrived,
  printReservationsList,
  restoreReservation,
  summarizeReservationsForDate,
  updateReservation,
  type ReservationShift,
  type ReservationStatus,
} from "../lib/reservations.js";

export async function reservationRoutes(app: FastifyInstance) {
  app.get<{
    Querystring: {
      from?: string;
      to?: string;
      date?: string;
      shift?: ReservationShift | "ALL";
      roomId?: string;
      status?: ReservationStatus | "ALL" | "ACTIVE";
      waitingList?: string;
      q?: string;
    };
  }>("/api/reservations", async (req) => {
    const waitingListOnly = req.query.waitingList === "1" || req.query.waitingList === "true";
    const rows = listReservations(app.edgeDb, {
      from: req.query.from,
      to: req.query.to,
      date: req.query.date,
      shift: req.query.shift,
      roomId: req.query.roomId,
      status: req.query.status,
      waitingListOnly,
      q: req.query.q,
    });
    const date = req.query.date ?? req.query.from ?? new Date().toISOString().slice(0, 10);
    return {
      reservations: rows,
      summary: summarizeReservationsForDate(app.edgeDb, date),
    };
  });

  app.get<{ Querystring: { date?: string } }>("/api/reservations/availability", async (req) => {
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);
    return availabilityByShift(app.edgeDb, date);
  });

  app.post("/api/reservations/print", async (req, reply) => {
    const parsed = printReservationsSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const result = await printReservationsList(app.edgeDb, {
      from: parsed.data.from,
      to: parsed.data.to,
      shift: parsed.data.shift === "ALL" ? undefined : parsed.data.shift,
      roomId: parsed.data.roomId,
      operatorName: parsed.data.operatorName,
    });
    return result;
  });

  app.get<{ Params: { id: string } }>("/api/reservations/:id", async (req, reply) => {
    const row = getReservation(app.edgeDb, req.params.id);
    if (!row) return reply.status(404).send({ error: "Prenotazione non trovata" });
    return row;
  });

  app.post("/api/reservations", async (req, reply) => {
    const parsed = createReservationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const row = createReservation(app.edgeDb, parsed.data);
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/api/reservations/:id", async (req, reply) => {
    const parsed = updateReservationSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const row = updateReservation(app.edgeDb, req.params.id, parsed.data);
    if (!row) return reply.status(404).send({ error: "Prenotazione non trovata" });
    return row;
  });

  app.delete<{ Params: { id: string } }>("/api/reservations/:id", async (req, reply) => {
    const ok = deleteReservation(app.edgeDb, req.params.id);
    if (!ok) return reply.status(404).send({ error: "Prenotazione non trovata" });
    return { ok: true };
  });

  app.post<{ Params: { id: string } }>("/api/reservations/:id/restore", async (req, reply) => {
    const row = restoreReservation(app.edgeDb, req.params.id);
    if (!row) return reply.status(404).send({ error: "Prenotazione non trovata" });
    return row;
  });

  app.post<{ Params: { id: string } }>("/api/reservations/:id/confirm", async (req, reply) => {
    const row = updateReservation(app.edgeDb, req.params.id, { status: "CONFIRMED" });
    if (!row) return reply.status(404).send({ error: "Prenotazione non trovata" });
    return row;
  });

  app.post<{ Params: { id: string } }>("/api/reservations/:id/assign-table", async (req, reply) => {
    const parsed = assignReservationTableSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const result = assignReservationTable(app.edgeDb, req.params.id, parsed.data.tableId);
    if (!result.ok) return reply.status(400).send({ error: result.error });
    return result.reservation;
  });

  app.post<{ Params: { id: string } }>("/api/reservations/:id/arrive", async (req, reply) => {
    const parsed = arriveReservationSchema.safeParse(req.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const result = markReservationArrived(app.edgeDb, req.params.id, {
      openTable: parsed.data.openTable ?? true,
    });
    if (!result.ok) return reply.status(400).send({ error: result.error });
    return result.reservation;
  });

  app.post<{ Params: { id: string } }>("/api/reservations/:id/no-show", async (req, reply) => {
    const row = updateReservation(app.edgeDb, req.params.id, { status: "NO_SHOW" });
    if (!row) return reply.status(404).send({ error: "Prenotazione non trovata" });
    return row;
  });
}
