import { edgeState } from "@pizzaguys/edge-db";
import { provisionEdgeSchema } from "@pizzaguys/validators";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getMenuSnapshot, provisionEdge } from "../lib/provision.js";
import { checkVenueCapacity, getVenueMaxGuests, totalActiveGuests } from "../lib/table-capacity.js";

interface ShiftReminderWindow {
  day: number;
  start: string;
  end: string;
}

function parseShiftReminderSchedule(raw: string | null | undefined): ShiftReminderWindow[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function statusRoutes(app: FastifyInstance) {
  app.get("/health", async () => {
    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    return {
      ok: true,
      service: "edge-api",
      status: state?.status ?? "UNPROVISIONED",
      locationId: state?.locationId ?? null,
      schemaVersion: state?.schemaVersion ?? 0,
    };
  });

  app.get("/api/status", async () => {
    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    const venueCheck = checkVenueCapacity(app.edgeDb);
    return {
      status: state?.status ?? "UNPROVISIONED",
      locationId: state?.locationId,
      locationName: state?.locationName,
      schemaVersion: state?.schemaVersion ?? 0,
      lastHeartbeatAt: state?.lastHeartbeatAt,
      maxGuestCapacity: getVenueMaxGuests(app.edgeDb),
      activeGuests: totalActiveGuests(),
      venueCapacityWarning: venueCheck.ok ? null : venueCheck.warning,
      shiftReminderSchedule: parseShiftReminderSchedule(state?.shiftReminderSchedule),
    };
  });

  app.get("/api/menu", async (_req, reply) => {
    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    if (state?.status !== "ACTIVE") {
      return reply.status(403).send({ error: "Edge non provisionata" });
    }
    return getMenuSnapshot(app.edgeDb);
  });

  app.post("/api/provision", async (req, reply) => {
    const parsed = provisionEdgeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Token non valido", details: parsed.error.flatten() });
    }

    try {
      const result = await provisionEdge(app.edgeDb, parsed.data.apiToken);
      return {
        ok: true,
        locationId: result.locationId,
        locationName: result.locationName,
        schemaVersion: result.schemaVersion,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "Provisioning fallito";
      return reply.status(502).send({ error: message });
    }
  });
}
