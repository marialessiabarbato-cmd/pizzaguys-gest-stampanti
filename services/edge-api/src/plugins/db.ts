import { createEdgeDb, type EdgeDatabase } from "@pizzaguys/edge-db";
import fp from "fastify-plugin";

declare module "fastify" {
  interface FastifyInstance {
    edgeDb: EdgeDatabase;
  }
}

export default fp(async (app) => {
  const dbPath = process.env.EDGE_DB_PATH ?? "./tmp/edge.sqlite";
  const db = createEdgeDb(dbPath);
  app.decorate("edgeDb", db);
});
