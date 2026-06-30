interface DailyReportSnapshot {
  header: {
    locationName: string;
    closureDate: string;
    printedAt: string;
    printedBy: string;
    zNumber?: number;
  };
  totals: { dailyTotal: number; collected: number; uncollected: number };
  serviceTypes: Array<{ label: string; quantity: number; total: number }>;
  payments: Array<{ label: string; quantity: number; total: number }>;
  salesGroups: Array<{ name: string; quantity: number; total: number }>;
  productionCenters: Array<{ name: string; quantity: number; total: number }>;
  operators: Array<{ name: string; cash: number; pos: number; total: number }>;
  fiscalDocuments: {
    receipts: { count: number; total: number };
    invoices: { count: number; total: number };
    training: { count: number; total: number };
  };
  adjustments: {
    discounts: number;
    promotions: number;
    supplements: number;
    voided: number;
    corrections: number;
  };
  vatReceipts: Array<{ label: string; rate: number; gross: number }>;
  vatInvoices: Array<{ label: string; rate: number; gross: number }>;
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

function MiniTable({
  title,
  rows,
}: {
  title: string;
  rows: Array<{ label: string; qty?: number; total: number }>;
}) {
  if (rows.length === 0) return null;
  return (
    <div>
      <h4 className="mb-2 text-sm font-medium">{title}</h4>
      <div className="overflow-x-auto rounded-md border border-[hsl(var(--pg-border))]">
        <table className="w-full text-xs">
          <thead className="bg-[hsl(var(--pg-muted))]/40 text-left">
            <tr>
              <th className="px-2 py-1.5">Descrizione</th>
              <th className="px-2 py-1.5 text-center">Qty</th>
              <th className="px-2 py-1.5 text-right">Totale</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.label} className="border-t border-[hsl(var(--pg-border))]">
                <td className="px-2 py-1.5">{row.label}</td>
                <td className="px-2 py-1.5 text-center tabular-nums">{row.qty ?? "—"}</td>
                <td className="px-2 py-1.5 text-right tabular-nums">{euro(row.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export type { DailyReportSnapshot };

export function DailyReportDetailPanel({ snapshot }: { snapshot: DailyReportSnapshot }) {
  const { header, totals, fiscalDocuments, adjustments } = snapshot;

  return (
    <div className="space-y-4 rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20 p-4">
      <div>
        <h3 className="text-base font-semibold">{header.locationName}</h3>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Chiusura {header.closureDate}
          {header.zNumber != null ? ` · Z #${header.zNumber}` : ""}
          {" · "}
          stampato {new Date(header.printedAt).toLocaleString("it-IT")} da {header.printedBy}
        </p>
      </div>

      <div className="grid gap-2 sm:grid-cols-3">
        <div className="rounded-md border border-[hsl(var(--pg-border))] px-3 py-2 text-sm">
          <span className="text-[hsl(var(--pg-muted-foreground))]">Totale giornaliero</span>
          <p className="font-semibold tabular-nums">{euro(totals.dailyTotal)}</p>
        </div>
        <div className="rounded-md border border-[hsl(var(--pg-border))] px-3 py-2 text-sm">
          <span className="text-[hsl(var(--pg-muted-foreground))]">Riscosso</span>
          <p className="font-semibold tabular-nums">{euro(totals.collected)}</p>
        </div>
        <div className="rounded-md border border-[hsl(var(--pg-border))] px-3 py-2 text-sm">
          <span className="text-[hsl(var(--pg-muted-foreground))]">Scostamento cassa</span>
          <p className="font-semibold tabular-nums">{euro(adjustments.corrections)}</p>
        </div>
      </div>

      <MiniTable
        title="Tipi di servizio"
        rows={snapshot.serviceTypes.map((s) => ({
          label: s.label,
          qty: s.quantity,
          total: s.total,
        }))}
      />
      <MiniTable
        title="Pagamenti"
        rows={snapshot.payments.map((p) => ({
          label: p.label,
          qty: p.quantity,
          total: p.total,
        }))}
      />
      <MiniTable
        title="Gruppi di vendita"
        rows={snapshot.salesGroups.map((g) => ({
          label: g.name,
          qty: g.quantity,
          total: g.total,
        }))}
      />
      <MiniTable
        title="Centri di produzione"
        rows={snapshot.productionCenters.map((c) => ({
          label: c.name,
          qty: c.quantity,
          total: c.total,
        }))}
      />

      <div>
        <h4 className="mb-2 text-sm font-medium">Documenti fiscali</h4>
        <ul className="space-y-1 text-sm">
          <li>
            Scontrini: {fiscalDocuments.receipts.count} · {euro(fiscalDocuments.receipts.total)}
          </li>
          <li>
            Fatture: {fiscalDocuments.invoices.count} · {euro(fiscalDocuments.invoices.total)}
          </li>
          <li>
            Addestramento: {fiscalDocuments.training.count} ·{" "}
            {euro(fiscalDocuments.training.total)}
          </li>
        </ul>
        {(adjustments.promotions !== 0 ||
          adjustments.supplements !== 0 ||
          adjustments.discounts !== 0) && (
          <p className="mt-2 text-xs text-[hsl(var(--pg-muted-foreground))]">
            Promozioni {euro(adjustments.promotions)} · Supplementi{" "}
            {euro(adjustments.supplements)} · Sconti {euro(adjustments.discounts)}
          </p>
        )}
      </div>

      <MiniTable
        title="Incasso operatori"
        rows={snapshot.operators.map((o) => ({
          label: o.name,
          total: o.total,
        }))}
      />

      {snapshot.vatReceipts.length > 0 && (
        <MiniTable
          title="IVA scontrini"
          rows={snapshot.vatReceipts.map((v) => ({
            label: `${v.label} (${v.rate}%)`,
            total: v.gross,
          }))}
        />
      )}
      {snapshot.vatInvoices.length > 0 && (
        <MiniTable
          title="IVA fatture"
          rows={snapshot.vatInvoices.map((v) => ({
            label: `${v.label} (${v.rate}%)`,
            total: v.gross,
          }))}
        />
      )}
    </div>
  );
}
