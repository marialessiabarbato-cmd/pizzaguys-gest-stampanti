import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createEdgeDb, staff, type EdgeDatabase } from "@pizzaguys/edge-db";
import bcrypt from "bcryptjs";
import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { deviceRoutes } from "../routes/devices.js";
import { registerDeviceGuard, resetPinAttemptsForTest } from "./device-auth.js";
import { issueOperatorToken } from "./operator-sessions.js";

let dir: string;
let db: EdgeDatabase;
let app: FastifyInstance;
const PHONE = "192.168.1.77";

function addStaff(id: string, role: "USER_ADMIN" | "CASHIER" | "WAITER", pin: string) {
  const now = new Date().toISOString();
  db.insert(staff)
    .values({ id, firstName: id, lastName: "Test", role, pinHash: bcrypt.hashSync(pin, 4), createdAt: now, updatedAt: now })
    .run();
}

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "pg-edge-dev-"));
  db = createEdgeDb(join(dir, "edge.sqlite"));
  addStaff("admin", "USER_ADMIN", "5678");
  addStaff("cam", "WAITER", "1234");
  resetPinAttemptsForTest();
  app = Fastify();
  app.decorate("edgeDb", db);
  registerDeviceGuard(app);
  await deviceRoutes(app);
  app.get("/api/tables/live", async () => ({ ok: true }));
  await app.ready();
});

afterEach(async () => {
  await app.close();
  rmSync(dir, { recursive: true, force: true });
});

const pair = (body: Record<string, unknown>, ip = PHONE) =>
  app.inject({ method: "POST", url: "/api/devices/pair", payload: body, remoteAddress: ip });

describe("abbinamento dispositivi", () => {
  it("telefono non abbinato: operazioni bloccate con messaggio chiaro", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tables/live", remoteAddress: PHONE });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("DEVICE_NOT_PAIRED");
    expect(res.json().error).toMatch(/PIN/);
  });

  it("il PC dell'Edge è sempre fidato", async () => {
    const res = await app.inject({ method: "GET", url: "/api/tables/live", remoteAddress: "127.0.0.1" });
    expect(res.statusCode).toBe(200);
  });

  it("PIN al primo accesso: poi il token basta", async () => {
    const res = await pair({ pin: "1234", deviceId: "handheld-abcdef12", deviceKind: "handheld" });
    expect(res.statusCode).toBe(200);
    const { deviceToken, device } = res.json();
    expect(device.name).toMatch(/Palmare/);
    const ok = await app.inject({
      method: "GET",
      url: "/api/tables/live",
      remoteAddress: PHONE,
      headers: { "x-device-token": deviceToken },
    });
    expect(ok.statusCode).toBe(200);
  });

  it("KDS solo con PIN di cassiere o Admin", async () => {
    const waiter = await pair({ pin: "1234", deviceId: "kds-abcdef1234", deviceKind: "kds" });
    expect(waiter.statusCode).toBe(403);
    const adminRes = await pair({ pin: "5678", deviceId: "kds-abcdef1234", deviceKind: "kds" });
    expect(adminRes.statusCode).toBe(200);
  });

  it("revoca: il token non vale più", async () => {
    const { deviceToken } = (await pair({ pin: "1234", deviceId: "handheld-revoke01", deviceKind: "handheld" })).json();
    const adminToken = issueOperatorToken("admin");
    const rev = await app.inject({
      method: "POST",
      url: "/api/devices/handheld-revoke01/revoke",
      remoteAddress: "127.0.0.1",
      headers: { authorization: `Bearer ${adminToken}` },
    });
    expect(rev.statusCode).toBe(200);
    const res = await app.inject({
      method: "GET",
      url: "/api/tables/live",
      remoteAddress: PHONE,
      headers: { "x-device-token": deviceToken },
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().code).toBe("DEVICE_REVOKED");
  });

  it("dopo 5 PIN errati blocco temporaneo", async () => {
    for (let i = 0; i < 5; i++) {
      const r = await pair({ pin: "0000", deviceId: "handheld-brute001", deviceKind: "handheld" });
      expect(r.statusCode).toBe(401);
    }
    const blocked = await pair({ pin: "1234", deviceId: "handheld-brute001", deviceKind: "handheld" });
    expect(blocked.statusCode).toBe(429);
    expect(blocked.json().error).toMatch(/riprova tra/);
    // un altro indirizzo non è bloccato
    const other = await pair({ pin: "1234", deviceId: "handheld-other001", deviceKind: "handheld" }, "192.168.1.78");
    expect(other.statusCode).toBe(200);
  });

  it("elenco dispositivi solo per l'Admin", async () => {
    await pair({ pin: "1234", deviceId: "handheld-list0001", deviceKind: "handheld", deviceName: "Palmare Marco" });
    const noAdmin = await app.inject({ method: "GET", url: "/api/devices", remoteAddress: "127.0.0.1" });
    expect(noAdmin.statusCode).toBe(401);
    const res = await app.inject({
      method: "GET",
      url: "/api/devices",
      remoteAddress: "127.0.0.1",
      headers: { authorization: `Bearer ${issueOperatorToken("admin")}` },
    });
    expect(res.statusCode).toBe(200);
    const list = res.json();
    expect(list[0].name).toBe("Palmare Marco");
    expect(list[0].tokenHash).toBeUndefined();
  });
});
