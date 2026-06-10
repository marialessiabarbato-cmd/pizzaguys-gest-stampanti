import { auditLogs } from "@pizzaguys/db/schema";
import { desc } from "drizzle-orm";
import type { FastifyInstance } from "fastify";

export async function auditRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { limit?: string; offset?: string } }>(
    "/api/v2/audit-logs",
    { preHandler: [app.authenticate] },
    async (req) => {
      const limit = Math.min(Number(req.query.limit ?? 50), 200);
      const offset = Number(req.query.offset ?? 0);

      return app.db
        .select()
        .from(auditLogs)
        .orderBy(desc(auditLogs.createdAt))
        .limit(limit)
        .offset(offset);
    },
  );
}
