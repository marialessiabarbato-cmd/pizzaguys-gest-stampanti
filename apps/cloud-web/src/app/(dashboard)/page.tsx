"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";

interface DashboardData {
  kpi: {
    locations: number;
    categories: number;
    products: number;
    userAdmins: number;
    schemaVersion: number;
  };
  networkHealth: Array<{
    id: string;
    name: string;
    status: string;
    schemaVersion: number;
    lastHeartbeatAt: string | null;
    desyncBuilds: number;
  }>;
}

interface AuditLog {
  id: string;
  operation: string;
  severity: string;
  createdAt: string;
}

function statusColor(status: string) {
  if (status === "ONLINE") return "text-green-600";
  if (status === "DESYNC") return "text-yellow-600";
  return "text-red-500";
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [audit, setAudit] = useState<AuditLog[]>([]);

  useEffect(() => {
    api<DashboardData>("/api/v2/dashboard").then(setData).catch(console.error);
    api<AuditLog[]>("/api/v2/audit-logs?limit=10").then(setAudit).catch(console.error);
  }, []);

  if (!data) return <p>Caricamento...</p>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>
      <div className="grid gap-4 md:grid-cols-5">
        {[
          ["Sedi", data.kpi.locations],
          ["Categorie", data.kpi.categories],
          ["Prodotti", data.kpi.products],
          ["User Admin", data.kpi.userAdmins],
          ["Schema v", data.kpi.schemaVersion],
        ].map(([label, value]) => (
          <Card key={label as string}>
            <CardHeader>
              <CardTitle className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Network Health</CardTitle>
        </CardHeader>
        <CardContent>
          {data.networkHealth.length === 0 ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessuna sede configurata.</p>
          ) : (
            <ul className="space-y-2">
              {data.networkHealth.map((l) => (
                <li
                  key={l.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--pg-border))] px-3 py-2 text-sm"
                >
                  <span className="font-medium">{l.name}</span>
                  <span className={`uppercase ${statusColor(l.status)}`}>{l.status}</span>
                  <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    v{l.schemaVersion}
                    {l.desyncBuilds > 0 && ` · ${l.desyncBuilds} build indietro`}
                  </span>
                  <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    {l.lastHeartbeatAt
                      ? new Date(l.lastHeartbeatAt).toLocaleString("it-IT")
                      : "Mai connesso"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Audit log recenti</CardTitle>
        </CardHeader>
        <CardContent>
          {audit.length === 0 ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessuna operazione registrata.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {audit.map((a) => (
                <li key={a.id} className="flex justify-between border-b border-[hsl(var(--pg-border))] py-1">
                  <span>{a.operation}</span>
                  <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    {a.severity} · {new Date(a.createdAt).toLocaleString("it-IT")}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
