"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { api, apiText } from "@/lib/api";
import {
  btnSize,
  detailLinkClass,
  formRowEndGap3Class,
  stackedInputClass,
  stackedLabelClass,
  stackedSelectClass,
} from "@/lib/cloud-admin-ui";

interface Location {
  id: string;
  name: string;
}

interface ClosureRow {
  id: string;
  closureDate: string;
  fiscalZNumber: number | null;
  gross: number;
  cashDeclared: number;
  posDeclared: number;
  discrepancy: number;
  byPaymentMethod: Record<string, number>;
  receivedAt: string;
}

interface NightlyRow {
  locationId: string;
  locationName: string;
  gross: number;
  cash: number;
  pos: number;
  zStatus: "Inviata" | "Mancante";
  missing: boolean;
  fiscalZNumber?: number;
  discrepancy: number;
}

interface NightlySummary {
  closureDate: string;
  totalGross: number;
  missingCount: number;
  detailCount?: number;
  rows: NightlyRow[];
}

interface EmailConfig {
  mode: "mock" | "resend";
  mockDir: string;
  from: string | null;
}

interface SendReportResult {
  rowCount: number;
  recipients: string[];
  path?: string;
  messageId?: string;
  mode: "mock" | "resend";
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

function yesterdayKey() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}

