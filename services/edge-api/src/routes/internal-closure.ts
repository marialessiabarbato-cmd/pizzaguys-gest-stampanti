import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { internalClosureCompleteSchema } from "@pizzaguys/validators";
import type { FastifyInstance } from "fastify";
import {
  buildInternalClosureDraft,
  formatInternalClosureText,
  getInternalClosure,
  listInternalClosures,
  persistInternalClosure,
} from "../lib/internal-closure.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";

export async function internalClosureRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { date?: string } }>("/api/internal-closure/draft", async (req) => {
    const date = req.query.date ?? new Date().toISOString().slice(0, 10);
    return buildInternalClosureDraft(app.edgeDb, date);
  });

  app.get<{ Querystring: { from?: string; to?: string } }>(
    "/api/internal-closure/history",
    async (req) => listInternalClosures(app.edgeDb, req.query.from, req.query.to),
  );

  app.get<{ Params: { id: string } }>("/api/internal-closure/history/:id", async (req, reply) => {
    const row = getInternalClosure(app.edgeDb, req.params.id);
    if (!row) return reply.status(404).send({ error: "Chiusura non trovata" });
    return row;
  });

  app.post("/api/internal-closure/complete", async (req, reply) => {
    const parsed = internalClosureCompleteSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const record = persistInternalClosure(app.edgeDb, parsed.data, {
      staffId: parsed.data.operatorId,
      name: parsed.data.operatorName,
    });

    return { ok: true, record };
  });

  app.post<{ Params: { id: string } }>(
    "/api/internal-closure/history/:id/print",
    async (req, reply) => {
      const row = getInternalClosure(app.edgeDb, req.params.id);
      if (!row) return reply.status(404).send({ error: "Chiusura non trovata" });

      await mkdir(PRINT_DIR, { recursive: true });
      const path = join(PRINT_DIR, `${Date.now()}-internal-closure-${row.closureDate}.txt`);
      await writeFile(path, formatInternalClosureText(row), "utf8");
      return { ok: true, path, text: formatInternalClosureText(row) };
    },
  );
}
