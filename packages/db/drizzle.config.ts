import { defineConfig } from "drizzle-kit";

// Come gli altri script (--env-file=../../.env): senza, `pnpm db:migrate` userebbe la porta 5432
// di default anche quando il .env di questa copia punta a un altro Postgres.
try {
  process.loadEnvFile("../../.env");
} catch {
  /* .env assente: si usano le variabili d'ambiente o il default */
}

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: {
    url: process.env.DATABASE_URL ?? "postgresql://pizzaguys:pizzaguys@localhost:5432/pizzaguys_cloud",
  },
});
