import { edgeState, menuCache } from "@pizzaguys/edge-db";
import { eq, sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { cloudDelta, cloudHeartbeat } from "./cloud.js";
import { applyInvoiceCustomersFromSnapshot } from "./invoice-customers.js";
import { applyStaffFromSnapshot } from "./staff-sync.js";
import { processSyncQueue } from "./sync-queue.js";
import type { MenuSnapshot } from "@pizzaguys/types";

const INTERVAL_MS = 60_000;

export function startHeartbeatLoop(app: FastifyInstance) {
  const tick = async () => {
    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    if (!state || state.status !== "ACTIVE" || !state.apiToken || !state.locationId) return;

    try {
      const result = await cloudHeartbeat(state.apiToken, state.schemaVersion);
      const now = new Date().toISOString();
      app.edgeDb
        .update(edgeState)
        .set({ lastHeartbeatAt: now, updatedAt: now })
        .where(eq(edgeState.id, 1))
        .run();

      if (result && result.desyncBuilds > 0) {
        const delta = await cloudDelta(state.locationId, state.schemaVersion, state.apiToken);
        if (delta?.delta) {
          app.edgeDb.delete(menuCache).run();
          app.edgeDb
            .insert(menuCache)
            .values({
              id: 1,
              schemaVersion: delta.schemaVersion,
              payload: JSON.stringify(delta.delta),
              updatedAt: now,
            })
            .run();
          app.edgeDb
            .update(edgeState)
            .set({ schemaVersion: delta.schemaVersion, updatedAt: now })
            .where(eq(edgeState.id, 1))
            .run();
          const settings = (delta.delta as MenuSnapshot).settings as
            | {
                maxGuestCapacity?: number;
                shiftReminderSchedule?: Array<{ day: number; start: string; end: string }>;
              }
            | undefined;
          if (settings?.maxGuestCapacity != null) {
            app.edgeDb
              .update(edgeState)
              .set({ maxGuestCapacity: settings.maxGuestCapacity, updatedAt: now })
              .where(eq(edgeState.id, 1))
              .run();
          }
          if (settings?.shiftReminderSchedule !== undefined) {
            app.edgeDb
              .update(edgeState)
              .set({
                shiftReminderSchedule: JSON.stringify(settings.shiftReminderSchedule),
                updatedAt: now,
              })
              .where(eq(edgeState.id, 1))
              .run();
          }
          applyInvoiceCustomersFromSnapshot(
            app.edgeDb,
            (delta.delta as MenuSnapshot).invoiceCustomers,
          );
          applyStaffFromSnapshot(app.edgeDb, (delta.delta as MenuSnapshot).staff);
          app.log.info({ schemaVersion: delta.schemaVersion }, "Menu delta applicato");
        }
      }

      await processSyncQueue(app.edgeDb, app.log);
    } catch (err) {
      app.log.warn({ err }, "Heartbeat cloud fallito");
    }
  };

  setInterval(() => void tick(), INTERVAL_MS);
  void tick();
}
