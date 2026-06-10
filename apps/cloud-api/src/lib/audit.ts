import { auditLogs } from "@pizzaguys/db/schema";
import type { FastifyInstance } from "fastify";

type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";

interface AuditEntry {
  userId?: string;
  locationId?: string;
  operation: string;
  severity?: AuditSeverity;
  previousState?: unknown;
  nextState?: unknown;
}

export async function writeAudit(app: FastifyInstance, entry: AuditEntry) {
  await app.db.insert(auditLogs).values({
    userId: entry.userId ?? null,
    locationId: entry.locationId ?? null,
    operation: entry.operation,
    severity: entry.severity ?? "INFO",
    previousState: entry.previousState ?? null,
    nextState: entry.nextState ?? null,
  });
}
