import { randomUUID } from "node:crypto";
import { tables } from "@pizzaguys/edge-db";
import { mergeTablesSchema, transferTableSchema } from "@pizzaguys/validators";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeEdgeAudit } from "../lib/audit.js";
import { broadcastKdsUpdate } from "../lib/kds-broadcast.js";
import {
  projectedGuestsAfterMerge,
  projectedGuestsAfterTransfer,
  combinedTableCapacity,
  effectiveCapacityForTable,
  parseGuestCount,
  validateMergeCapacity,
  validateTransferCapacity,
} from "../lib/table-capacity.js";
import {
  getTableRuntime,
  mergeTablesInto,
  requestLock,
  transferTableAccount,
} from "../lib/runtime.js";
import { getActiveStaffById, verifyManagerPin } from "../lib/staff-auth.js";
import { broadcast, broadcastTableStatus } from "../lib/ws-hub.js";

function tableLabelMap(edgeDb: FastifyInstance["edgeDb"]) {
  const map = new Map<string, string>();
  for (const row of edgeDb.select().from(tables).all()) {
    map.set(row.id, row.label);
  }
  return map;
}

function assertPhysicalTable(
  table: { id: string; isVirtual: boolean; label: string } | undefined,
  role: "sorgente" | "destinazione",
) {
  if (!table) return `Tavolo ${role} non trovato`;
  if (table.isVirtual) return `Il tavolo ${role} non può essere virtuale`;
  return null;
}

async function assertLockOverride(
  app: FastifyInstance,
  tableId: string,
  operatorId: string,
  overridePin?: string,
): Promise<{ ok: true } | { ok: false; error: string; status: number }> {
  const runtime = getTableRuntime(tableId);
  if (runtime.lockedBy && runtime.lockedBy !== operatorId) {
    if (!overridePin) {
      return {
        ok: false,
        error: `Tavolo bloccato da ${runtime.lockedByName ?? "altro operatore"}`,
        status: 409,
      };
    }
    const manager = await verifyManagerPin(app.edgeDb, overridePin);
    if (!manager) return { ok: false, error: "PIN manager non valido", status: 401 };
    requestLock(tableId, operatorId, "Transfer", true);
  }
  return { ok: true };
}

function broadcastTransfer(params: {
  sourceTableIds: string[];
  targetTableId: string;
  operatorId: string;
  movedLineIds: string[];
}) {
  const now = new Date().toISOString();
  for (const tableId of [...params.sourceTableIds, params.targetTableId]) {
    broadcastTableStatus(tableId, getTableRuntime(tableId).status);
  }
  broadcast({
    type: "TABLE_ACCOUNT_MOVED",
    payload: params,
    timestamp: now,
    messageId: randomUUID(),
  });
}

