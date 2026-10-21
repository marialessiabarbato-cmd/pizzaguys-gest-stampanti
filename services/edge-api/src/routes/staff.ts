import { randomUUID } from "node:crypto";
import { pinAttemptBlockedSeconds, recordPinFailure, recordPinSuccess } from "../lib/device-auth.js";
import { blockedMessage } from "./devices.js";
import { staff } from "@pizzaguys/edge-db";
import { createStaffSchema, startShiftSchema, updateStaffSchema } from "@pizzaguys/validators";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeEdgeAudit } from "../lib/audit.js";
import {
  bearerToken,
  checkUserAdmin,
  issueOperatorToken,
  requireUserAdmin,
  resolveOperator,
  revokeOperatorToken,
} from "../lib/operator-sessions.js";
import {
  endOperatorShift,
  listOpenOperatorShifts,
  startOperatorShift,
} from "../lib/operator-shifts.js";
import { getActiveStaffById } from "../lib/staff-auth.js";
import { enqueueStaffSync, tryImmediateStaffSync } from "../lib/sync-queue.js";

async function hasActivePinConflict(
  app: FastifyInstance,
  pin: string,
  excludeStaffId?: string,
): Promise<boolean> {
  const activeMembers = app.edgeDb.select().from(staff).where(eq(staff.isActive, true)).all();
  for (const member of activeMembers) {
    if (excludeStaffId && member.id === excludeStaffId) continue;
    const samePin = await bcrypt.compare(pin, member.pinHash);
    if (samePin) return true;
  }
  return false;
}

export async function staffRoutes(app: FastifyInstance) {
  app.get("/api/staff", async () => {
    return app.edgeDb
      .select({
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        role: staff.role,
        isActive: staff.isActive,
        createdAt: staff.createdAt,
      })
      .from(staff)
      .all();
  });

  app.post("/api/staff", { preHandler: requireUserAdmin(app.edgeDb) }, async (req, reply) => {
    const parsed = createStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    if (await hasActivePinConflict(app, parsed.data.pin)) {
      return reply.status(409).send({ error: "PIN già in uso da un altro operatore attivo" });
    }
    const now = new Date().toISOString();
    const pinHash = await bcrypt.hash(parsed.data.pin, 12);
    const row = {
      id: randomUUID(),
      firstName: parsed.data.firstName,
      lastName: parsed.data.lastName,
      email: parsed.data.email,
      role: parsed.data.role,
      pinHash,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    app.edgeDb.insert(staff).values(row).run();

    enqueueStaffSync(app.edgeDb, {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      role: row.role,
      pinHash: row.pinHash,
      isActive: row.isActive,
    });
    void tryImmediateStaffSync(app.edgeDb, row.id);

    return reply.status(201).send({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      role: row.role,
      isActive: row.isActive,
    });
  });

  app.patch<{ Params: { id: string } }>("/api/staff/:id", async (req, reply) => {
    const parsed = updateStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    // Ogni operatore può cambiare il proprio PIN (Profilo in cassa); il resto è dell'Admin di sede.
    const self = resolveOperator(app.edgeDb, req);
    const ownPinOnly =
      self?.id === req.params.id && Object.keys(parsed.data).every((key) => key === "pin");
    if (!ownPinOnly) {
      const check = checkUserAdmin(app.edgeDb, req);
      if (!check.ok) {
        return reply.status(check.status).send({ error: check.error, code: "ADMIN_REQUIRED" });
      }
    }
    const patch: Record<string, unknown> = { ...parsed.data, updatedAt: new Date().toISOString() };
    if (parsed.data.pin) {
      if (await hasActivePinConflict(app, parsed.data.pin, req.params.id)) {
        return reply.status(409).send({ error: "PIN già in uso da un altro operatore attivo" });
      }
      patch.pinHash = await bcrypt.hash(parsed.data.pin, 12);
      delete patch.pin;
    }
    const updated = app.edgeDb
      .update(staff)
      .set(patch)
      .where(eq(staff.id, req.params.id))
      .returning({
        id: staff.id,
        firstName: staff.firstName,
        lastName: staff.lastName,
        email: staff.email,
        role: staff.role,
        pinHash: staff.pinHash,
        isActive: staff.isActive,
      })
      .get();
    if (!updated) return reply.status(404).send({ error: "Operatore non trovato" });

    if (updated.email) {
      enqueueStaffSync(app.edgeDb, {
        id: updated.id,
        firstName: updated.firstName,
        lastName: updated.lastName,
        email: updated.email,
        role: updated.role,
        pinHash: updated.pinHash,
        isActive: updated.isActive,
      });
      void tryImmediateStaffSync(app.edgeDb, updated.id);
    }

    const { pinHash: _pinHash, ...publicRow } = updated;
    return publicRow;
  });

  app.post("/api/staff/verify-pin", async (req, reply) => {
    const body = req.body as { pin?: string; startShift?: boolean };
    if (!body.pin || !/^[0-9]{4}$/.test(body.pin)) {
      return reply.status(400).send({ error: "PIN non valido" });
    }
    const blocked = pinAttemptBlockedSeconds(req.ip);
    if (blocked > 0) return reply.status(429).send({ error: blockedMessage(blocked), code: "PIN_BLOCKED" });
    const members = app.edgeDb.select().from(staff).where(eq(staff.isActive, true)).all();
    for (const member of members) {
      const valid = await bcrypt.compare(body.pin, member.pinHash);
      if (valid) {
        recordPinSuccess(req.ip);
        // D6: l'accesso con PIN da cassa o palmare avvia il turno dell'operatore.
        const shift = body.startShift ? startOperatorShift(app.edgeDb, member.id).shift : null;
        return {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          role: member.role,
          shiftId: shift?.id,
          token: issueOperatorToken(member.id),
        };
      }
    }
    recordPinFailure(req.ip);
    return reply.status(401).send({ error: "PIN errato", code: "PIN_WRONG" });
  });

  app.post("/api/staff/logout", async (req) => {
    const token = bearerToken(req);
    if (token) revokeOperatorToken(token);
    return { ok: true };
  });

  // Turni operatore (presenze): non sbloccano il locale, che dipende dalla sessione di cassa.
  app.get("/api/shifts", async () => listOpenOperatorShifts(app.edgeDb));

  app.post("/api/shifts/start", async (req, reply) => {
    const parsed = startShiftSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const member = getActiveStaffById(app.edgeDb, parsed.data.staffId);
    if (!member) return reply.status(404).send({ error: "Operatore non trovato" });
    const { shift, created } = startOperatorShift(app.edgeDb, member.id);
    return reply.status(created ? 201 : 200).send(shift);
  });

  app.post<{ Params: { id: string } }>("/api/shifts/:id/end", async (req, reply) => {
    const body = (req.body ?? {}) as { requestedByStaffId?: string };
    if (!body.requestedByStaffId) {
      return reply.status(400).send({ error: "requestedByStaffId obbligatorio" });
    }
    const requester = getActiveStaffById(app.edgeDb, body.requestedByStaffId);
    if (!requester) return reply.status(404).send({ error: "Operatore non trovato" });
    const result = endOperatorShift(app.edgeDb, req.params.id, requester);
    if (!result.ok) return reply.status(result.status).send({ error: result.error });
    if (result.shift.staffId !== requester.id) {
      writeEdgeAudit(app.edgeDb, {
        staffId: requester.id,
        operation: "OPERATOR_SHIFT_ENDED_BY_CASHIER",
        severity: "INFO",
        nextState: { shiftId: result.shift.id, staffId: result.shift.staffId },
      });
    }
    return result.shift;
  });
}
