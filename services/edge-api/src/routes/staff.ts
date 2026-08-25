import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { staff, staffShifts } from "@pizzaguys/edge-db";
import {
  closeBlindSchema,
  createStaffSchema,
  startShiftSchema,
  updateStaffSchema,
} from "@pizzaguys/validators";
import bcrypt from "bcryptjs";
import { desc, eq, isNull } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { getAllTableRuntime } from "../lib/runtime.js";
import {
  clearShiftLedger,
  getShiftPayments,
  getShiftTheoretical,
} from "../lib/shift-ledger.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";

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
        role: staff.role,
        isActive: staff.isActive,
        createdAt: staff.createdAt,
      })
      .from(staff)
      .all();
  });

  app.post("/api/staff", async (req, reply) => {
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
      role: parsed.data.role,
      pinHash,
      isActive: true,
      createdAt: now,
      updatedAt: now,
    };
    app.edgeDb.insert(staff).values(row).run();
    return reply.status(201).send({
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      role: row.role,
      isActive: row.isActive,
    });
  });

  app.patch<{ Params: { id: string } }>("/api/staff/:id", async (req, reply) => {
    const parsed = updateStaffSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
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
        role: staff.role,
        isActive: staff.isActive,
      })
      .get();
    if (!updated) return reply.status(404).send({ error: "Operatore non trovato" });
    return updated;
  });

  app.post("/api/staff/verify-pin", async (req, reply) => {
    const body = req.body as { pin?: string };
    if (!body.pin || !/^[0-9]{4}$/.test(body.pin)) {
      return reply.status(400).send({ error: "PIN non valido" });
    }
    const members = app.edgeDb.select().from(staff).where(eq(staff.isActive, true)).all();
    for (const member of members) {
      const valid = await bcrypt.compare(body.pin, member.pinHash);
      if (valid) {
        return {
          id: member.id,
          firstName: member.firstName,
          lastName: member.lastName,
          role: member.role,
        };
      }
    }
    return reply.status(401).send({ error: "PIN errato" });
  });

  app.get("/api/shifts", async () => {
    return app.edgeDb
      .select()
      .from(staffShifts)
      .where(isNull(staffShifts.endedAt))
      .orderBy(desc(staffShifts.startedAt))
      .all();
  });

  app.post("/api/shifts/start", async (req, reply) => {
    const parsed = startShiftSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const member = app.edgeDb.select().from(staff).where(eq(staff.id, parsed.data.staffId)).get();
    if (!member || !member.isActive) {
      return reply.status(404).send({ error: "Operatore non trovato" });
    }
    const row = {
      id: randomUUID(),
      staffId: parsed.data.staffId,
      startedAt: new Date().toISOString(),
      endedAt: null,
    };
    app.edgeDb.insert(staffShifts).values(row).run();
    return reply.status(201).send(row);
  });

  app.post<{ Params: { id: string } }>("/api/shifts/:id/end", async (req, reply) => {
    const updated = app.edgeDb
      .update(staffShifts)
      .set({ endedAt: new Date().toISOString() })
      .where(eq(staffShifts.id, req.params.id))
      .returning()
      .get();
    if (!updated) return reply.status(404).send({ error: "Turno non trovato" });
    clearShiftLedger(req.params.id);
    return updated;
  });

  app.get<{ Params: { id: string } }>("/api/shifts/:id/summary", async (req, reply) => {
    const shift = app.edgeDb
      .select()
      .from(staffShifts)
      .where(eq(staffShifts.id, req.params.id))
      .get();
    if (!shift) return reply.status(404).send({ error: "Turno non trovato" });

    const member = app.edgeDb.select().from(staff).where(eq(staff.id, shift.staffId)).get();
    const theoretical = getShiftTheoretical(req.params.id);
    const openTables = getAllTableRuntime().filter((t) => t.status !== "FREE");

    return {
      shiftId: shift.id,
      staffId: shift.staffId,
      staffName: member ? `${member.firstName} ${member.lastName}` : shift.staffId,
      startedAt: shift.startedAt,
      endedAt: shift.endedAt,
      theoretical,
      payments: getShiftPayments(req.params.id),
      openTables: openTables.map((t) => ({ tableId: t.tableId, status: t.status })),
      canClose: openTables.length === 0,
    };
  });

  app.post<{ Params: { id: string } }>("/api/shifts/:id/close-blind", async (req, reply) => {
    const parsed = closeBlindSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const shift = app.edgeDb
      .select()
      .from(staffShifts)
      .where(eq(staffShifts.id, req.params.id))
      .get();
    if (!shift) return reply.status(404).send({ error: "Turno non trovato" });
    if (shift.endedAt) return reply.status(409).send({ error: "Turno già chiuso" });

    const openTables = getAllTableRuntime().filter((t) => t.status !== "FREE");
    if (openTables.length > 0) {
      return reply.status(400).send({
        error: "Sala non chiusa — tavoli o conti ancora aperti",
        openTables: openTables.map((t) => ({ tableId: t.tableId, status: t.status })),
      });
    }

    const theoretical = getShiftTheoretical(req.params.id);
    const cashDiscrepancy =
      Math.round((parsed.data.cashDeclared - theoretical.cash) * 100) / 100;
    const posDiscrepancy =
      Math.round((parsed.data.posDeclared - theoretical.pos) * 100) / 100;
    const totalDiscrepancy = Math.round((cashDiscrepancy + posDiscrepancy) * 100) / 100;

    const member = app.edgeDb.select().from(staff).where(eq(staff.id, shift.staffId)).get();
    const report = {
      mock: true,
      shiftId: shift.id,
      staffName: member ? `${member.firstName} ${member.lastName}` : shift.staffId,
      closedAt: new Date().toISOString(),
      theoretical,
      declared: {
        cash: parsed.data.cashDeclared,
        pos: parsed.data.posDeclared,
      },
      discrepancy: {
        cash: cashDiscrepancy,
        pos: posDiscrepancy,
        total: totalDiscrepancy,
      },
      transactionCount: theoretical.transactionCount,
    };

    await mkdir(PRINT_DIR, { recursive: true });
    const reportPath = join(PRINT_DIR, `${Date.now()}-shift-close-${shift.id}.json`);
    await writeFile(reportPath, JSON.stringify(report, null, 2));

    const updated = app.edgeDb
      .update(staffShifts)
      .set({ endedAt: new Date().toISOString() })
      .where(eq(staffShifts.id, req.params.id))
      .returning()
      .get();

    clearShiftLedger(req.params.id);

    return {
      ok: true,
      report,
      reportPath,
      shift: updated,
    };
  });
}
