import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import { createEdgeDb, type EdgeDatabase } from "@pizzaguys/edge-db";
import Fastify, { type FastifyInstance } from "fastify";
import { pairingRequired, registerDeviceGuard } from "./lib/device-auth.js";
import { registerRuntimePersistence, restoreRuntimeState } from "./lib/runtime-persistence.js";
import { cashSessionRoutes } from "./routes/cash-sessions.js";
import { closureRoutes } from "./routes/closure.js";
import { deviceRoutes } from "./routes/devices.js";
import { fiscalDocumentRoutes } from "./routes/fiscal-documents.js";
import { internalClosureRoutes } from "./routes/internal-closure.js";
import { invoiceCustomerRoutes } from "./routes/invoice-customers.js";
import { orderRoutes } from "./routes/orders.js";
import { posRoutes } from "./routes/pos.js";
import { printerRoutes } from "./routes/printers.js";
import { reservationRoutes } from "./routes/reservations.js";
import { salaRoutes } from "./routes/sala.js";
import { staffRoutes } from "./routes/staff.js";
import { statusRoutes } from "./routes/status.js";
import { supportRoutes } from "./routes/support.js";
import { tableTransferRoutes } from "./routes/table-transfer.js";
import { registerWebSocket } from "./ws.js";

declare module "fastify" {
  interface FastifyInstance {
    edgeDb: EdgeDatabase;
  }
}

/**
 * Costruisce l'Edge con tutte le route, senza metterlo in ascolto e senza i cicli in
 * background (heartbeat, coda di stampa, controllo stampanti, mDNS): li avvia index.ts.
 * I test dei flussi critici usano questa funzione con un database temporaneo.
 */
export async function buildEdgeApp(options: { logger?: boolean; db?: EdgeDatabase } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: options.logger ?? true });

  await app.register(cors, {
    origin: true,
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  });
  await app.register(websocket);
  app.decorate("edgeDb", options.db ?? createEdgeDb(process.env.EDGE_DB_PATH ?? "./tmp/edge.sqlite"));

  // T19: ripristina tavoli aperti, ordini e KDS salvati prima del riavvio (gli incassi sono su SQLite).
  const restored = restoreRuntimeState(app.edgeDb);
  if (restored) app.log.info({ restored }, "Stato operativo ripristinato dopo il riavvio");
  registerRuntimePersistence(app);
  // Fase 2: palmari, KDS e tablet devono essere abbinati con PIN (il PC dell'Edge è fidato)
  registerDeviceGuard(app);
  app.log.info({ devicePairing: pairingRequired() ? "required" : "off" }, "Abbinamento dispositivi");

  await statusRoutes(app);
  await salaRoutes(app);
  await orderRoutes(app);
  await tableTransferRoutes(app);
  await posRoutes(app);
  await invoiceCustomerRoutes(app);
  await cashSessionRoutes(app);
  await closureRoutes(app);
  await internalClosureRoutes(app);
  await fiscalDocumentRoutes(app);
  await printerRoutes(app);
  await staffRoutes(app);
  await reservationRoutes(app);
  await supportRoutes(app);
  await deviceRoutes(app);
  registerWebSocket(app, new Set());

  return app;
}
