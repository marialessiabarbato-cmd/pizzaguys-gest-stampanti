"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { SettingsBackLink } from "@/components/SettingsBackLink";
import { useEffect, useState } from "react";
import { activityLabel } from "@/lib/activity-labels";
import { api } from "@/lib/api";

interface AuditLog {
  id: string;
  operation: string;
  severity: string;
  locationId: string | null;
  userId: string | null;
  createdAt: string;
}

export default function AuditLogPage() {
  const [audit, setAudit] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    api<AuditLog[]>("/api/v2/audit-logs?limit=100")
      .then(setAudit)
      .catch((err) => setError(err instanceof Error ? err.message : "Errore caricamento"))
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <SettingsBackLink />
        <h1 className="text-2xl font-bold">Registro tecnico</h1>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Cronologia completa per supporto e diagnostica. I codici operazione sono pensati per
          sviluppatori e assistenza tecnica.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Audit log</CardTitle>
        </CardHeader>
        <CardContent>
          {loading && (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
          )}
          {error && <p className="text-sm text-red-500">{error}</p>}
          {!loading && !error && audit.length === 0 && (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              Nessuna operazione registrata.
            </p>
          )}
          {!loading && !error && audit.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--pg-border))] text-xs text-[hsl(var(--pg-muted-foreground))]">
                    <th className="py-2 pr-4">Data</th>
                    <th className="py-2 pr-4">Descrizione</th>
                    <th className="py-2 pr-4">Codice</th>
                    <th className="py-2">Gravità</th>
                  </tr>
                </thead>
                <tbody>
                  {audit.map((row) => (
                    <tr key={row.id} className="border-b border-[hsl(var(--pg-border))]/50">
                      <td className="py-2 pr-4 whitespace-nowrap text-xs text-[hsl(var(--pg-muted-foreground))]">
                        {new Date(row.createdAt).toLocaleString("it-IT")}
                      </td>
                      <td className="py-2 pr-4">{activityLabel(row.operation)}</td>
                      <td className="py-2 pr-4 font-mono text-xs">{row.operation}</td>
                      <td className="py-2">
                        <span
                          className={`rounded-full px-2 py-0.5 text-xs ${
                            row.severity === "CRITICAL"
                              ? "bg-red-500/15 text-red-400"
                              : row.severity === "WARNING"
                                ? "bg-amber-500/15 text-amber-400"
                                : "bg-[hsl(var(--pg-muted))] text-[hsl(var(--pg-muted-foreground))]"
                          }`}
                        >
                          {row.severity}
                        </span>
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
