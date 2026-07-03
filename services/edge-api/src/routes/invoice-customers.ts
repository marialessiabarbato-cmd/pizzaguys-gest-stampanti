import {
  createInvoiceCustomerProfileSchema,
  updateInvoiceCustomerProfileSchema,
} from "@pizzaguys/validators";
import type { FastifyInstance } from "fastify";
import {
  createLocalInvoiceCustomerProfile,
  getInvoiceCustomerProfile,
  listInvoiceCustomerProfiles,
  upsertInvoiceCustomerProfile,
} from "../lib/invoice-customers.js";
import { enqueueCustomerProfileSync } from "../lib/sync-queue.js";

export async function invoiceCustomerRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { q?: string } }>("/api/invoice-customers", async (req) => {
    return listInvoiceCustomerProfiles(app.edgeDb, req.query.q);
  });

  app.get<{ Params: { id: string } }>("/api/invoice-customers/:id", async (req, reply) => {
    const profile = getInvoiceCustomerProfile(app.edgeDb, req.params.id);
    if (!profile) return reply.status(404).send({ error: "Cliente non trovato" });
    return profile;
  });

  app.post("/api/invoice-customers", async (req, reply) => {
    const parsed = createInvoiceCustomerProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const profile = createLocalInvoiceCustomerProfile(app.edgeDb, parsed.data);
    enqueueCustomerProfileSync(app.edgeDb, profile);
    return reply.status(201).send(profile);
  });

  app.put<{ Params: { id: string } }>("/api/invoice-customers/:id", async (req, reply) => {
    const existing = getInvoiceCustomerProfile(app.edgeDb, req.params.id);
    if (!existing) return reply.status(404).send({ error: "Cliente non trovato" });

    const parsed = updateInvoiceCustomerProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }

    const merged = {
      ...existing,
      ...parsed.data,
      businessName: parsed.data.businessName ?? existing.businessName,
      country: parsed.data.country ?? existing.country,
    };

    const fiscalCheck = createInvoiceCustomerProfileSchema.safeParse(merged);
    if (!fiscalCheck.success) {
      return reply.status(400).send({ error: "Dati non validi", details: fiscalCheck.error.flatten() });
    }

    const profile = upsertInvoiceCustomerProfile(app.edgeDb, {
      ...fiscalCheck.data,
      id: existing.id,
      source: "LOCAL",
      isActive: parsed.data.isActive ?? existing.isActive ?? true,
    });
    enqueueCustomerProfileSync(app.edgeDb, profile);
    return profile;
  });
}
