"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import {
  DailyReportDetailPanel,
  type DailyReportSnapshot,
} from "@/components/DailyReportDetailPanel";
import { api } from "@/lib/api";
import { backLinkClass, inlineLinkClass } from "@/lib/cloud-admin-ui";

interface ClosureDetail {
  id: string;
  locationId: string;
  locationName: string;
  closureDate: string;
  fiscalZNumber: number | null;
  gross: number;
  cashDeclared: number;
  posDeclared: number;
  discrepancy: number;
  receivedAt: string;
  dailyReport?: DailyReportSnapshot | null;
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

export default function ClosureDetailPage() {
  const params = useParams<{ id: string }>();
  const closureId = params.id;
  const [closure, setClosure] = useState<ClosureDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!closureId) return;
    setLoading(true);
    setError("");
    api<ClosureDetail>(`/api/v2/closures/${closureId}`)
      .then(setClosure)
      .catch((err) => {
        setClosure(null);
        setError(err instanceof Error ? err.message : "Errore caricamento");
      })
      .finally(() => setLoading(false));
  }, [closureId]);

  if (loading) {
    return <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>;
  }

  if (error || !closure) {
    return (
      <div className="space-y-4">
        <Link
          href="/closures"
          className={inlineLinkClass}
        >
          ← Torna alle chiusure
        </Link>
        <p className="text-sm text-red-500">{error || "Chiusura non trovata"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/closures"
            className={backLinkClass}
          >
            ← Torna alle chiusure
          </Link>
          <h1 className="text-2xl font-bold">Dettaglio chiusura</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            {closure.locationName} · {closure.closureDate}
            {closure.fiscalZNumber != null ? ` · Z #${closure.fiscalZNumber}` : ""}
          </p>
          <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
            Ricevuta cloud: {new Date(closure.receivedAt).toLocaleString("it-IT")}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/closures">Elenco chiusure</Link>
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        {[
          ["Lordo", euro(closure.gross)],
          ["Contanti", euro(closure.cashDeclared)],
          ["POS", euro(closure.posDeclared)],
          ["Scostamento", euro(closure.discrepancy)],
          ["Z", closure.fiscalZNumber != null ? String(closure.fiscalZNumber) : "—"],
        ].map(([label, value]) => (
          <Card key={label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p
                className={`text-xl font-semibold tabular-nums ${
                  label === "Scostamento" && closure.discrepancy !== 0 ? "text-orange-600" : ""
                }`}
              >
                {value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report giornaliero</CardTitle>
        </CardHeader>
        <CardContent>
          {closure.dailyReport ? (
            <DailyReportDetailPanel snapshot={closure.dailyReport} />
          ) : (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              Nessun report giornaliero strutturato per questa chiusura (sync precedente alla Fase
              A/B).
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
