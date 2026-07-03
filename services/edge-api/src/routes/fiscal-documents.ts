import type { FiscalDocumentType, PaymentMethod } from "@pizzaguys/types";
import { edgeState } from "@pizzaguys/edge-db";
import { formatMockReceiptText } from "@pizzaguys/fiscal";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { sql } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { writeEdgeAudit } from "../lib/audit.js";
import {
  buildFiscalDocumentsCsv,
  getFiscalDocument,
  listFiscalDocuments,
  serviceTypeLabel,
  updateFiscalDocumentPayment,
  voidFiscalDocument,
  type FiscalDocumentListFilters,
} from "../lib/fiscal-document-archive.js";
import {
  formatProformaInvoiceText,
  voidAndRestoreFiscalDocument,
} from "../lib/fiscal-document-actions.js";

const PRINT_DIR = process.env.MOCK_PRINT_DIR ?? "./tmp/prints";

const DOC_TYPES = new Set(["ALL", "RECEIPT", "INVOICE", "TRAINING"]);
const PAYMENT_METHODS = new Set(["ALL", "CASH", "POS", "MEAL_VOUCHER", "SATISPAY", "OTHER"]);
const STATUSES = new Set(["ALL", "ACTIVE", "VOIDED"]);

function parseListFilters(query: Record<string, unknown>): FiscalDocumentListFilters {
  const documentType = String(query.documentType ?? "ALL");
  const paymentMethod = String(query.paymentMethod ?? "ALL");
  const status = String(query.status ?? "ACTIVE");
  const limitRaw = query.limit != null ? Number(query.limit) : undefined;

  return {
    from: query.from ? String(query.from) : undefined,
    to: query.to ? String(query.to) : undefined,
    documentType: DOC_TYPES.has(documentType)
      ? (documentType as FiscalDocumentListFilters["documentType"])
      : "ALL",
    paymentMethod: PAYMENT_METHODS.has(paymentMethod)
      ? (paymentMethod as FiscalDocumentListFilters["paymentMethod"])
      : "ALL",
    operatorStaffId: query.operatorStaffId ? String(query.operatorStaffId) : undefined,
    tableLabel: query.tableLabel ? String(query.tableLabel) : undefined,
    customer: query.customer ? String(query.customer) : undefined,
    status: STATUSES.has(status) ? (status as FiscalDocumentListFilters["status"]) : "ACTIVE",
    q: query.q ? String(query.q) : undefined,
    limit: limitRaw && Number.isFinite(limitRaw) ? Math.min(1000, Math.max(1, limitRaw)) : undefined,
  };
}

function summarize(rows: ReturnType<typeof listFiscalDocuments>) {
  const active = rows.filter((r) => r.status === "ISSUED");
  return {
    count: rows.length,
    total: Math.round(active.reduce((s, r) => s + r.total, 0) * 100) / 100,
  };
}