function daysAgoKey(days: number) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export default function ClosuresPage() {
  const [locations, setLocations] = useState<Location[]>([]);
  const [selectedLocationId, setSelectedLocationId] = useState("");
  const [closuresFrom, setClosuresFrom] = useState(daysAgoKey(30));
  const [closuresTo, setClosuresTo] = useState(todayKey());
  const [closures, setClosures] = useState<ClosureRow[]>([]);
  const [closuresLoading, setClosuresLoading] = useState(false);

  const [reportDate, setReportDate] = useState(yesterdayKey());
  const [summary, setSummary] = useState<NightlySummary | null>(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [reportMessage, setReportMessage] = useState("");
  const [reportError, setReportError] = useState("");
  const [emailConfig, setEmailConfig] = useState<EmailConfig | null>(null);

  useEffect(() => {
    api<Location[]>("/api/v2/locations")
      .then((rows) => {
        setLocations(rows);
        if (rows.length > 0) setSelectedLocationId(rows[0]!.id);
      })
      .catch(console.error);
    api<EmailConfig>("/api/v2/reports/email-config")
      .then(setEmailConfig)
      .catch(console.error);
  }, []);

  const loadClosures = useCallback(async () => {
    if (!selectedLocationId) return;
    setClosuresLoading(true);
    try {
      const params = new URLSearchParams({ from: closuresFrom, to: closuresTo, limit: "90" });
      const rows = await api<ClosureRow[]>(
        `/api/v2/locations/${selectedLocationId}/closures?${params}`,
      );
      setClosures(rows);
    } catch (err) {
      console.error(err);
      setClosures([]);
    } finally {
      setClosuresLoading(false);
    }
  }, [selectedLocationId, closuresFrom, closuresTo]);

  useEffect(() => {
    void loadClosures();
  }, [loadClosures]);

  const loadReportSummary = useCallback(async () => {
    setReportLoading(true);
    setReportError("");
    try {
      const data = await api<NightlySummary>(
        `/api/v2/reports/nightly/summary?date=${reportDate}`,
      );
      setSummary(data);
    } catch (err) {
      setSummary(null);
      setReportError(err instanceof Error ? err.message : "Errore caricamento report");
    } finally {
      setReportLoading(false);
    }
  }, [reportDate]);

  useEffect(() => {
    void loadReportSummary();
  }, [loadReportSummary]);

  const previewReport = async () => {
    setReportMessage("");
    setReportError("");
    try {
      const html = await apiText(`/api/v2/reports/nightly/preview?date=${reportDate}`);
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Errore anteprima");
    }
  };

  const sendReport = async () => {
    setReportMessage("");
    setReportError("");
    try {
      const result = await api<SendReportResult>(
        `/api/v2/reports/nightly/send?date=${reportDate}`,
        { method: "POST" },
      );
      const recipientList = result.recipients.join(", ");
      if (result.mode === "resend") {
        setReportMessage(
          `Email inviata via Resend a ${recipientList} (${result.rowCount} sedi)${
            result.messageId ? ` · id ${result.messageId}` : ""
          }`,
        );
      } else {
        setReportMessage(
          `Email mock generata per ${recipientList} (${result.rowCount} sedi)${
            result.path ? ` · apri ${result.path}` : ""
          }`,
        );
      }
    } catch (err) {
      setReportError(err instanceof Error ? err.message : "Errore invio report");
    }
  };

  const selectedLocation = locations.find((l) => l.id === selectedLocationId);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold">Chiusure &amp; Report</h1>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Storico chiusure giornaliere per sede e report notturno multi-sede.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Report notturno</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {emailConfig && (
            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
              {emailConfig.mode === "resend" ? (
                <>
                  Invio email: <strong>Resend</strong> da {emailConfig.from}
                </>
              ) : (
                <>
                  Invio email: <strong>mock locale</strong> (file in{" "}
                  <code className="text-[11px]">{emailConfig.mockDir}</code>) — per invio reale
                  configura <code className="text-[11px]">RESEND_API_KEY</code> e{" "}
                  <code className="text-[11px]">EMAIL_FROM</code> nel .env
                </>
              )}
            </p>
          )}

          <div className={formRowEndGap3Class}>
            <label className={stackedLabelClass}>
              Data chiusure
              <input
                type="date"
                className={stackedInputClass}
                value={reportDate}
                onChange={(e) => setReportDate(e.target.value)}
              />
            </label>
            <Button size={btnSize.inline} variant="outline" onClick={() => void loadReportSummary()} disabled={reportLoading}>
              Aggiorna
            </Button>
            <Button size={btnSize.inline} variant="outline" onClick={() => void previewReport()}>
              Anteprima HTML
            </Button>
            <Button size={btnSize.inline} onClick={() => void sendReport()}>Invia email report</Button>
          </div>

          {reportError && <p className="text-sm text-red-500">{reportError}</p>}
          {reportMessage && <p className="text-sm text-green-600">{reportMessage}</p>}

          {reportLoading && !summary ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
          ) : summary ? (
            <>
              <div className="flex flex-wrap gap-4 text-sm">
                <span>
                  Totale corrispettivi: <strong>{euro(summary.totalGross)}</strong>
                </span>
                {summary.missingCount > 0 && (
                  <span className="font-medium text-red-600">
                    {summary.missingCount} sede/i senza chiusura
                  </span>
                )}
                {summary.detailCount != null && summary.detailCount > 0 && (
                  <span className="text-[hsl(var(--pg-muted-foreground))]">
                    Dettaglio report disponibile per {summary.detailCount} sede/i
                  </span>
                )}
              </div>
              <div className="overflow-x-auto rounded-lg border border-[hsl(var(--pg-border))]">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-[hsl(var(--pg-muted))]/40 text-left">
                    <tr>
                      <th className="px-3 py-2">Sede</th>
                      <th className="px-3 py-2 text-right">Lordo</th>
                      <th className="px-3 py-2 text-right">Contanti</th>
                      <th className="px-3 py-2 text-right">POS</th>
                      <th className="px-3 py-2 text-right">Scostamento</th>
                      <th className="px-3 py-2">Chiusura Z</th>
                    </tr>
                  </thead>
                  <tbody>
                    {summary.rows.map((row) => (
                      <tr
                        key={row.locationId}
                        className={`border-t border-[hsl(var(--pg-border))] ${
                          row.missing ? "bg-red-500/10 text-red-700" : ""
                        }`}
                      >
                        <td className="px-3 py-2 font-medium">{row.locationName}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{euro(row.gross)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{euro(row.cash)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{euro(row.pos)}</td>
                        <td className="px-3 py-2 text-right tabular-nums">{euro(row.discrepancy)}</td>
                        <td className="px-3 py-2">
                          {row.missing
                            ? "ATTENZIONE: Chiusura Fiscale non rilevata"
                            : row.fiscalZNumber != null
                              ? `Z #${row.fiscalZNumber}`
                              : row.zStatus}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Storico chiusure per sede</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={formRowEndGap3Class}>
            <label className={stackedLabelClass}>
              Sede
              <select
                className={stackedSelectClass}
                value={selectedLocationId}
                onChange={(e) => setSelectedLocationId(e.target.value)}
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </label>
            <label className={stackedLabelClass}>
              Da
              <input
                type="date"
                className={stackedInputClass}
                value={closuresFrom}
                onChange={(e) => setClosuresFrom(e.target.value)}
              />
            </label>
            <label className={stackedLabelClass}>
              A
              <input
                type="date"
                className={stackedInputClass}
                value={closuresTo}
                onChange={(e) => setClosuresTo(e.target.value)}
              />
            </label>
            <Button size={btnSize.inline} variant="outline" onClick={() => void loadClosures()} disabled={closuresLoading}>
              Cerca
            </Button>
          </div>

          {selectedLocation && (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              {selectedLocation.name} · {closures.length} chiusure nel periodo
            </p>
          )}

          {closuresLoading ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
          ) : closures.length === 0 ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              Nessuna chiusura nel periodo selezionato.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[hsl(var(--pg-border))]">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-[hsl(var(--pg-muted))]/40 text-left">
                  <tr>
                    <th className="px-3 py-2">Data</th>
                    <th className="px-3 py-2">Z</th>
                    <th className="px-3 py-2 text-right">Lordo</th>
                    <th className="px-3 py-2 text-right">Contanti</th>
                    <th className="px-3 py-2 text-right">POS</th>
                    <th className="px-3 py-2 text-right">Scostamento</th>
                    <th className="px-3 py-2">Ricevuta cloud</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {closures.map((row) => (
                    <tr
                      key={row.id}
                      className="border-t border-[hsl(var(--pg-border))]"
                    >
                      <td className="px-3 py-2 font-medium">{row.closureDate}</td>
                      <td className="px-3 py-2">{row.fiscalZNumber ?? "—"}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{euro(row.gross)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{euro(row.cashDeclared)}</td>
                      <td className="px-3 py-2 text-right tabular-nums">{euro(row.posDeclared)}</td>
                      <td
                        className={`px-3 py-2 text-right tabular-nums ${
                          row.discrepancy !== 0 ? "font-medium text-orange-600" : ""
                        }`}
                      >
                        {euro(row.discrepancy)}
                      </td>
                      <td className="px-3 py-2 text-xs text-[hsl(var(--pg-muted-foreground))]">
                        {new Date(row.receivedAt).toLocaleString("it-IT")}
                      </td>
                      <td className="px-3 py-2 text-right">
                        <Link
                          href={`/closures/${row.id}`}
                          className={detailLinkClass}
                        >
                          Dettaglio
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
