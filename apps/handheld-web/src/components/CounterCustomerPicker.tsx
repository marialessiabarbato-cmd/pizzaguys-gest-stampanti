import type { InvoiceCustomerProfile } from "@pizzaguys/types";
import { useCallback, useEffect, useMemo, useState } from "react";
import { edgeApi } from "../lib/api";
import {
  type CounterCustomerSelection,
  matchesCustomerQuery,
  profileToCounterCustomer,
} from "../lib/counter-customers";

function CustomerRow({
  customer,
  hint,
  onSelect,
}: {
  customer: CounterCustomerSelection;
  hint?: string;
  onSelect: (customer: CounterCustomerSelection) => void;
}) {
  const subtitle = [customer.phone, customer.address].filter(Boolean).join(" · ");

  return (
    <button
      type="button"
      className="flex w-full flex-col gap-0.5 border-t border-[hsl(var(--pg-border))]/50 px-3 py-2.5 text-left first:border-t-0 active:bg-[hsl(var(--pg-muted))]/50"
      onClick={() => onSelect(customer)}
    >
      <span className="text-sm font-medium">{customer.name}</span>
      {subtitle ? (
        <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">{subtitle}</span>
      ) : hint ? (
        <span className="text-xs text-[hsl(var(--pg-muted-foreground))]">{hint}</span>
      ) : null}
    </button>
  );
}

/** Stesso caricamento cliente della cassa: recenti + rubrica fiscale. */
export function CounterCustomerPicker({
  recentCustomers = [],
  onSelect,
}: {
  recentCustomers?: CounterCustomerSelection[];
  onSelect: (customer: CounterCustomerSelection) => void;
}) {
  const [search, setSearch] = useState("");
  const [profiles, setProfiles] = useState<InvoiceCustomerProfile[]>([]);
  const [loading, setLoading] = useState(false);

  const loadProfiles = useCallback(async (q?: string) => {
    setLoading(true);
    try {
      const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
      const rows = await edgeApi<InvoiceCustomerProfile[]>(`/api/invoice-customers${query}`);
      setProfiles(rows);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void loadProfiles(search);
    }, 200);
    return () => clearTimeout(timer);
  }, [search, loadProfiles]);

  const rubricaCustomers = useMemo(
    () => profiles.map(profileToCounterCustomer),
    [profiles],
  );

  const filteredRecent = useMemo(
    () => recentCustomers.filter((customer) => matchesCustomerQuery(customer, search)),
    [recentCustomers, search],
  );

  const filteredRubrica = useMemo(() => {
    const recentKeys = new Set(
      filteredRecent.map((customer) => (customer.phone?.trim() || customer.name).toLowerCase()),
    );
    return rubricaCustomers.filter((customer) => {
      const key = (customer.phone?.trim() || customer.name).toLowerCase();
      if (recentKeys.has(key)) return false;
      return matchesCustomerQuery(customer, search);
    });
  }, [filteredRecent, rubricaCustomers, search]);

  const empty = filteredRecent.length === 0 && filteredRubrica.length === 0;

  return (
    <div className="overflow-hidden rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))]">
      <div className="border-b border-[hsl(var(--pg-border))] p-2">
        <input
          className="h-11 w-full rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-3 text-sm"
          placeholder="Cerca nome, telefono o indirizzo…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="max-h-56 overflow-y-auto">
        {loading && empty ? (
          <p className="px-3 py-4 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
            Caricamento…
          </p>
        ) : empty ? (
          <p className="px-3 py-4 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
            Nessun cliente trovato
          </p>
        ) : (
          <>
            {filteredRecent.length > 0 && (
              <section>
                <p className="bg-[hsl(var(--pg-muted))]/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                  Ordini recenti
                </p>
                {filteredRecent.map((customer) => (
                  <CustomerRow
                    key={`recent:${customer.phone ?? customer.name}`}
                    customer={customer}
                    onSelect={onSelect}
                  />
                ))}
              </section>
            )}

            {filteredRubrica.length > 0 && (
              <section>
                <p className="bg-[hsl(var(--pg-muted))]/40 px-3 py-1.5 text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                  Rubrica
                </p>
                {filteredRubrica.map((customer) => (
                  <CustomerRow
                    key={`rubrica:${customer.phone ?? customer.name}`}
                    customer={customer}
                    hint={!customer.phone && !customer.address ? "Cliente in rubrica" : undefined}
                    onSelect={onSelect}
                  />
                ))}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}
