import { invoiceCustomerProfiles } from "@pizzaguys/db/schema";
import {
  createInvoiceCustomerProfileSchema,
  updateInvoiceCustomerProfileSchema,
} from "@pizzaguys/validators";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeAudit } from "../lib/audit.js";
import { getDefaultBrand } from "../lib/brand.js";
import { bumpSchemaVersion } from "../lib/schema-version.js";

export async function invoiceCustomerProfileRoutes(app: FastifyInstance) {
  const guard = { preHandler: [app.authenticate] };

  app.get("/api/v2/invoice-customers", guard, async (req) => {
    const brand = await getDefaultBrand(app.db);
    const q = (req.query as { q?: string }).q?.trim().toLowerCase();
    const rows = await app.db
      .select()
      .from(invoiceCustomerProfiles)
      .where(eq(invoiceCustomerProfiles.brandId, brand.id))
      .orderBy(invoiceCustomerProfiles.businessName);

    if (!q) return rows;
    return rows.filter((row) => {
      const haystack = [row.businessName, row.city, row.vatNumber, row.taxCode, row.phone]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  });

  app.get<{ Params: { id: string } }>("/api/v2/invoice-customers/:id", guard, async (req, reply) => {
    const brand = await getDefaultBrand(app.db);
    const row = await app.db.query.invoiceCustomerProfiles.findFirst({
      where: eq(invoiceCustomerProfiles.id, req.params.id),
    });
    if (!row || row.brandId !== brand.id) {
      return reply.status(404).send({ error: "Cliente non trovato" });
    }
    return row;
  });

  app.post("/api/v2/invoice-customers", guard, async (req, reply) => {
    const parsed = createInvoiceCustomerProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const brand = await getDefaultBrand(app.db);
    const [row] = await app.db
      .insert(invoiceCustomerProfiles)
      .values({
        brandId: brand.id,
        ...parsed.data,
      })
      .returning();
    await bumpSchemaVersion(app, brand.id);
    await writeAudit(app, {
      userId: req.user.sub,
      operation: "invoice_customer.create",
      nextState: row,
    });
    return reply.status(201).send(row);
  });

  app.patch<{ Params: { id: string } }>("/api/v2/invoice-customers/:id", guard, async (req, reply) => {
    const parsed = updateInvoiceCustomerProfileSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Dati non validi", details: parsed.error.flatten() });
    }
    const brand = await getDefaultBrand(app.db);
    const existing = await app.db.query.invoiceCustomerProfiles.findFirst({
      where: eq(invoiceCustomerProfiles.id, req.params.id),
    });
    if (!existing || existing.brandId !== brand.id) {
      return reply.status(404).send({ error: "Cliente non trovato" });
    }

    const merged = { ...existing, ...parsed.data, updatedAt: new Date() };
    const fiscalCheck = createInvoiceCustomerProfileSchema.safeParse(merged);
    if (!fiscalCheck.success) {
      return reply.status(400).send({ error: "Dati non validi", details: fiscalCheck.error.flatten() });
    }

    const [row] = await app.db
      .update(invoiceCustomerProfiles)
      .set({
        ...fiscalCheck.data,
        isActive: parsed.data.isActive ?? existing.isActive,
        updatedAt: new Date(),
      })
      .where(eq(invoiceCustomerProfiles.id, req.params.id))
      .returning();

    await bumpSchemaVersion(app, brand.id);
    return row;
  });
}
