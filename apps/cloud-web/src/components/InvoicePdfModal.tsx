"use client";

import { Button } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { apiBlob } from "@/lib/api";
import { btnSize } from "@/lib/cloud-admin-ui";

export function InvoicePdfModal({
  invoiceId,
  invoiceNumber,
  onClose,
}: {
  invoiceId: string;
  invoiceNumber: string;
  onClose: () => void;
}) {
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let objectUrl: string | null = null;

    setLoading(true);
    setError("");
    setPdfUrl(null);

    void apiBlob(`/api/v2/invoices/${invoiceId}/pdf`)
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setPdfUrl(objectUrl);
      })
      .catch((err) => {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Errore caricamento PDF");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [invoiceId]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl bg-[hsl(var(--pg-background))] shadow-xl">
        <div className="flex shrink-0 items-center justify-between border-b border-[hsl(var(--pg-border))] px-4 py-3">
          <div>
            <h2 className="text-lg font-bold">Fattura allegata</h2>
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">n. {invoiceNumber}</p>
          </div>
          <Button size={btnSize.inline} variant="outline" onClick={onClose}>
            Chiudi
          </Button>
        </div>

        <div className="min-h-0 flex-1 bg-[hsl(var(--pg-muted))]/20">
          {loading && (
            <p className="p-6 text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento PDF...</p>
          )}
          {error && <p className="p-6 text-sm text-red-500">{error}</p>}
          {pdfUrl && !error && (
            <iframe
              title={`Fattura n. ${invoiceNumber}`}
              src={pdfUrl}
              className="h-full w-full border-0"
            />
          )}
        </div>
      </div>
    </div>
  );
}
