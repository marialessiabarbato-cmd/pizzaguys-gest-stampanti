import type { FiscalDocumentType, PaymentMethod } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { edgeApi, edgeApiDownload } from "../lib/api";
import { DocumentOrderDetailsModal } from "./DocumentOrderDetailsModal";
import { ConfirmModal } from "./ConfirmModal";
import {
  PAYMENT_LABELS,
  PaymentMethodChangeModal,
} from "./PaymentMethodChangeModal";

interface StaffRow {
  id: string;
  firstName: string;
  lastName: string;
}

interface FiscalDocumentRow {
  id: string;
  documentNumber: number;
  documentType: FiscalDocumentType;
  issuedAt: string;
  tableLabel: string | null;
  paymentMethod: PaymentMethod;
  serviceType: string | null;
  total: number;
  operatorName: string | null;
  customerBusinessName: string | null;
  status: "ISSUED" | "VOIDED";
  voidedAt: string | null;
  invoiceNumber: string | null;
  receipt: {
    lines: Array<{ name: string; quantity: number; unitPrice: number; vatRate: number }>;
    total: number;
    change?: number;
    fiscalNote?: string;
    paymentMethod: PaymentMethod;
    documentType: FiscalDocumentType;
  };
  meta: {
    tableLabel?: string;
    operatorName?: string;
    amountReceived?: number;
    serviceTypeLabel?: string;
    orderLines?: Array<{ name: string; quantity: number; unitPrice: number; vatRate?: number }>;
  };
}

const PAYMENT_METHODS_FILTER: PaymentMethod[] = ["CASH", "POS", "MEAL_VOUCHER", "SATISPAY", "OTHER"];

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function typeCode(type: FiscalDocumentType) {
  if (type === "INVOICE") return "F";
  if (type === "TRAINING") return "T";
  return "S";
}

function typeLabel(type: FiscalDocumentType) {
  if (type === "INVOICE") return "Fattura";
  if (type === "TRAINING") return "Addestramento";
  return "Scontrino";
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function buildPreview(doc: FiscalDocumentRow): string {
  const lines: string[] = [];
  const issued = new Date(doc.issuedAt);
  lines.push(`${typeLabel(doc.documentType)} # ${doc.documentNumber}`);
  if (doc.meta.tableLabel ?? doc.tableLabel) {
    lines.push(`Tavolo ${doc.meta.tableLabel ?? doc.tableLabel}`);
  }
  if (doc.meta.serviceTypeLabel) {
    lines.push(`Tipo di servizio ${doc.meta.serviceTypeLabel}`);
  }
  if (doc.status === "VOIDED") {
    lines.push("*** ANNULLATO ***");
  }
  lines.push("");
  for (const line of doc.receipt.lines) {
    const lineTotal = Math.round(line.quantity * line.unitPrice * 100) / 100;
    lines.push(`${line.quantity} ${line.name}`.padEnd(28) + `EUR ${lineTotal.toFixed(2)}`);
  }
  lines.push("");
  lines.push(`TOTALE ${doc.receipt.total.toFixed(2)}`);
  lines.push("");
  if (doc.receipt.fiscalNote) lines.push(`*** ${doc.receipt.fiscalNote} ***`);
  lines.push(PAYMENT_LABELS[doc.paymentMethod] ?? doc.paymentMethod);
  if (doc.paymentMethod === "CASH" && doc.meta.amountReceived != null) {
    lines.push(`Contante dato: ${doc.meta.amountReceived.toFixed(2)}`);
    if (doc.receipt.change != null && doc.receipt.change > 0) {
      lines.push(`Resto: ${doc.receipt.change.toFixed(2)}`);
    }
  }
  if (doc.customerBusinessName) lines.push(`Cliente: ${doc.customerBusinessName}`);
  if (doc.invoiceNumber) lines.push(`Fattura n. ${doc.invoiceNumber}`);
  lines.push("");
  lines.push(
    issued.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }) +
      " - " +
      issued.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }),
  );
  if (doc.meta.operatorName ?? doc.operatorName) {
    lines.push(`Op: ${doc.meta.operatorName ?? doc.operatorName}`);
  }
  return lines.join("\n");
}

