import { createDb, type Database } from "@pizzaguys/db";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    db: Database;
  }
}

export default fp(async (app) => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL non configurato");
  app.decorate("db", createDb(url));
});
