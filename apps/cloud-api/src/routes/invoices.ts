import { electronicInvoices, locations } from "@pizzaguys/db/schema";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.role !== "SUPER_ADMIN") {
    void reply.status(403).send({ error: "Non autorizzato" });
    return false;
  }
  return true;
}

export async function invoiceRoutes(app: FastifyInstance) {
  app.get("/api/v2/invoices", { preHandler: [app.authenticate] }, async (req, reply) => {
    if (!requireSuperAdmin(req, reply)) return;

    const locationId = (req.query as { locationId?: string }).locationId;

    const baseQuery = app.db
      .select({
        id: electronicInvoices.id,
        locationId: electronicInvoices.locationId,
        locationName: locations.name,
        edgeInvoiceId: electronicInvoices.edgeInvoiceId,
        receiptId: electronicInvoices.receiptId,
        invoiceNumber: electronicInvoices.invoiceNumber,
        businessName: electronicInvoices.businessName,
        customerVatNumber: electronicInvoices.customerVatNumber,
        customerTaxCode: electronicInvoices.customerTaxCode,
        customerSdiCode: electronicInvoices.customerSdiCode,
        customerPec: electronicInvoices.customerPec,
        total: electronicInvoices.total,
        paymentMethod: electronicInvoices.paymentMethod,
        tableLabel: electronicInvoices.tableLabel,
        status: electronicInvoices.status,
        issuedAt: electronicInvoices.issuedAt,
        receivedAt: electronicInvoices.receivedAt,
      })
      .from(electronicInvoices)
      .innerJoin(locations, eq(electronicInvoices.locationId, locations.id));

    const rows = await (locationId
      ? baseQuery.where(eq(electronicInvoices.locationId, locationId))
      : baseQuery
    )
      .orderBy(desc(electronicInvoices.receivedAt))
      .limit(100);

    return {
      invoices: rows.map((row) => ({
        ...row,
        total: Number(row.total),
      })),
    };
  });
}
