import { edgeState } from "@pizzaguys/edge-db";
import { getCloudStatus, getSyncQueueSummary, recordCloudOk } from "../lib/cloud-status.js";
import { listConnectedDevices } from "../lib/ws-hub.js";
import { provisionEdgeSchema } from "@pizzaguys/validators";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { checkUserAdmin } from "../lib/operator-sessions.js";
import { getMenuSnapshot, provisionEdge } from "../lib/provision.js";
import { getRestoreInfo } from "../lib/runtime-persistence.js";
import { getCashSessionStatus, suggestCashService } from "../lib/cash-session.js";
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

  /** Device collegati in questo momento (palmari, KDS, cassa) per lo stato rete. */
  app.get("/api/devices/connected", async () => ({ devices: listConnectedDevices() }));

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
      runtimeRestore: getRestoreInfo(),
      cloud: getCloudStatus(),
      syncQueue: getSyncQueueSummary(app.edgeDb),
      cashSession: withSuggestedService(getCashSessionStatus(app.edgeDb)),
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
    // Primo provisioning libero; ricollegare un Edge già attivo è dell'Admin di sede.
    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    if (state?.status === "ACTIVE") {
      const check = checkUserAdmin(app.edgeDb, req);
      if (!check.ok) {
        return reply.status(check.status).send({ error: check.error, code: "ADMIN_REQUIRED" });
      }
    }

    const parsed = provisionEdgeSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Token non valido", details: parsed.error.flatten() });
    }

    try {
      const result = await provisionEdge(app.edgeDb, parsed.data.apiToken);
      // Handshake riuscito: il Cloud accetta il token, lo stato torna verde subito
      recordCloudOk();
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

function withSuggestedService(status: ReturnType<typeof getCashSessionStatus>) {
  return { ...status, suggestedService: suggestCashService(new Date(), status.usedServicesToday) };
}
