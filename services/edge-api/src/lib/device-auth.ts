import { createHash, randomBytes } from "node:crypto";
import { networkInterfaces } from "node:os";
import { devices, type EdgeDatabase } from "@pizzaguys/edge-db";
import { eq } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";

/**
 * Abbinamento dei device (Fase 2 piano rete).
 *
 * Palmari, KDS e tablet si abbinano UNA volta con il PIN di un operatore: l'Edge rilascia
 * un token di device (salvato solo come hash). Da quel momento ogni chiamata HTTP porta
 * l'header `X-Device-Token` e il WebSocket il parametro `deviceToken`.
 * Chi è sul Wi-Fi ma non è abbinato non può aprire tavoli, inviare comande o pagare.
 *
 * Il PC su cui gira l'Edge (cassa Electron, Mac di sviluppo) è sempre fidato.
 * `DEVICE_PAIRING=off` disattiva il controllo (solo per emergenze o test).
 */

export const DEVICE_TOKEN_HEADER = "x-device-token";
export const DEVICE_KINDS = ["handheld", "cassa", "kds"] as const;
export type DeviceKind = (typeof DEVICE_KINDS)[number];

export function pairingRequired(): boolean {
  return (process.env.DEVICE_PAIRING ?? "required").toLowerCase() !== "off";
}

export function hashDeviceToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

// ── Richieste dal PC dell'Edge ───────────────────────────────────────────────

let localAddresses: Set<string> | null = null;
let localAddressesAt = 0;

function normalizeIp(ip: string): string {
  return ip.startsWith("::ffff:") ? ip.slice(7) : ip;
}

/** Indirizzi di questo PC (cambiano con il DHCP: ricalcolati ogni minuto). */
function getLocalAddresses(): Set<string> {
  if (localAddresses && Date.now() - localAddressesAt < 60_000) return localAddresses;
  const set = new Set<string>(["127.0.0.1", "::1"]);
  for (const list of Object.values(networkInterfaces())) {
    for (const a of list ?? []) set.add(normalizeIp(a.address));
  }
  localAddresses = set;
  localAddressesAt = Date.now();
  return set;
}

export function isLocalIp(ip: string | undefined): boolean {
  if (!ip) return false;
  return getLocalAddresses().has(normalizeIp(ip));
}

// ── Device abbinati ──────────────────────────────────────────────────────────

export interface ResolvedDevice {
  id: string;
  name: string;
  kind: string;
}

/** Ultimo contatto in memoria, scritto su disco al massimo ogni 60 s per device. */
const lastSeenWritten = new Map<string, number>();

export function resolveDeviceToken(db: EdgeDatabase, token: string | undefined | null): ResolvedDevice | "revoked" | null {
  if (!token || token.length < 20) return null;
  const row = db.select().from(devices).where(eq(devices.tokenHash, hashDeviceToken(token))).get();
  if (!row) return null;
  if (row.revokedAt) return "revoked";
  return { id: row.id, name: row.name, kind: row.kind };
}

export function touchDevice(db: EdgeDatabase, deviceId: string, ip?: string, clientVersion?: string | null) {
  const last = lastSeenWritten.get(deviceId) ?? 0;
  if (Date.now() - last < 60_000 && !clientVersion) return;
  lastSeenWritten.set(deviceId, Date.now());
  db.update(devices)
    .set({
      lastSeenAt: new Date().toISOString(),
      ...(ip ? { lastIp: normalizeIp(ip) } : {}),
      ...(clientVersion ? { clientVersion: clientVersion.slice(0, 40) } : {}),
    })
    .where(eq(devices.id, deviceId))
    .run();
}

export function pairDevice(
  db: EdgeDatabase,
  input: {
    deviceId: string;
    kind: DeviceKind;
    name?: string;
    ip?: string;
    pairedBy: { id: string; firstName: string; lastName: string };
  },
): { token: string; device: ResolvedDevice } {
  const token = randomBytes(32).toString("hex");
  const now = new Date().toISOString();
  const kindLabel = { handheld: "Palmare", cassa: "Cassa", kds: "KDS" }[input.kind];
  const existing = db.select().from(devices).where(eq(devices.id, input.deviceId)).get();
  const name = input.name?.trim().slice(0, 60) || existing?.name || `${kindLabel} ${input.deviceId.slice(-4).toUpperCase()}`;
  const pairedByName = `${input.pairedBy.firstName} ${input.pairedBy.lastName}`.trim();
  const values = {
    name,
    kind: input.kind,
    tokenHash: hashDeviceToken(token),
    pairedAt: now,
    pairedByStaffId: input.pairedBy.id,
    pairedByName,
    lastSeenAt: now,
    lastIp: input.ip ? normalizeIp(input.ip) : null,
    revokedAt: null,
  };
  if (existing) {
    db.update(devices).set(values).where(eq(devices.id, input.deviceId)).run();
  } else {
    db.insert(devices).values({ id: input.deviceId, ...values }).run();
  }
  return { token, device: { id: input.deviceId, name, kind: input.kind } };
}

