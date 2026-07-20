"use client";

import { searchInputClass, selectClass } from "@/lib/cloud-admin-ui";

export type TableFilterOption = { value: string; label: string };

/**
 * Pattern riusabile: barra di ricerca + filtri colonna per tabelle admin.
 */
export function TableFilters({
  search,
  onSearchChange,
  searchPlaceholder = "Cerca…",
  filters = [],
}: {
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  filters?: Array<{
    id: string;
    label: string;
    value: string;
    options: TableFilterOption[];
    onChange: (value: string) => void;
    allLabel?: string;
  }>;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <input
        type="search"
        className={searchInputClass}
        placeholder={searchPlaceholder}
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        aria-label={searchPlaceholder}
      />
      {filters.map((f) => (
        <label key={f.id} className="text-xs text-[hsl(var(--pg-muted-foreground))]">
          {f.label}
          <select
            className={`mt-1 block min-w-[140px] ${selectClass}`}
            value={f.value}
            onChange={(e) => f.onChange(e.target.value)}
          >
            <option value="">{f.allLabel ?? "Tutti"}</option>
            {f.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

export function matchesSearch(haystack: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return haystack.toLowerCase().includes(q);
}
