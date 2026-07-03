import cors from "@fastify/cors";
import Fastify from "fastify";
import authPlugin from "./plugins/auth.js";
import dbPlugin from "./plugins/db.js";
import { auditRoutes } from "./routes/audit.js";
import { authRoutes } from "./routes/auth.js";
import { dashboardRoutes } from "./routes/dashboard.js";
import { locationRoutes } from "./routes/locations.js";
import { menuRoutes } from "./routes/menu.js";
import { priceRoutes } from "./routes/prices.js";
import { settingsRoutes } from "./routes/settings.js";
import { startNightlyReportWorker } from "./lib/nightly-worker.js";
import { reportRoutes } from "./routes/reports.js";
import { invoiceRoutes } from "./routes/invoices.js";
import { invoiceCustomerProfileRoutes } from "./routes/invoice-customers.js";
import { locationDiscountPresetRoutes } from "./routes/discount-presets.js";
import { locationMealVoucherPresetRoutes } from "./routes/meal-voucher-presets.js";
import { syncRoutes } from "./routes/sync.js";
import { userRoutes } from "./routes/users.js";
import { variantRoutes } from "./routes/variants.js";

const PORT = Number(process.env.CLOUD_API_PORT ?? 4000);

const app = Fastify({ logger: true });
await app.register(cors, {
  origin: true,
  methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
});
await app.register(dbPlugin);
await app.register(authPlugin);

app.get("/health", async () => ({
  ok: true,
  service: "cloud-api",
  version: "0.1.0",
  phase: 1,
}));

await authRoutes(app);
await locationRoutes(app);
await menuRoutes(app);
await variantRoutes(app);
await priceRoutes(app);
await userRoutes(app);
await settingsRoutes(app);
await dashboardRoutes(app);
await auditRoutes(app);
await syncRoutes(app);
await reportRoutes(app);
await invoiceRoutes(app);
await invoiceCustomerProfileRoutes(app);
await locationDiscountPresetRoutes(app);
await locationMealVoucherPresetRoutes(app);

startNightlyReportWorker(app);

try {
  await app.listen({ port: PORT, host: "0.0.0.0" });
  console.log(`Cloud API → http://localhost:${PORT}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
