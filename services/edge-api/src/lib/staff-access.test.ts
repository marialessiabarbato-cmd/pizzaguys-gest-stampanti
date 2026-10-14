import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeDb, staff, type EdgeDatabase } from "@pizzaguys/edge-db";
import type { SnapshotStaff } from "@pizzaguys/types";
import { eq } from "drizzle-orm";
import type { FastifyRequest } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { checkUserAdmin, issueOperatorToken } from "./operator-sessions.js";
import { applyStaffFromSnapshot } from "./staff-sync.js";
import { enqueueStaffSync } from "./sync-queue.js";

let dir: string;
let db: EdgeDatabase;

type Role = "USER_ADMIN" | "CASHIER" | "WAITER";

function addStaff(id: string, role: Role) {
  const now = new Date().toISOString();
  db.insert(staff)
    .values({ id, firstName: id, lastName: "Test", role, pinHash: "hash", createdAt: now, updatedAt: now })
    .run();
}

function request(token?: string) {
  return { headers: token ? { authorization: `Bearer ${token}` } : {} } as FastifyRequest;
}

function isActive(id: string) {
  return db.select().from(staff).where(eq(staff.id, id)).get()?.isActive;
}

function snapshotRow(id: string, role: Role, email?: string): SnapshotStaff {
  return { id, firstName: id, lastName: "Cloud", role, email, pinHash: "hash", isActive: true };
}

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "pg-edge-staff-"));
  db = createEdgeDb(join(dir, "edge.sqlite"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("checkUserAdmin", () => {
  it("primo avvio: senza Admin di sede la configurazione resta aperta", () => {
    addStaff("cam-1", "WAITER");
    expect(checkUserAdmin(db, request()).ok).toBe(true);
  });

  it("con un Admin di sede serve la sua sessione", () => {
    addStaff("admin-1", "USER_ADMIN");
    addStaff("cam-1", "WAITER");
    addStaff("cassa-1", "CASHIER");

    expect(checkUserAdmin(db, request())).toMatchObject({ ok: false, status: 401 });
    expect(checkUserAdmin(db, request("token-inventato"))).toMatchObject({ ok: false, status: 401 });
    expect(checkUserAdmin(db, request(issueOperatorToken("cam-1")))).toMatchObject({ ok: false, status: 403 });
    expect(checkUserAdmin(db, request(issueOperatorToken("cassa-1")))).toMatchObject({ ok: false, status: 403 });
    expect(checkUserAdmin(db, request(issueOperatorToken("admin-1"))).ok).toBe(true);
  });

  it("la sessione di un Admin disattivato non vale più", () => {
    addStaff("admin-1", "USER_ADMIN");
    addStaff("admin-2", "USER_ADMIN");
    const token = issueOperatorToken("admin-1");
    db.update(staff).set({ isActive: false }).where(eq(staff.id, "admin-1")).run();
    expect(checkUserAdmin(db, request(token))).toMatchObject({ ok: false, status: 401 });
  });
});

describe("applyStaffFromSnapshot", () => {
  it("disattiva gli operatori eliminati dal Cloud", () => {
    addStaff("resta", "WAITER");
    addStaff("eliminato", "WAITER");
    applyStaffFromSnapshot(db, [snapshotRow("resta", "WAITER")]);
    expect(isActive("resta")).toBe(true);
    expect(isActive("eliminato")).toBe(false);
  });

  it("non tocca gli operatori creati sull'Edge e non ancora sincronizzati", () => {
    addStaff("locale", "CASHIER");
    enqueueStaffSync(db, {
      id: "locale",
      firstName: "locale",
      lastName: "Test",
      email: "locale@test.local",
      role: "CASHIER",
      pinHash: "hash",
      isActive: true,
    });
    applyStaffFromSnapshot(db, []);
    expect(isActive("locale")).toBe(true);
  });

  it("lista vuota: il Cloud non ha più operatori per la sede", () => {
    addStaff("cam-1", "WAITER");
    applyStaffFromSnapshot(db, []);
    expect(isActive("cam-1")).toBe(false);
  });

  it("snapshot senza staff (Cloud vecchio): nessuna modifica", () => {
    addStaff("cam-1", "WAITER");
    applyStaffFromSnapshot(db, undefined);
    expect(isActive("cam-1")).toBe(true);
  });

  it("riporta l'email del Cloud sull'Edge", () => {
    applyStaffFromSnapshot(db, [snapshotRow("cam-1", "WAITER", "cam@test.local")]);
    expect(db.select().from(staff).where(eq(staff.id, "cam-1")).get()?.email).toBe("cam@test.local");
  });
});
