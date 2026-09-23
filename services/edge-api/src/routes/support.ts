import { edgeState } from "@pizzaguys/edge-db";
import { supportReportSchema } from "@pizzaguys/validators";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { cloudReportIssue } from "../lib/cloud.js";

export async function supportRoutes(app: FastifyInstance) {
  app.post("/api/support/report", async (req, reply) => {
    const parsed = supportReportSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    if (!state?.apiToken) {
      return reply.status(503).send({ error: "Sede non collegata al cloud" });
    }

    try {
      const result = await cloudReportIssue(state.apiToken, parsed.data);
      return reply.send(result);
    } catch (err) {
      return reply.status(502).send({
        error: err instanceof Error ? err.message : "Invio segnalazione fallito",
      });
    }
  });
}