export async function tableTransferRoutes(app: FastifyInstance) {
  app.post("/api/tables/transfer", async (req, reply) => {
    const parsed = transferTableSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const operator = getActiveStaffById(app.edgeDb, parsed.data.operatorId);
    if (!operator) return reply.status(401).send({ error: "Operatore non valido" });

    const labels = tableLabelMap(app.edgeDb);
    const source = app.edgeDb
      .select()
      .from(tables)
      .where(eq(tables.id, parsed.data.sourceTableId))
      .get();
    const target = app.edgeDb
      .select()
      .from(tables)
      .where(eq(tables.id, parsed.data.targetTableId))
      .get();

    const sourceErr = assertPhysicalTable(source, "sorgente");
    if (sourceErr) return reply.status(400).send({ error: sourceErr });
    const targetErr = assertPhysicalTable(target, "destinazione");
    if (targetErr) return reply.status(400).send({ error: targetErr });

    const lockCheck = await assertLockOverride(
      app,
      parsed.data.sourceTableId,
      parsed.data.operatorId,
      parsed.data.overridePin,
    );
    if (!lockCheck.ok) return reply.status(lockCheck.status).send({ error: lockCheck.error });

    const isFullTransfer = !parsed.data.lineIds?.length;
    if (isFullTransfer) {
      const totalGuests = projectedGuestsAfterTransfer(
        parsed.data.sourceTableId,
        parsed.data.targetTableId,
        app.edgeDb,
      );
      const capacityCheck = validateTransferCapacity(
        app.edgeDb,
        parsed.data.sourceTableId,
        parsed.data.targetTableId,
        totalGuests,
      );
      if (!capacityCheck.ok) {
        return reply.status(409).send({
          error: capacityCheck.error,
          totalGuests: capacityCheck.totalGuests,
          capacity: capacityCheck.capacity,
        });
      }
    }

    const result = transferTableAccount({
      sourceTableId: parsed.data.sourceTableId,
      targetTableId: parsed.data.targetTableId,
      lineIds: parsed.data.lineIds,
      operatorId: parsed.data.operatorId,
      operatorName: parsed.data.operatorName,
      sourceTableLabel: source!.label,
      targetTableLabel: target!.label,
    });

    if (!result.ok) return reply.status(409).send({ error: result.error });

    broadcastTransfer({
      sourceTableIds: [parsed.data.sourceTableId],
      targetTableId: parsed.data.targetTableId,
      operatorId: parsed.data.operatorId,
      movedLineIds: result.movedLineIds,
    });
    broadcastKdsUpdate();

    writeEdgeAudit(app.edgeDb, {
      staffId: operator.id,
      operation: parsed.data.lineIds?.length ? "TABLE_TRANSFER_PARTIAL" : "TABLE_TRANSFER",
      severity: "INFO",
      previousState: {
        sourceTableId: parsed.data.sourceTableId,
        sourceLabel: source!.label,
        lineIds: parsed.data.lineIds,
      },
      nextState: {
        targetTableId: parsed.data.targetTableId,
        targetLabel: target!.label,
        movedLineIds: result.movedLineIds,
        sourceStatus: result.sourceStatus,
        targetStatus: result.targetStatus,
      },
    });

    return {
      ok: true,
      movedLineIds: result.movedLineIds,
      sourceStatus: result.sourceStatus,
      targetStatus: result.targetStatus,
      sourceLabel: source!.label,
      targetLabel: target!.label,
    };
  });

  app.post("/api/tables/merge", async (req, reply) => {
    const parsed = mergeTablesSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const operator = getActiveStaffById(app.edgeDb, parsed.data.operatorId);
    if (!operator) return reply.status(401).send({ error: "Operatore non valido" });

    const labels = tableLabelMap(app.edgeDb);
    const target = app.edgeDb
      .select()
      .from(tables)
      .where(eq(tables.id, parsed.data.targetTableId))
      .get();
    const targetErr = assertPhysicalTable(target, "destinazione");
    if (targetErr) return reply.status(400).send({ error: targetErr });

    const uniqueSources = [...new Set(parsed.data.sourceTableIds)].filter(
      (id) => id !== parsed.data.targetTableId,
    );
    if (uniqueSources.length < 1) {
      return reply.status(400).send({
        error: "Seleziona almeno un tavolo da unire oltre alla destinazione",
      });
    }

    const totalGuests = projectedGuestsAfterMerge(
      parsed.data.targetTableId,
      uniqueSources,
      app.edgeDb,
    );
    const capacityCheck = validateMergeCapacity(
      app.edgeDb,
      parsed.data.targetTableId,
      uniqueSources,
      totalGuests,
    );
    if (!capacityCheck.ok) {
      return reply.status(409).send({
        error: capacityCheck.error,
        totalGuests: capacityCheck.totalGuests,
        capacity: capacityCheck.capacity,
      });
    }

    const involved = [...new Set([...uniqueSources, parsed.data.targetTableId])];
    const combinedCapacity = combinedTableCapacity(app.edgeDb, involved);

    for (const sourceId of uniqueSources) {
      const source = app.edgeDb.select().from(tables).where(eq(tables.id, sourceId)).get();
      const err = assertPhysicalTable(source, "sorgente");
      if (err) return reply.status(400).send({ error: err });

      const lockCheck = await assertLockOverride(
        app,
        sourceId,
        parsed.data.operatorId,
        parsed.data.overridePin,
      );
      if (!lockCheck.ok) return reply.status(lockCheck.status).send({ error: lockCheck.error });
    }

    const result = mergeTablesInto({
      sourceTableIds: uniqueSources,
      targetTableId: parsed.data.targetTableId,
      operatorId: parsed.data.operatorId,
      operatorName: parsed.data.operatorName,
      tableLabels: labels,
      combinedCapacity,
      guestsByTable: parsed.data.guestsByTable,
    });

    if (!result.ok) return reply.status(409).send({ error: result.error });

    broadcastTransfer({
      sourceTableIds: result.mergedSources ?? parsed.data.sourceTableIds,
      targetTableId: parsed.data.targetTableId,
      operatorId: parsed.data.operatorId,
      movedLineIds: result.movedLineIds,
    });
    broadcastKdsUpdate();

    writeEdgeAudit(app.edgeDb, {
      staffId: operator.id,
      operation: "TABLE_MERGE",
      severity: "INFO",
      previousState: {
        sourceTableIds: parsed.data.sourceTableIds,
        sourceLabels: parsed.data.sourceTableIds.map((id) => labels.get(id)),
      },
      nextState: {
        targetTableId: parsed.data.targetTableId,
        targetLabel: target!.label,
        mergedSources: result.mergedSources,
        movedLineIds: result.movedLineIds,
        targetStatus: result.targetStatus,
      },
    });

    return {
      ok: true,
      mergedSources: result.mergedSources,
      movedLineIds: result.movedLineIds,
      targetStatus: result.targetStatus,
      targetLabel: target!.label,
    };
  });
}