export function DocumentListModal({
  operatorId,
  onClose,
}: {
  operatorId: string;
  onClose: () => void;
}) {
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [documentType, setDocumentType] = useState<"ALL" | FiscalDocumentType>("ALL");
  const [paymentMethod, setPaymentMethod] = useState<"ALL" | PaymentMethod>("ALL");
  const [operatorStaffId, setOperatorStaffId] = useState("");
  const [tableLabel, setTableLabel] = useState("");
  const [customer, setCustomer] = useState("");
  const [status, setStatus] = useState<"ALL" | "ACTIVE" | "VOIDED">("ACTIVE");
  const [q, setQ] = useState("");
  const [documents, setDocuments] = useState<FiscalDocumentRow[]>([]);
  const [summary, setSummary] = useState({ count: 0, total: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [showPaymentEdit, setShowPaymentEdit] = useState(false);
  const [confirmVoid, setConfirmVoid] = useState(false);
  const [confirmVoidRestore, setConfirmVoidRestore] = useState(false);
  const [showOrderDetails, setShowOrderDetails] = useState(false);

  const selected = useMemo(
    () => documents.find((d) => d.id === selectedId) ?? null,
    [documents, selectedId],
  );

  const selectedOrderLines = useMemo(() => {
    if (!selected) return [];
    return (
      selected.meta.orderLines ??
      selected.receipt.lines.map((l) => ({
        name: l.name,
        quantity: l.quantity,
        unitPrice: l.unitPrice,
        vatRate: l.vatRate,
      }))
    );
  }, [selected]);

  const canProforma = Boolean(
    selected && (selected.documentType === "INVOICE" || selected.invoiceId),
  );
  const canVoidRestore = Boolean(selected?.tableId && selected.status !== "VOIDED");

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, status });
      if (documentType !== "ALL") params.set("documentType", documentType);
      if (paymentMethod !== "ALL") params.set("paymentMethod", paymentMethod);
      if (operatorStaffId) params.set("operatorStaffId", operatorStaffId);
      if (tableLabel.trim()) params.set("tableLabel", tableLabel.trim());
      if (customer.trim()) params.set("customer", customer.trim());
      if (q.trim()) params.set("q", q.trim());
      const data = await edgeApi<{
        documents: FiscalDocumentRow[];
        summary: { count: number; total: number };
      }>(`/api/fiscal-documents?${params}`);
      setDocuments(data.documents);
      setSummary(data.summary);
      setSelectedId((prev) =>
        prev && data.documents.some((d) => d.id === prev) ? prev : data.documents[0]?.id ?? null,
      );
    } catch (err) {
      setDocuments([]);
      setSummary({ count: 0, total: 0 });
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [from, to, documentType, paymentMethod, operatorStaffId, tableLabel, customer, status, q]);

  useEffect(() => {
    void edgeApi<StaffRow[]>("/api/staff")
      .then(setStaff)
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const exportCsv = async () => {
    setActionLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, status });
      if (documentType !== "ALL") params.set("documentType", documentType);
      if (paymentMethod !== "ALL") params.set("paymentMethod", paymentMethod);
      if (operatorStaffId) params.set("operatorStaffId", operatorStaffId);
      if (tableLabel.trim()) params.set("tableLabel", tableLabel.trim());
      if (customer.trim()) params.set("customer", customer.trim());
      if (q.trim()) params.set("q", q.trim());
      await edgeApiDownload(`/api/fiscal-documents/export.csv?${params}`, `documenti-${from}_${to}.csv`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore export");
    } finally {
      setActionLoading(false);
    }
  };

  const reprint = async () => {
    if (!selected) return;
    setActionLoading(true);
    setMessage("");
    setError("");
    try {
      const result = await edgeApi<{ path: string }>(`/api/fiscal-documents/${selected.id}/reprint`, {
        method: "POST",
      });
      setMessage(`Ristampa salvata: ${result.path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore ristampa");
    } finally {
      setActionLoading(false);
    }
  };

  const reprintProforma = async () => {
    if (!selected) return;
    setActionLoading(true);
    setMessage("");
    setError("");
    try {
      const result = await edgeApi<{ path: string }>(
        `/api/fiscal-documents/${selected.id}/reprint-proforma`,
        { method: "POST" },
      );
      setMessage(`Proforma salvata: ${result.path}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore ristampa proforma");
    } finally {
      setActionLoading(false);
    }
  };

  const voidDocument = async () => {
    if (!selected) return;
    setActionLoading(true);
    setMessage("");
    try {
      await edgeApi(`/api/fiscal-documents/${selected.id}/void`, {
        method: "POST",
        body: JSON.stringify({ staffId: operatorId }),
      });
      setConfirmVoid(false);
      setMessage("Documento annullato");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore annullo");
    } finally {
      setActionLoading(false);
    }
  };

  const voidAndRestore = async () => {
    if (!selected) return;
    setActionLoading(true);
    setMessage("");
    setError("");
    try {
      const result = await edgeApi<{
        tableId: string;
        tableLabel: string | null;
      }>(`/api/fiscal-documents/${selected.id}/void-restore`, {
        method: "POST",
        body: JSON.stringify({ staffId: operatorId }),
      });
      setConfirmVoidRestore(false);
      setMessage(
        `Documento annullato — conto ripristinato su tavolo ${result.tableLabel ?? result.tableId}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore annulla e ripristina");
    } finally {
      setActionLoading(false);
    }
  };

  const updatePayment = async (method: PaymentMethod) => {
    if (!selected) return;
    setActionLoading(true);
    setMessage("");
    try {
      await edgeApi(`/api/fiscal-documents/${selected.id}/payment`, {
        method: "PATCH",
        body: JSON.stringify({ staffId: operatorId, paymentMethod: method }),
      });
      setShowPaymentEdit(false);
      setMessage(
        `Pagamento aggiornato: ${PAYMENT_LABELS[selected.paymentMethod]} → ${PAYMENT_LABELS[method]}`,
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Errore modifica pagamento");
    } finally {
      setActionLoading(false);
    }
  };

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-2 md:p-4">
        <div className="flex h-[95vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-[hsl(var(--pg-background))] shadow-xl">
          <div className="flex shrink-0 items-center justify-between border-b border-[hsl(var(--pg-border))] px-4 py-3">
            <div>
              <h2 className="text-lg font-bold">Lista documenti</h2>
              <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                Totale documenti: {euro(summary.total)} · {summary.count} risultati
              </p>
            </div>
            <Button variant="outline" onClick={onClose}>
              Chiudi
            </Button>
          </div>

          <div className="shrink-0 border-b border-[hsl(var(--pg-border))] px-4 py-3">
            <div className="grid gap-2 md:grid-cols-4 lg:grid-cols-6">
              <label className="text-xs">
                Da
                <input
                  type="date"
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={from}
                  onChange={(e) => setFrom(e.target.value)}
                />
              </label>
              <label className="text-xs">
                A
                <input
                  type="date"
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={to}
                  onChange={(e) => setTo(e.target.value)}
                />
              </label>
              <label className="text-xs">
                Tipo
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as typeof documentType)}
                >
                  <option value="ALL">Tutti</option>
                  <option value="RECEIPT">Scontrino</option>
                  <option value="INVOICE">Fattura</option>
                  <option value="TRAINING">Addestramento</option>
                </select>
              </label>
              <label className="text-xs">
                Pagamento
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as typeof paymentMethod)}
                >
                  <option value="ALL">Tutti</option>
                  {PAYMENT_METHODS_FILTER.map((m) => (
                    <option key={m} value={m}>
                      {PAYMENT_LABELS[m]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Operatore
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={operatorStaffId}
                  onChange={(e) => setOperatorStaffId(e.target.value)}
                >
                  <option value="">Tutti</option>
                  {staff.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.firstName} {s.lastName}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-xs">
                Stato
                <select
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as typeof status)}
                >
                  <option value="ACTIVE">Solo non annullati</option>
                  <option value="ALL">Tutti</option>
                  <option value="VOIDED">Solo annullati</option>
                </select>
              </label>
              <label className="text-xs md:col-span-2">
                Tavolo
                <input
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  placeholder="es. ASP1, 12"
                  value={tableLabel}
                  onChange={(e) => setTableLabel(e.target.value)}
                />
              </label>
              <label className="text-xs md:col-span-2">
                Cliente
                <input
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  value={customer}
                  onChange={(e) => setCustomer(e.target.value)}
                />
              </label>
              <label className="text-xs md:col-span-2">
                Cerca
                <input
                  className="mt-1 w-full rounded border px-2 py-1.5 text-sm"
                  placeholder="numero, id, operatore..."
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
              </label>
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <Button variant="outline" className="h-9" onClick={() => void load()} disabled={loading}>
                Visualizza
              </Button>
              <Button className="h-9" onClick={() => void exportCsv()} disabled={actionLoading}>
                Esporta CSV
              </Button>
            </div>
          </div>

          {(error || message) && (
            <p
              className={`shrink-0 px-4 py-2 text-sm ${error ? "text-red-500" : "text-[hsl(var(--pg-muted-foreground))]"}`}
            >
              {error || message}
            </p>
          )}

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
            <div className="min-h-0 overflow-auto border-r border-[hsl(var(--pg-border))]">
              {loading ? (
                <p className="p-4 text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
              ) : documents.length === 0 ? (
                <p className="p-4 text-sm text-[hsl(var(--pg-muted-foreground))]">
                  Nessun documento nel periodo. I pagamenti da oggi compariranno qui.
                </p>
              ) : (
                <table className="w-full text-xs">
                  <thead className="sticky top-0 bg-[hsl(var(--pg-muted))]/80 text-left">
                    <tr>
                      <th className="px-2 py-2">Data</th>
                      <th className="px-2 py-2">Ora</th>
                      <th className="px-2 py-2">Tipo</th>
                      <th className="px-2 py-2">Num</th>
                      <th className="px-2 py-2">Tavolo</th>
                      <th className="px-2 py-2">Pag.</th>
                      <th className="px-2 py-2 text-right">Totale</th>
                    </tr>
                  </thead>
                  <tbody>
                    {documents.map((doc) => {
                      const issued = new Date(doc.issuedAt);
                      const active = doc.id === selectedId;
                      return (
                        <tr
                          key={doc.id}
                          className={`cursor-pointer border-t border-[hsl(var(--pg-border))] ${
                            active ? "bg-[hsl(var(--pg-primary))]/15" : "hover:bg-[hsl(var(--pg-muted))]/30"
                          } ${doc.status === "VOIDED" ? "opacity-60 line-through" : ""}`}
                          onClick={() => setSelectedId(doc.id)}
                        >
                          <td className="px-2 py-2">
                            {issued.toLocaleDateString("it-IT", {
                              day: "2-digit",
                              month: "2-digit",
                              year: "2-digit",
                            })}
                          </td>
                          <td className="px-2 py-2 tabular-nums">
                            {issued.toLocaleTimeString("it-IT", {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>
                          <td className="px-2 py-2">{typeCode(doc.documentType)}</td>
                          <td className="px-2 py-2 tabular-nums">{doc.documentNumber}</td>
                          <td className="px-2 py-2">{doc.tableLabel ?? "—"}</td>
                          <td className="px-2 py-2 text-[10px] font-medium">
                            {PAYMENT_LABELS[doc.paymentMethod]?.slice(0, 4) ?? doc.paymentMethod}
                          </td>
                          <td className="px-2 py-2 text-right tabular-nums">{euro(doc.total)}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <div className="flex min-h-0 flex-col">
              {selected ? (
                <>
                  <pre className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap p-4 font-mono text-xs leading-relaxed">
                    {buildPreview(selected)}
                  </pre>
                  <div className="space-y-2 border-t border-[hsl(var(--pg-border))] p-3">
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="h-9"
                        disabled={actionLoading}
                        onClick={() => void reprint()}
                      >
                        Ristampa
                      </Button>
                      <Button
                        variant="outline"
                        className="h-9 text-red-600"
                        disabled={actionLoading || selected.status === "VOIDED"}
                        onClick={() => setConfirmVoid(true)}
                      >
                        Annulla
                      </Button>
                      <Button
                        variant="outline"
                        className="h-9"
                        disabled={actionLoading || !canProforma || selected.status === "VOIDED"}
                        onClick={() => void reprintProforma()}
                      >
                        Ristampa proforma
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Button
                        variant="outline"
                        className="h-9"
                        disabled={actionLoading || selectedOrderLines.length === 0}
                        onClick={() => setShowOrderDetails(true)}
                      >
                        Dettagli ordine
                      </Button>
                      <Button
                        variant="outline"
                        className="h-9"
                        disabled={actionLoading || !canVoidRestore}
                        onClick={() => setConfirmVoidRestore(true)}
                      >
                        Annulla e ripristina
                      </Button>
                      <Button
                        variant="outline"
                        className="h-9"
                        disabled={actionLoading || selected.status === "VOIDED"}
                        onClick={() => setShowPaymentEdit(true)}
                      >
                        Cambia metodo pagamento
                      </Button>
                    </div>
                  </div>
                </>
              ) : (
                <p className="p-4 text-sm text-[hsl(var(--pg-muted-foreground))]">
                  Seleziona un documento per l&apos;anteprima.
                </p>
              )}
            </div>
          </div>
        </div>
      </div>

      {showPaymentEdit && selected && (
        <PaymentMethodChangeModal
          documentNumber={selected.documentNumber}
          documentType={selected.documentType}
          tableLabel={selected.tableLabel}
          total={selected.total}
          currentMethod={selected.paymentMethod}
          loading={actionLoading}
          onConfirm={(method) => void updatePayment(method)}
          onCancel={() => setShowPaymentEdit(false)}
        />
      )}

      {confirmVoid && selected && (
        <ConfirmModal
          title="Annullare il documento?"
          message={`Confermi l'annullo di ${typeLabel(selected.documentType)} #${selected.documentNumber} (${euro(selected.total)})? Il conto non verrà ripristinato.`}
          confirmLabel="Annulla documento"
          variant="danger"
          onConfirm={() => void voidDocument()}
          onCancel={() => setConfirmVoid(false)}
        />
      )}

      {confirmVoidRestore && selected && (
        <ConfirmModal
          title="Annulla e ripristina?"
          message={`Annulla ${typeLabel(selected.documentType)} #${selected.documentNumber} e riapre il conto sul tavolo ${selected.tableLabel ?? "—"}. Il tavolo deve essere libero.`}
          confirmLabel="Annulla e ripristina"
          variant="danger"
          onConfirm={() => void voidAndRestore()}
          onCancel={() => setConfirmVoidRestore(false)}
        />
      )}

      {showOrderDetails && selected && (
        <DocumentOrderDetailsModal
          documentNumber={selected.documentNumber}
          documentType={selected.documentType}
          tableLabel={selected.tableLabel}
          issuedAt={selected.issuedAt}
          operatorName={selected.operatorName}
          lines={selectedOrderLines}
          total={selected.total}
          onClose={() => setShowOrderDetails(false)}
        />
      )}
    </>
  );
}
