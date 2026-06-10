import { randomUUID } from "node:crypto";
import { buildKitchenTicket } from "@pizzaguys/escpos";
import { categoryRouting, printers } from "@pizzaguys/edge-db";
import {
  categoryRoutingSchema,
  createPrinterSchema,
  updatePrinterSchema,
} from "@pizzaguys/validators";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { createHardwareBridge } from "@pizzaguys/hardware-bridge";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";
const hardware = createHardwareBridge({ printDir: PRINT_DIR });

export async function printerRoutes(app: FastifyInstance) {
  app.get("/api/printers", async () => {
    return app.edgeDb.select().from(printers).all();
  });

  app.post("/api/printers", async (req, reply) => {
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
      createdAt: new Date().toISOString(),
    };
    app.edgeDb.insert(printers).values(row).run();
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/api/printers/:id", async (req, reply) => {
    const parsed = updatePrinterSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
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
    const result = await hardware.printEscPos(printer.id, payload, "test");
    return reply.send(result);
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
    const result = await hardware.printEscPos(printer?.id ?? "pizzeria", payload, "test");
    return reply.send(result);
  });

  app.get("/api/category-routing", async () => {
    return app.edgeDb.select().from(categoryRouting).all();
  });

  app.put("/api/category-routing", async (req, reply) => {
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