export async function fiscalDocumentRoutes(app: FastifyInstance) {
  app.get("/api/fiscal-documents", async (req) => {
    const rows = listFiscalDocuments(app.edgeDb, parseListFilters(req.query as Record<string, unknown>));
    return {
      documents: rows,
      summary: summarize(rows),
    };
  });

  app.get("/api/fiscal-documents/export.csv", async (req, reply) => {
    const filters = parseListFilters(req.query as Record<string, unknown>);
    const rows = listFiscalDocuments(app.edgeDb, { ...filters, limit: filters.limit ?? 1000 });
    const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
    const csv = buildFiscalDocumentsCsv(rows, state?.locationName ?? undefined);
    const from = filters.from ?? "all";
    const to = filters.to ?? "all";
    return reply
      .header("Content-Type", "text/csv; charset=utf-8")
      .header("Content-Disposition", `attachment; filename="documenti-${from}_${to}.csv"`)
      .send(csv);
  });

  app.get<{ Params: { id: string } }>("/api/fiscal-documents/:id", async (req, reply) => {
    const doc = getFiscalDocument(app.edgeDb, req.params.id);
    if (!doc) return reply.status(404).send({ error: "Documento non trovato" });
    return doc;
  });

  app.post<{ Params: { id: string } }>("/api/fiscal-documents/:id/reprint", async (req, reply) => {
    const doc = getFiscalDocument(app.edgeDb, req.params.id);
    if (!doc) return reply.status(404).send({ error: "Documento non trovato" });

    await mkdir(PRINT_DIR, { recursive: true });
    const stamp = Date.now();
    const txtPath = join(PRINT_DIR, `${stamp}-reprint-${doc.id}.txt`);
    const text = formatMockReceiptText(doc.receipt, {
      ...doc.meta,
      reprint: true,
      documentNumber: doc.documentNumber,
      serviceTypeLabel: serviceTypeLabel(doc.serviceType),
    });
    await writeFile(txtPath, text, "utf8");

    writeEdgeAudit(app.edgeDb, {
      staffId: doc.operatorStaffId ?? undefined,
      operation: "FISCAL_DOCUMENT_REPRINT",
      severity: "INFO",
      nextState: { documentId: doc.id, path: txtPath },
    });

    return { ok: true, path: txtPath, preview: text };
  });

  app.post<{ Params: { id: string } }>(
    "/api/fiscal-documents/:id/reprint-proforma",
    async (req, reply) => {
      const doc = getFiscalDocument(app.edgeDb, req.params.id);
      if (!doc) return reply.status(404).send({ error: "Documento non trovato" });
      if (doc.documentType !== "INVOICE" && !doc.invoiceId) {
        return reply.status(400).send({ error: "Proforma disponibile solo per fatture" });
      }

      const state = app.edgeDb.select().from(edgeState).where(sql`id = 1`).get();
      await mkdir(PRINT_DIR, { recursive: true });
      const stamp = Date.now();
      const txtPath = join(PRINT_DIR, `${stamp}-proforma-${doc.id}.txt`);
      const text = formatProformaInvoiceText(doc, state?.locationName ?? undefined);
      await writeFile(txtPath, text, "utf8");

      writeEdgeAudit(app.edgeDb, {
        staffId: doc.operatorStaffId ?? undefined,
        operation: "FISCAL_DOCUMENT_REPRINT_PROFORMA",
        severity: "INFO",
        nextState: { documentId: doc.id, path: txtPath },
      });

      return { ok: true, path: txtPath, preview: text };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/fiscal-documents/:id/void-restore",
    async (req, reply) => {
      const body = req.body as { staffId?: string };
      if (!body?.staffId) {
        return reply.status(400).send({ error: "staffId obbligatorio" });
      }

      const result = voidAndRestoreFiscalDocument(app.edgeDb, req.params.id, body.staffId);
      if (!result.ok) {
        return reply.status(result.status ?? 400).send({ error: result.error });
      }

      writeEdgeAudit(app.edgeDb, {
        staffId: body.staffId,
        operation: "FISCAL_DOCUMENT_VOID_RESTORE",
        severity: "WARNING",
        nextState: {
          documentId: result.document.id,
          tableId: result.tableId,
          tableLabel: result.tableLabel,
        },
      });

      return {
        ok: true,
        document: result.document,
        tableId: result.tableId,
        tableLabel: result.tableLabel,
      };
    },
  );

  app.post<{ Params: { id: string } }>(
    "/api/fiscal-documents/:id/void",
    async (req, reply) => {
      const body = req.body as { staffId?: string; reason?: string };
      if (!body?.staffId) {
        return reply.status(400).send({ error: "staffId obbligatorio" });
      }

      const updated = voidFiscalDocument(app.edgeDb, req.params.id, {
        staffId: body.staffId,
        reason: body.reason,
      });
      if (!updated) {
        return reply.status(404).send({ error: "Documento non trovato o già annullato" });
      }

      writeEdgeAudit(app.edgeDb, {
        staffId: body.staffId,
        operation: "FISCAL_DOCUMENT_VOID",
        severity: "WARNING",
        nextState: {
          documentId: updated.id,
          documentNumber: updated.documentNumber,
          total: updated.total,
          reason: body.reason,
        },
      });

      return { ok: true, document: updated };
    },
  );

  app.patch<{ Params: { id: string } }>(
    "/api/fiscal-documents/:id/payment",
    async (req, reply) => {
      const body = req.body as { staffId?: string; paymentMethod?: PaymentMethod };
      if (!body?.staffId || !body.paymentMethod) {
        return reply.status(400).send({ error: "staffId e paymentMethod obbligatori" });
      }
      if (!PAYMENT_METHODS.has(body.paymentMethod)) {
        return reply.status(400).send({ error: "Metodo pagamento non valido" });
      }

      const existing = getFiscalDocument(app.edgeDb, req.params.id);
      if (!existing) return reply.status(404).send({ error: "Documento non trovato" });
      if (existing.status === "VOIDED") {
        return reply.status(400).send({ error: "Documento annullato" });
      }

      const updated = updateFiscalDocumentPayment(
        app.edgeDb,
        req.params.id,
        body.paymentMethod,
      );
      if (!updated) return reply.status(404).send({ error: "Documento non trovato" });

      writeEdgeAudit(app.edgeDb, {
        staffId: body.staffId,
        operation: "FISCAL_DOCUMENT_PAYMENT_UPDATE",
        severity: "WARNING",
        previousState: { paymentMethod: existing.paymentMethod },
        nextState: { paymentMethod: body.paymentMethod, documentId: updated.id },
      });

      return { ok: true, document: updated };
    },
  );
}
