import { electronicInvoices, locations } from "@pizzaguys/db/schema";
import { buildMockInvoicePdf, type MockElectronicInvoice } from "@pizzaguys/fiscal";
import { desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";

function requireSuperAdmin(request: FastifyRequest, reply: FastifyReply) {
  if (request.user.role !== "SUPER_ADMIN") {
    void reply.status(403).send({ error: "Non autorizzato" });
    return false;
  }
  return true;
}

function formatInvoiceRow(
  row: {
    id: string;
    locationId: string;
    locationName: string;
    edgeInvoiceId: string;
    receiptId: string;
    invoiceNumber: string;
    businessName: string;
    customerVatNumber: string | null;
    customerTaxCode: string | null;
    customerSdiCode: string | null;
    customerPec: string | null;
    total: string | number;
    paymentMethod: string;
    tableLabel: string | null;
    status: "PENDING_SEND" | "SENT_TO_SDI" | "REJECTED";
    issuedAt: Date;
    receivedAt: Date;
    sdiSentAt?: Date | null;
    payload?: unknown;
  },
  includePayload = false,
) {
  const base = {
    id: row.id,
    locationId: row.locationId,
    locationName: row.locationName,
    edgeInvoiceId: row.edgeInvoiceId,
    receiptId: row.receiptId,
    invoiceNumber: row.invoiceNumber,
    businessName: row.businessName,
    customerVatNumber: row.customerVatNumber,
    customerTaxCode: row.customerTaxCode,
    customerSdiCode: row.customerSdiCode,
    customerPec: row.customerPec,
    total: Number(row.total),
    paymentMethod: row.paymentMethod,
    tableLabel: row.tableLabel,
    status: row.status,
    issuedAt: row.issuedAt,
    receivedAt: row.receivedAt,
    sdiSentAt: row.sdiSentAt ?? null,
  };
  return includePayload ? { ...base, payload: row.payload ?? null } : base;
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
      invoices: rows.map((row) => formatInvoiceRow(row)),
    };
  });

  app.get<{ Params: { id: string } }>(
    "/api/v2/invoices/:id",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!requireSuperAdmin(req, reply)) return;

      const rows = await app.db
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
          sdiSentAt: electronicInvoices.sdiSentAt,
          payload: electronicInvoices.payload,
        })
        .from(electronicInvoices)
        .innerJoin(locations, eq(electronicInvoices.locationId, locations.id))
        .where(eq(electronicInvoices.id, req.params.id))
        .limit(1);

      const row = rows[0];
      if (!row) return reply.status(404).send({ error: "Fattura non trovata" });

      return formatInvoiceRow(row, true);
    },
  );

  app.get<{ Params: { id: string } }>(
    "/api/v2/invoices/:id/pdf",
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      if (!requireSuperAdmin(req, reply)) return;

      const rows = await app.db
        .select({
          invoiceNumber: electronicInvoices.invoiceNumber,
          payload: electronicInvoices.payload,
        })
        .from(electronicInvoices)
        .where(eq(electronicInvoices.id, req.params.id))
        .limit(1);

      const row = rows[0];
      if (!row) return reply.status(404).send({ error: "Fattura non trovata" });

      const pdf = await buildMockInvoicePdf(row.payload as MockElectronicInvoice);

      return reply
        .header("Content-Type", "application/pdf")
        .header(
          "Content-Disposition",
          `inline; filename="fattura-${row.invoiceNumber}.pdf"`,
        )
        .send(Buffer.from(pdf));
    },
  );
}
