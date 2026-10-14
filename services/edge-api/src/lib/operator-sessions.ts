import { randomBytes } from "node:crypto";
import { staff, type EdgeDatabase } from "@pizzaguys/edge-db";
import { and, eq } from "drizzle-orm";
import type { FastifyReply, FastifyRequest } from "fastify";
import { getActiveStaffById, type VerifiedStaff } from "./staff-auth.js";

/**
 * Sessioni operatore in memoria: verify-pin rilascia un token, le route di configurazione
 * (staff, stampanti, routing, sala) lo richiedono come `Authorization: Bearer`.
 * Un riavvio dell'Edge le azzera: si rientra con il PIN.
 */
const SESSION_TTL_MS = 12 * 60 * 60 * 1000;

const sessions = new Map<string, { staffId: string; expiresAt: number }>();

export function issueOperatorToken(staffId: string): string {
  const token = randomBytes(24).toString("hex");
  sessions.set(token, { staffId, expiresAt: Date.now() + SESSION_TTL_MS });
  return token;
}

export function revokeOperatorToken(token: string) {
  sessions.delete(token);
}

export function bearerToken(req: FastifyRequest): string | null {
  const auth = req.headers.authorization;
  return auth?.startsWith("Bearer ") ? auth.slice(7) : null;
}

/** Operatore della richiesta, se il token è valido e l'operatore è ancora attivo. */
export function resolveOperator(db: EdgeDatabase, req: FastifyRequest): VerifiedStaff | null {
  const token = bearerToken(req);
  if (!token) return null;
  const session = sessions.get(token);
  if (!session) return null;
  if (session.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  const member = getActiveStaffById(db, session.staffId);
  if (!member) {
    sessions.delete(token);
    return null;
  }
  session.expiresAt = Date.now() + SESSION_TTL_MS;
  return member;
}

export function hasActiveUserAdmin(db: EdgeDatabase): boolean {
  return Boolean(
    db
      .select({ id: staff.id })
      .from(staff)
      .where(and(eq(staff.role, "USER_ADMIN"), eq(staff.isActive, true)))
      .get(),
  );
}

export type AdminCheck =
  | { ok: true; operator: VerifiedStaff | null }
  | { ok: false; status: 401 | 403; error: string };

/**
 * Configurazione locale riservata all'Admin di sede (USER_ADMIN).
 * Finché l'Edge non ha nessun Admin di sede attivo (primo avvio) resta aperta,
 * altrimenti nessuno potrebbe configurarla.
 */
export function checkUserAdmin(db: EdgeDatabase, req: FastifyRequest): AdminCheck {
  const operator = resolveOperator(db, req);
  if (operator?.role === "USER_ADMIN") return { ok: true, operator };
  if (!hasActiveUserAdmin(db)) return { ok: true, operator };
  if (operator) {
    return { ok: false, status: 403, error: "Operazione riservata all'Admin di sede" };
  }
  return {
    ok: false,
    status: 401,
    error: "Sessione Admin di sede assente o scaduta: rientra in cassa con il PIN",
  };
}

export function requireUserAdmin(db: EdgeDatabase) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const check = checkUserAdmin(db, req);
    if (!check.ok) {
      await reply.status(check.status).send({ error: check.error, code: "ADMIN_REQUIRED" });
      return reply;
    }
  };
}
