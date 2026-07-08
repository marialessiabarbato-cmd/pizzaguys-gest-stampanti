import { dailyClosures, locations } from "@pizzaguys/db/schema";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { formatClosureResponse } from "../lib/closure-response.js";

export async function closureRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get<{ Params: { id: string } }>("/api/v2/closures/:id", guard, async (req, reply) => {
    const rows = await app.db
      .select({
        closure: dailyClosures,
        locationName: locations.name,
      })
      .from(dailyClosures)
      .innerJoin(locations, eq(dailyClosures.locationId, locations.id))
      .where(eq(dailyClosures.id, req.params.id))
      .limit(1);

    const row = rows[0];
    if (!row) return reply.status(404).send({ error: "Chiusura non trovata" });

    return formatClosureResponse(row.closure, row.locationName);
  });
}
