"use client";

import { Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { activityLabel, locationStatusLabel } from "@/lib/activity-labels";
import { api } from "@/lib/api";
import { inlineLinkClass } from "@/lib/cloud-admin-ui";

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
  if (status === "DESYNC") return "text-amber-600";
  return "text-red-500";
}

function statusDot(status: string) {
  if (status === "ONLINE") return "bg-green-500";
  if (status === "DESYNC") return "bg-amber-500";
  return "bg-red-500";
}

export default function DashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [activity, setActivity] = useState<AuditLog[]>([]);

  useEffect(() => {
    api<DashboardData>("/api/v2/dashboard").then(setData).catch(console.error);
    api<AuditLog[]>("/api/v2/audit-logs?limit=8")
      .then(setActivity)
      .catch(() => setActivity([]));
  }, []);

  if (!data) return <p>Caricamento...</p>;

  const onlineCount = data.networkHealth.filter((l) => l.status === "ONLINE").length;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Panoramica del brand e stato delle sedi.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-5">
        {[
          ["Sedi", data.kpi.locations],
          ["Sedi online", onlineCount],
          ["Categorie menu", data.kpi.categories],
          ["Prodotti", data.kpi.products],
          ["Admin di sede", data.kpi.userAdmins],
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

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Stato sedi</CardTitle>
          </CardHeader>
          <CardContent>
            {data.networkHealth.length === 0 ? (
              <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                Nessuna sede configurata. Vai in{" "}
                <Link href="/locations" className={inlineLinkClass}>
                  Sedi
                </Link>{" "}
                per iniziare.
              </p>
            ) : (
              <ul className="space-y-2">
                {data.networkHealth.map((l) => (
                  <li
                    key={l.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded border border-[hsl(var(--pg-border))] px-3 py-2 text-sm"
                  >
                    <span className="flex items-center gap-2 font-medium">
                      <span className={`h-2 w-2 rounded-full ${statusDot(l.status)}`} />
                      {l.name}
                    </span>
                    <span className={statusColor(l.status)}>{locationStatusLabel(l.status)}</span>
                    <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                      {l.lastHeartbeatAt
                        ? `Ultimo contatto: ${new Date(l.lastHeartbeatAt).toLocaleString("it-IT")}`
                        : "Mai connessa"}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Attività recenti</CardTitle>
          </CardHeader>
          <CardContent>
            {activity.length === 0 ? (
              <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                Nessun evento recente da mostrare.
              </p>
            ) : (
              <ul className="space-y-2 text-sm">
                {activity.map((a) => (
                  <li
                    key={a.id}
                    className="flex items-start justify-between gap-3 border-b border-[hsl(var(--pg-border))]/50 py-2 last:border-0"
                  >
                    <span>
                      {activityLabel(a.operation)}
                      {a.severity === "CRITICAL" && (
                        <span className="ml-2 rounded-full bg-red-500/15 px-2 py-0.5 text-xs text-red-400">
                          Attenzione
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-xs text-[hsl(var(--pg-muted-foreground))]">
                      {new Date(a.createdAt).toLocaleString("it-IT")}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
