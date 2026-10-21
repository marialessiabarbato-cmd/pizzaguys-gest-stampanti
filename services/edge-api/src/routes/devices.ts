import type { FastifyInstance } from "fastify";
import {
  DEVICE_KINDS,
  listDevices,
  pairDevice,
  pinAttemptBlockedSeconds,
  recordPinFailure,
  recordPinSuccess,
  renameDevice,
  revokeDevice,
  type DeviceKind,
} from "../lib/device-auth.js";
import { requireUserAdmin } from "../lib/operator-sessions.js";
import { verifyPin } from "../lib/staff-auth.js";
import { disconnectDevice, listConnectedDevices } from "../lib/ws-hub.js";
import { writeEdgeAudit } from "../lib/audit.js";

export function blockedMessage(seconds: number) {
  return `Troppi PIN errati da questo dispositivo: riprova tra ${seconds > 90 ? `${Math.ceil(seconds / 60)} minuti` : `${seconds} secondi`}.`;
}

export async function deviceRoutes(app: FastifyInstance) {
  const admin = requireUserAdmin(app.edgeDb);

  /**
   * Abbinamento: PIN di un operatore attivo + ID stabile del device.
   * Un KDS (senza login) si abbina solo con PIN di Cassiere o Admin.
   */
  app.post("/api/devices/pair", async (req, reply) => {
    const body = (req.body ?? {}) as { pin?: string; deviceId?: string; deviceKind?: string; deviceName?: string };
    const blocked = pinAttemptBlockedSeconds(req.ip);
    if (blocked > 0) return reply.status(429).send({ error: blockedMessage(blocked), code: "PIN_BLOCKED" });

    if (!body.deviceId || !/^[A-Za-z0-9_-]{8,80}$/.test(body.deviceId)) {
      return reply.status(400).send({ error: "Identificativo del dispositivo non valido: ricarica la pagina e riprova" });
    }
    if (!body.deviceKind || !(DEVICE_KINDS as readonly string[]).includes(body.deviceKind)) {
      return reply.status(400).send({ error: "Tipo di dispositivo non valido" });
    }
    const member = await verifyPin(app.edgeDb, body.pin ?? "");
    if (!member) {
      recordPinFailure(req.ip);
      return reply.status(401).send({ error: "PIN errato", code: "PIN_WRONG" });
    }
    recordPinSuccess(req.ip);
    if (body.deviceKind === "kds" && member.role === "WAITER") {
      return reply.status(403).send({ error: "Per abbinare un KDS serve il PIN di un cassiere o dell'Admin" });
    }

    const result = pairDevice(app.edgeDb, {
      deviceId: body.deviceId,
      kind: body.deviceKind as DeviceKind,
      name: body.deviceName,
      ip: req.ip,
      pairedBy: member,
    });
    writeEdgeAudit(app.edgeDb, {
      operation: "DEVICE_PAIRED",
      staffId: member.id,
      nextState: { deviceId: result.device.id, name: result.device.name, kind: result.device.kind, ip: req.ip },
    });
    return { deviceToken: result.token, device: result.device };
  });

  /** Elenco device abbinati, con chi è collegato ora (WebSocket). */
  app.get("/api/devices", { preHandler: admin }, async () => {
    const connected = listConnectedDevices();
    return listDevices(app.edgeDb).map((d) => {
      const live = connected.find((c) => c.deviceId === d.id);
      return { ...d, connected: Boolean(live), connectedSince: live?.connectedAt ?? null };
    });
  });

  app.post<{ Params: { id: string } }>("/api/devices/:id/revoke", { preHandler: admin }, async (req, reply) => {
    if (!revokeDevice(app.edgeDb, req.params.id)) return reply.status(404).send({ error: "Dispositivo non trovato" });
    disconnectDevice(req.params.id);
    writeEdgeAudit(app.edgeDb, {
      operation: "DEVICE_REVOKED",
      severity: "WARNING",
      nextState: { deviceId: req.params.id },
    });
    return { ok: true };
  });

  app.patch<{ Params: { id: string } }>("/api/devices/:id", { preHandler: admin }, async (req, reply) => {
    const body = (req.body ?? {}) as { name?: string };
    if (!body.name || !renameDevice(app.edgeDb, req.params.id, body.name)) {
      return reply.status(400).send({ error: "Nome non valido o dispositivo non trovato" });
    }
    return { ok: true };
  });

  /** Device collegati in questo momento (palmari, KDS, cassa) per lo stato rete. */
  app.get("/api/devices/connected", async () => ({ devices: listConnectedDevices() }));
}