export function listDevices(db: EdgeDatabase) {
  return db
    .select()
    .from(devices)
    .all()
    .map(({ tokenHash: _h, ...d }) => d)
    .sort((a, b) => (b.lastSeenAt ?? "").localeCompare(a.lastSeenAt ?? ""));
}

export function revokeDevice(db: EdgeDatabase, deviceId: string): boolean {
  const row = db.select().from(devices).where(eq(devices.id, deviceId)).get();
  if (!row) return false;
  db.update(devices).set({ revokedAt: new Date().toISOString() }).where(eq(devices.id, deviceId)).run();
  return true;
}

export function renameDevice(db: EdgeDatabase, deviceId: string, name: string): boolean {
  const clean = name.trim().slice(0, 60);
  if (!clean) return false;
  const res = db.update(devices).set({ name: clean }).where(eq(devices.id, deviceId)).run();
  return res.changes > 0;
}

// ── Limite ai tentativi di PIN ───────────────────────────────────────────────

/**
 * PIN di 4 cifre: senza limite si indovinano provando. Dopo 5 errori dallo stesso indirizzo
 * blocco di 1 minuto, poi raddoppia (max 15 minuti). Un PIN giusto azzera il conteggio.
 */
const attempts = new Map<string, { failures: number; blockedUntil: number }>();
const FREE_FAILURES = 5;

export function pinAttemptBlockedSeconds(ip: string | undefined): number {
  const a = attempts.get(ip ?? "?");
  if (!a || a.blockedUntil <= Date.now()) return 0;
  return Math.ceil((a.blockedUntil - Date.now()) / 1000);
}

export function recordPinFailure(ip: string | undefined) {
  const key = ip ?? "?";
  const a = attempts.get(key) ?? { failures: 0, blockedUntil: 0 };
  a.failures += 1;
  if (a.failures >= FREE_FAILURES) {
    const step = a.failures - FREE_FAILURES; // 0,1,2…
    const ms = Math.min(60_000 * 2 ** step, 15 * 60_000);
    a.blockedUntil = Date.now() + ms;
  }
  attempts.set(key, a);
}

export function recordPinSuccess(ip: string | undefined) {
  attempts.delete(ip ?? "?");
}

export function resetPinAttemptsForTest() {
  attempts.clear();
}

// ── Controllo sulle richieste ────────────────────────────────────────────────

/** Route aperte anche ai device non abbinati (servono per abbinarsi). */
const OPEN_ROUTES = new Set([
  "GET /health",
  "GET /api/status",
  "POST /api/devices/pair",
  "POST /api/staff/verify-pin",
  "POST /api/staff/logout",
  "POST /api/provision",
  // il WebSocket fa il suo controllo (chiusura con codice 4401 e messaggio)
  "GET /ws",
]);

export type DeviceCheck =
  | { ok: true; device: ResolvedDevice | null; local: boolean }
  | { ok: false; code: "DEVICE_NOT_PAIRED" | "DEVICE_REVOKED"; error: string };

export const NOT_PAIRED_MESSAGE =
  "Questo dispositivo non è abbinato alla cassa: entra con il tuo PIN per abbinarlo.";
export const REVOKED_MESSAGE =
  "Questo dispositivo è stato scollegato dalla cassa: entra di nuovo con il PIN per riabbinarlo.";

export function checkDevice(db: EdgeDatabase, ip: string | undefined, token: string | undefined | null): DeviceCheck {
  const local = isLocalIp(ip);
  const resolved = resolveDeviceToken(db, token);
  if (resolved === "revoked") {
    if (local || !pairingRequired()) return { ok: true, device: null, local };
    return { ok: false, code: "DEVICE_REVOKED", error: REVOKED_MESSAGE };
  }
  if (resolved) {
    touchDevice(db, resolved.id, ip);
    return { ok: true, device: resolved, local };
  }
  if (local || !pairingRequired()) return { ok: true, device: null, local };
  return { ok: false, code: "DEVICE_NOT_PAIRED", error: NOT_PAIRED_MESSAGE };
}

declare module "fastify" {
  interface FastifyRequest {
    device?: ResolvedDevice | null;
  }
}

export function registerDeviceGuard(app: FastifyInstance) {
  app.decorateRequest("device", null);
  app.addHook("onRequest", async (req: FastifyRequest, reply) => {
    if (req.method === "OPTIONS") return;
    const path = req.url.split("?")[0] ?? "";
    if (!path.startsWith("/api/") && path !== "/ws") return;
    if (OPEN_ROUTES.has(`${req.method} ${path}`)) {
      // anche sulle route aperte riconosciamo il device se si presenta
      const token = req.headers[DEVICE_TOKEN_HEADER];
      const r = resolveDeviceToken(app.edgeDb, typeof token === "string" ? token : null);
      req.device = r && r !== "revoked" ? r : null;
      return;
    }
    const header = req.headers[DEVICE_TOKEN_HEADER];
    const check = checkDevice(app.edgeDb, req.ip, typeof header === "string" ? header : null);
    if (!check.ok) {
      await reply.status(401).send({ error: check.error, code: check.code });
      return reply;
    }
    req.device = check.device;
  });
}
