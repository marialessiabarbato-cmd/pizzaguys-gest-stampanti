import { useState } from "react";
import { kitchenTimeClass } from "./OpenTablesModal";

export interface DeliveryOrderRow {
  id: string;
  displayNumber: string;
  label?: string;
  broker?: string;
  platformOrderNumber?: string;
  customerName?: string;
  phone?: string;
  address?: string;
  scheduledLabel: string;
  status: string;
  total: number;
  lineCount: number;
  openedElapsed?: string;
  kitchenElapsed?: string;
  kitchenMinutes?: number | null;
}

const STATUS_LABELS: Record<string, string> = {
  OCCUPIED: "Aperto",
  LOCKED: "In uso",
  BILL_REQUESTED: "Conto richiesto",
  SPLIT_IN_PROGRESS: "Split",
};

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

/**
 * Delivery aperti in tabella (F17), come i tavoli: divisi per piattaforma con conteggio e
 * totale, colonne piattaforma, n° ordine, cliente, consegna, stato, tempi e totale.
 */
export function DeliveryOrdersTable<T extends DeliveryOrderRow>({
  orders,
  selectedId,
  onSelect,
}: {
  orders: T[];
  selectedId?: string;
  onSelect: (order: T) => void;
}) {
  const [filter, setFilter] = useState<string>("");
  const groups = new Map<string, T[]>();
  for (const o of orders) {
    const key = o.broker?.trim() || "Telefono / diretto";
    groups.set(key, [...(groups.get(key) ?? []), o]);
  }
  const allSorted = [...groups.entries()].sort(([a], [b]) => a.localeCompare(b, "it"));
  const activeFilter = filter && groups.has(filter) ? filter : "";
  const sorted = activeFilter ? allSorted.filter(([k]) => k === activeFilter) : allSorted;

  const chipClass = (active: boolean) =>
    `rounded-full border px-3 py-1.5 text-sm font-semibold transition ${
      active
        ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
        : "border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] hover:border-[hsl(var(--pg-primary))]/50"
    }`;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Piattaforma delivery">
        <button type="button" className={chipClass(!activeFilter)} onClick={() => setFilter("")}>
          Tutte · {orders.length}
        </button>
        {allSorted.map(([name, rows]) => (
          <button
            key={name}
            type="button"
            className={chipClass(activeFilter === name)}
            onClick={() => setFilter(name)}
          >
            {name} · {rows.length}
          </button>
        ))}
      </div>
    <div className="overflow-auto rounded-xl border border-[hsl(var(--pg-border))]">
      <table className="w-full min-w-[900px] text-sm">
        <thead className="sticky top-0 bg-[hsl(var(--pg-muted))] text-left text-xs uppercase">
          <tr>
            <th className="px-3 py-2">Piattaforma</th>
            <th className="px-3 py-2">N° ordine</th>
            <th className="px-3 py-2">Cliente</th>
            <th className="px-3 py-2">Consegna</th>
            <th className="px-3 py-2">Stato</th>
            <th className="px-3 py-2">Da apertura</th>
            <th className="px-3 py-2">In cucina da</th>
            <th className="px-3 py-2 text-right">Articoli</th>
            <th className="px-3 py-2 text-right">Totale</th>
          </tr>
        </thead>
        <tbody>
          {sorted.map(([platform, rows]) => (
            <PlatformGroup
              key={platform}
              platform={platform}
              rows={rows}
              selectedId={selectedId}
              onSelect={onSelect}
            />
          ))}
        </tbody>
      </table>
    </div>
    </div>
  );
}

function PlatformGroup<T extends DeliveryOrderRow>({
  platform,
  rows,
  selectedId,
  onSelect,
}: {
  platform: string;
  rows: T[];
  selectedId?: string;
  onSelect: (order: T) => void;
}) {
  const total = rows.reduce((sum, r) => sum + r.total, 0);
  return (
    <>
      <tr className="border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/50">
        <td colSpan={7} className="px-3 py-1.5 text-xs font-bold uppercase tracking-wide">
          {platform} <span className="font-normal normal-case">· {rows.length} {rows.length === 1 ? "ordine" : "ordini"}</span>
        </td>
        <td colSpan={2} className="px-3 py-1.5 text-right text-xs font-semibold tabular-nums">
          {euro(total)}
        </td>
      </tr>
      {rows.map((o) => (
        <tr
          key={o.id}
          className={`cursor-pointer border-t border-[hsl(var(--pg-border))] hover:bg-[hsl(var(--pg-muted))]/40 ${
            selectedId === o.id ? "bg-[hsl(var(--pg-primary))]/10" : ""
          }`}
          onClick={() => onSelect(o)}
        >
          <td className="px-3 py-2 text-xs font-bold uppercase">{o.broker?.trim() || "Telefono"}</td>
          <td className="px-3 py-2 font-semibold">
            {o.platformOrderNumber ? `n° ${o.platformOrderNumber}` : o.displayNumber}
          </td>
          <td className="max-w-[200px] px-3 py-2">
            <span className="block truncate">{o.customerName || "—"}</span>
            {o.address && (
              <span className="block truncate text-xs text-[hsl(var(--pg-muted-foreground))]">{o.address}</span>
            )}
          </td>
          <td className="px-3 py-2">{o.scheduledLabel}</td>
          <td className="px-3 py-2">{STATUS_LABELS[o.status] ?? o.status}</td>
          <td className="px-3 py-2 tabular-nums">{o.openedElapsed ?? "—"}</td>
          <td className="px-3 py-2 tabular-nums">
            <span className={kitchenTimeClass(o.kitchenMinutes)}>{o.kitchenElapsed ?? "—"}</span>
          </td>
          <td className="px-3 py-2 text-right tabular-nums">{o.lineCount}</td>
          <td className="px-3 py-2 text-right font-semibold tabular-nums">{euro(o.total)}</td>
        </tr>
      ))}
    </>
  );
}
