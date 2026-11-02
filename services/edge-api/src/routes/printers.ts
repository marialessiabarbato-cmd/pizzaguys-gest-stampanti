import { randomUUID } from "node:crypto";
import { buildKitchenTicket } from "@pizzaguys/escpos";
import { categoryRouting, printers } from "@pizzaguys/edge-db";
import {
  categoryRoutingSchema,
  createPrinterSchema,
  reprintJobSchema,
  updatePrinterSchema,
} from "@pizzaguys/validators";
import { printJobs } from "@pizzaguys/edge-db";
import { desc, eq, inArray, ne } from "drizzle-orm";
import { cancelJob, reprintJob, retryNowForPrinter } from "../lib/print-queue.js";
import { checkPrinters, getPrinterHealth } from "../lib/printer-monitor.js";
import type { FastifyInstance } from "fastify";
import { requireUserAdmin } from "../lib/operator-sessions.js";
import { friendlyReason, sendToPrinter } from "../lib/print-queue.js";

export async function printerRoutes(app: FastifyInstance) {
  const admin = requireUserAdmin(app.edgeDb);

  app.get("/api/printers", async () => {
    return app.edgeDb.select().from(printers).all();
  });

  app.post("/api/printers", { preHandler: admin }, async (req, reply) => {
    const parsed = createPrinterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const row = {
      id: randomUUID(),
      name: parsed.data.name,
      workCenter: parsed.data.workCenter,
      host: parsed.data.host ?? "127.0.0.1",
      port: parsed.data.port ?? 9100,
      enabled: parsed.data.enabled ?? true,
      fallbackPrinterId: parsed.data.fallbackPrinterId ?? null,
      createdAt: new Date().toISOString(),
    };
    app.edgeDb.insert(printers).values(row).run();
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/api/printers/:id", { preHandler: admin }, async (req, reply) => {
    const parsed = updatePrinterSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = parsed.error.flatten().fieldErrors;
      const first = fields.host?.[0] ?? (fields.port ? "Porta non valida (1–65535)" : undefined);
      return reply
        .status(400)
        .send({ error: first ?? "Dati non validi", details: parsed.error.flatten() });
    }
    if (parsed.data.fallbackPrinterId) {
      if (parsed.data.fallbackPrinterId === req.params.id) {
        return reply.status(400).send({ error: "La stampante di riserva deve essere un'altra stampante" });
      }
      const fb = app.edgeDb
        .select()
        .from(printers)
        .where(eq(printers.id, parsed.data.fallbackPrinterId))
        .get();
      if (!fb) return reply.status(400).send({ error: "Stampante di riserva non trovata" });
    }
    const updated = app.edgeDb
      .update(printers)
      .set(parsed.data)
      .where(eq(printers.id, req.params.id))
      .returning()
      .get();
    if (!updated) return reply.status(404).send({ error: "Stampante non trovata" });
    return updated;
  });

  /** Stato di ogni stampante (carta, coperchio, raggiungibilità) e ticket in attesa. */
  app.get("/api/printers/status", async (req) => {
    const refresh = (req.query as { refresh?: string } | undefined)?.refresh === "1";
    if (refresh) await checkPrinters(app.edgeDb);
    return { printers: getPrinterHealth(app.edgeDb) };
  });

  /** Coda di stampa: ultimi ticket (default 50), filtrabili per stato. */
  app.get<{ Querystring: { status?: string; limit?: string } }>("/api/print-jobs", async (req) => {
    const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 200);
    const statuses = req.query.status?.split(",").filter(Boolean) as
      | (typeof printJobs.$inferSelect.status)[]
      | undefined;
    const rows = app.edgeDb
      .select({
        id: printJobs.id,
        kind: printJobs.kind,
        tableLabel: printJobs.tableLabel,
        printerId: printJobs.printerId,
        printerName: printJobs.printerName,
        printedOnId: printJobs.printedOnId,
        printedOnName: printJobs.printedOnName,
        status: printJobs.status,
        attempts: printJobs.attempts,
        lastError: printJobs.lastError,
        nextAttemptAt: printJobs.nextAttemptAt,
        createdAt: printJobs.createdAt,
        printedAt: printJobs.printedAt,
        reprintOf: printJobs.reprintOf,
      })
      .from(printJobs)
      .where(
        statuses && statuses.length > 0
          ? inArray(printJobs.status, statuses)
          : ne(printJobs.kind, "TEST"),
      )
      .orderBy(desc(printJobs.createdAt))
      .limit(limit)
      .all();
    return { jobs: rows };
  });

  /** Ristampa qualsiasi ticket della coda (anche su un'altra stampante). */
  app.post<{ Params: { id: string } }>("/api/print-jobs/:id/reprint", async (req, reply) => {
    const parsed = reprintJobSchema.safeParse(req.body ?? {});
    if (!parsed.success) return reply.status(400).send({ error: "Dati non validi" });
    const result = await reprintJob(app.edgeDb, req.params.id, parsed.data.printerId);
    if (!result) return reply.status(404).send({ error: "Ticket non trovato" });
    return {
      ok: result.success,
      status: result.status,
      jobId: result.jobId,
      reroutedTo: result.reroutedTo,
      error: result.success ? undefined : friendlyReason(result.error, result.condition),
    };
  });

  /** Toglie dalla coda un ticket in attesa. */
  app.post<{ Params: { id: string } }>("/api/print-jobs/:id/cancel", async (req, reply) => {
    if (!cancelJob(app.edgeDb, req.params.id)) {
      return reply.status(409).send({ error: "Il ticket non è più in attesa" });
    }
    return { ok: true };
  });

  /** Ritenta subito i ticket in attesa di una stampante (es. dopo aver cambiato la carta). */
  app.post<{ Params: { id: string } }>("/api/printers/:id/retry", async (req) => {
    return { ok: true, retried: retryNowForPrinter(app.edgeDb, req.params.id) };
  });

  app.post<{ Params: { id: string } }>("/api/printers/:id/test", async (req, reply) => {
    const printer = app.edgeDb
      .select()
      .from(printers)
      .where(eq(printers.id, req.params.id))
      .get();
    if (!printer) return reply.status(404).send({ error: "Stampante non trovata" });

    const payload = buildKitchenTicket({
      workCenter: printer.workCenter,
      tableLabel: "TEST",
      guests: 1,
      operatorName: "Edge",
      lines: [{ name: "Stampa di prova", quantity: 1 }],
    });
    // La prova va diretta alla stampante (niente coda né riserva): serve a capire se risponde
    const result = await sendToPrinter(printer.id, printer, payload, "test");
    return reply.send(
      result.success ? result : { ...result, error: friendlyReason(result.error, result.condition) },
    );
  });

  app.post("/api/print/test", async (_req, reply) => {
    const printer = app.edgeDb.select().from(printers).limit(1).get();
    const workCenter = printer?.workCenter ?? "PIZZERIA";
    const payload = buildKitchenTicket({
      workCenter,
      tableLabel: "T1",
      guests: 2,
      operatorName: "Test",
      lines: [{ name: "Margherita", quantity: 1 }],
    });
    const result = await sendToPrinter(printer?.id ?? "pizzeria", printer, payload, "test");
    return reply.send(result);
  });

  app.get("/api/category-routing", async () => {
    return app.edgeDb.select().from(categoryRouting).all();
  });

  app.put("/api/category-routing", { preHandler: admin }, async (req, reply) => {
    const parsed = categoryRoutingSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const existing = app.edgeDb
      .select()
      .from(categoryRouting)
      .where(eq(categoryRouting.categoryId, parsed.data.categoryId))
      .get();
    if (existing) {
      app.edgeDb
        .update(categoryRouting)
        .set({ workCenter: parsed.data.workCenter })
        .where(eq(categoryRouting.categoryId, parsed.data.categoryId))
        .run();
    } else {
      app.edgeDb.insert(categoryRouting).values(parsed.data).run();
    }
    return { ok: true };
  });
}
