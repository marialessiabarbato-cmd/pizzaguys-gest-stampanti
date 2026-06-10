import { randomUUID } from "node:crypto";
import { auditLog } from "@pizzaguys/edge-db";
import type { EdgeDatabase } from "@pizzaguys/edge-db";
import { edgeState } from "@pizzaguys/edge-db";
import { sql } from "drizzle-orm";

type AuditSeverity = "INFO" | "WARNING" | "CRITICAL";

const PII_KEYS = new Set([
  "operatorName",
  "firstName",
  "lastName",
  "pin",
  "pinHash",
  "email",
  "phone",
  "managerPin",
  "authorizedBy",
  "lockedByName",
  "apiToken",
]);

export function anonymizePayload(data: unknown): unknown {
  if (data == null || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(anonymizePayload);

  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
    if (PII_KEYS.has(key)) {
      result[key] = "[REDACTED]";
    } else if (typeof value === "object" && value !== null) {
      result[key] = anonymizePayload(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

interface EdgeAuditEntry {
  staffId?: string;
  operation: string;
  severity?: AuditSeverity;
  previousState?: unknown;
  nextState?: unknown;
}

export function writeEdgeAudit(db: EdgeDatabase, entry: EdgeAuditEntry) {
  const state = db.select().from(edgeState).where(sql`id = 1`).get();
  const now = new Date().toISOString();

  db.insert(auditLog)
    .values({
      id: randomUUID(),
      locationId: state?.locationId ?? null,
      staffId: entry.staffId ?? null,
      operation: entry.operation,
      severity: entry.severity ?? "INFO",
      previousState:
        entry.previousState != null
          ? JSON.stringify(anonymizePayload(entry.previousState))
          : null,
      nextState:
        entry.nextState != null ? JSON.stringify(anonymizePayload(entry.nextState)) : null,
      createdAt: now,
    })
    .run();
}
