"use client";

import { Card, CardContent } from "@pizzaguys/ui";
import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/api";
import type { BrandSettings } from "@/lib/settings-types";
import { detailLinkClass } from "@/lib/cloud-admin-ui";

const SECTIONS = [
  {
    href: "/settings/cassa",
    title: "Cassa e comanda",
    description: (s: BrandSettings) =>
      `Sconto max ${s.maxDiscountPercent}% · Blocco tavolo ${s.tableLockTimeoutMinutes} min`,
  },
  {
    href: "/settings/fatturazione",
    title: "Fatturazione elettronica",
    description: (s: BrandSettings) =>
      s.sdiEnabled ? "Invio SDI attivo" : "Invio SDI disattivato (pilota)",
  },
  {
    href: "/settings/delivery",
    title: "Delivery",
    description: (s: BrandSettings) =>
      s.deliveryBrokers?.length
        ? s.deliveryBrokers.join(", ")
        : "Nessuna piattaforma configurata",
  },
  {
    href: "/settings/audit",
    title: "Registro tecnico",
    description: () => "Cronologia operazioni per supporto e diagnostica",
  },
] as const;

export default function SettingsPage() {
  const [settings, setSettings] = useState<BrandSettings | null>(null);

  useEffect(() => {
    api<BrandSettings>("/api/v2/settings").then(setSettings).catch(console.error);
  }, []);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Impostazioni</h1>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Parametri globali del brand, validi per tutte le sedi collegate.
        </p>
      </div>

      <Card>
        <CardContent className="p-0">
          {!settings ? (
            <p className="px-6 py-4 text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
          ) : (
            <ul className="divide-y divide-[hsl(var(--pg-border))]">
              {SECTIONS.map((section) => (
                <li key={section.href}>
                  <Link
                    href={section.href}
                    className="flex items-center justify-between gap-4 px-6 py-4 transition-colors hover:bg-[hsl(var(--pg-muted))]/50"
                  >
                    <div className="min-w-0">
                      <p className="font-medium">{section.title}</p>
                      <p className="truncate text-sm text-[hsl(var(--pg-muted-foreground))]">
                        {section.description(settings)}
                      </p>
                    </div>
                    <span className={`shrink-0 ${detailLinkClass}`}>Dettaglio</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {settings && (
        <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
          Versione configurazione menu: <span className="font-mono">v{settings.schemaVersion}</span>
        </p>
      )}
    </div>
  );
}
