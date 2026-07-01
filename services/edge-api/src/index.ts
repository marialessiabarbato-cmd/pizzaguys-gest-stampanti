import cors from "@fastify/cors";
import websocket from "@fastify/websocket";
import Fastify from "fastify";
import { startHeartbeatLoop } from "./lib/heartbeat.js";
import dbPlugin from "./plugins/db.js";
import { orderRoutes } from "./routes/orders.js";
import { closureRoutes } from "./routes/closure.js";
import { posRoutes } from "./routes/pos.js";
import { printerRoutes } from "./routes/printers.js";
import { salaRoutes } from "./routes/sala.js";
import { tableTransferRoutes } from "./routes/table-transfer.js";
import { staffRoutes } from "./routes/staff.js";
import { statusRoutes } from "./routes/status.js";
import { registerWebSocket } from "./ws.js";

const PORT = Number(process.env.EDGE_API_PORT ?? 4100);
const HOST = process.env.EDGE_API_HOST ?? "0.0.0.0";

const clients = new Set<{ send: (data: string) => void; readyState: number }>();

const app = Fastify({ logger: true });

await app.register(cors, {
  origin: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
await app.register(websocket);
await app.register(dbPlugin);

await statusRoutes(app);
await salaRoutes(app);
await orderRoutes(app);
await tableTransferRoutes(app);
await posRoutes(app);
await closureRoutes(app);
await printerRoutes(app);
await staffRoutes(app);
registerWebSocket(app, clients);

startHeartbeatLoop(app);

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Edge API → http://${HOST}:${PORT} | WS → ws://${HOST}:${PORT}/ws`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
