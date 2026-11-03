import { buildEdgeApp } from "./app.js";
import { startHeartbeatLoop } from "./lib/heartbeat.js";
import { startMdns } from "./lib/mdns.js";
import { startPrintQueue } from "./lib/print-queue.js";
import { startPrinterMonitor } from "./lib/printer-monitor.js";

const PORT = Number(process.env.EDGE_API_PORT ?? 4100);
const HOST = process.env.EDGE_API_HOST ?? "0.0.0.0";

const app = await buildEdgeApp();
app.log.info(
  { cloudApiUrl: process.env.CLOUD_API_URL ?? "http://localhost:4000", dbPath: process.env.EDGE_DB_PATH },
  "Edge: configurazione letta",
);

startHeartbeatLoop(app);
// R3: ticket in attesa ritentati da soli, stato delle stampanti ogni 30 s
startPrintQueue(app.edgeDb);
startPrinterMonitor(app.edgeDb);
// R3: nome fisso in rete locale (pizzaguys-cassa.local) per palmari e KDS
startMdns(app.log);

try {
  await app.listen({ port: PORT, host: HOST });
  console.log(`Edge API → http://${HOST}:${PORT} | WS → ws://${HOST}:${PORT}/ws`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
