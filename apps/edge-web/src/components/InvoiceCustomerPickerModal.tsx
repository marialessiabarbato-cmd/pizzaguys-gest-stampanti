import type { InvoiceCustomer, InvoiceCustomerProfile } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { edgeApi } from "../lib/api";
import { isInvoiceCustomerValid } from "./InvoiceCustomerForm";
import { profileToInvoiceCustomer } from "../lib/invoice-customers";

type TabId = "info" | "fiscal";

const EMPTY_PROFILE: Omit<InvoiceCustomerProfile, "id"> = {
  businessName: "",
  address: "",
  postalCode: "",
  province: "",
  city: "",
  country: "IT",
  vatNumber: "",
  taxCode: "",
  sdiCode: "",
  pec: "",
  phone: "",
  email: "",
  notes: "",
};

function profileFromCustomer(customer: InvoiceCustomer): Omit<InvoiceCustomerProfile, "id"> {
  return {
    ...EMPTY_PROFILE,
    businessName: customer.businessName,
    vatNumber: customer.vatNumber ?? "",
    taxCode: customer.taxCode ?? "",
    sdiCode: customer.sdiCode ?? "",
    pec: customer.pec ?? "",
  };
}

export function InvoiceCustomerPickerModal({
  initialCustomer,
  onConfirm,
  onCancel,
}: {
  initialCustomer?: InvoiceCustomer;
  onConfirm: (customer: InvoiceCustomer, profile?: InvoiceCustomerProfile) => void;
  onCancel: () => void;
}) {
  const [profiles, setProfiles] = useState<InvoiceCustomerProfile[]>([]);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [tab, setTab] = useState<TabId>("info");
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<Omit<InvoiceCustomerProfile, "id">>(() =>
    initialCustomer?.businessName ? profileFromCustomer(initialCustomer) : { ...EMPTY_PROFILE },
  );
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadProfiles = useCallback(async (q?: string) => {
    const query = q?.trim() ? `?q=${encodeURIComponent(q.trim())}` : "";
    const rows = await edgeApi<InvoiceCustomerProfile[]>(`/api/invoice-customers${query}`);
    setProfiles(rows);
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

  const selected = useMemo(
    () => profiles.find((p) => p.id === selectedId) ?? null,
    [profiles, selectedId],
  );

  useEffect(() => {
    if (selected && !editing) {
      setDraft({
        businessName: selected.businessName,
        address: selected.address ?? "",
        postalCode: selected.postalCode ?? "",
        province: selected.province ?? "",
        city: selected.city ?? "",
        country: selected.country ?? "IT",
        vatNumber: selected.vatNumber ?? "",
        taxCode: selected.taxCode ?? "",
        sdiCode: selected.sdiCode ?? "",
        pec: selected.pec ?? "",
        phone: selected.phone ?? "",
        email: selected.email ?? "",
        notes: selected.notes ?? "",
        isActive: selected.isActive,
        source: selected.source,
      });
    }
  }, [selected, editing]);

  const setField = <K extends keyof typeof draft>(key: K, value: (typeof draft)[K]) => {
    setDraft((prev) => ({ ...prev, [key]: value }));
    setError("");
  };

  const startNew = () => {
    setSelectedId(null);
    setEditing(true);
    setDraft({ ...EMPTY_PROFILE });
    setMessage("Nuovo cliente");
  };

  const startEdit = () => {
    if (!selected) return;
    setEditing(true);
    setMessage("Modifica cliente");
  };

  const saveProfile = async () => {
    const customer = profileToInvoiceCustomer({
      id: selectedId ?? "new",
      ...draft,
      country: draft.country ?? "IT",
    });
    if (!isInvoiceCustomerValid(customer)) {
      setError("Compila i campi obbligatori (ragione sociale, P.IVA/CF, SDI/PEC)");
      setTab("fiscal");
      return;
    }

    setLoading(true);
    setError("");
    try {
      if (selectedId) {
        const updated = await edgeApi<InvoiceCustomerProfile>(`/api/invoice-customers/${selectedId}`, {
          method: "PUT",
          body: JSON.stringify(draft),
        });
        setProfiles((prev) => prev.map((p) => (p.id === updated.id ? updated : p)));
        setSelectedId(updated.id);
        setMessage("Cliente aggiornato");
      } else {
        const created = await edgeApi<InvoiceCustomerProfile>("/api/invoice-customers", {
          method: "POST",
          body: JSON.stringify(draft),
        });
        setProfiles((prev) => [created, ...prev]);
        setSelectedId(created.id);
        setMessage("Cliente salvato in rubrica");
      }
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio fallito");
    } finally {
      setLoading(false);
    }
  };

  const handleIntesta = () => {
    const customer = profileToInvoiceCustomer({
      id: selectedId ?? "draft",
      ...draft,
      country: draft.country ?? "IT",
    });
    if (!isInvoiceCustomerValid(customer)) {
      setError("Dati fiscali incompleti per intestare la fattura");
      setTab("fiscal");
      return;
    }
    onConfirm(customer, selected ?? undefined);
  };

  const inputClass =
    "h-11 w-full rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] px-3 text-sm";

  return (
    <div className="fixed inset-0 z-[60] flex flex-col bg-[hsl(var(--pg-background))]">
      <header className="border-b border-[hsl(var(--pg-border))] px-4 py-3">
        <h1 className="text-xl font-bold">Intesta documento</h1>
        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
          Seleziona un cliente dalla rubrica o creane uno nuovo
        </p>
      </header>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
        <section className="flex min-h-0 flex-col border-b border-[hsl(var(--pg-border))] p-4 lg:border-b-0 lg:border-r">
          <div className="mb-3 flex gap-2">
            <input
              className={inputClass}
              placeholder="Cerca ragione sociale, città, P.IVA…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-lg border border-[hsl(var(--pg-border))]">
            <table className="w-full text-left text-sm">
              <thead className="sticky top-0 bg-[hsl(var(--pg-muted))]">
                <tr>
                  <th className="px-3 py-2 font-semibold">Ragione sociale</th>
                  <th className="px-3 py-2 font-semibold">Città</th>
                </tr>
              </thead>
              <tbody>
                {profiles.length === 0 ? (
                  <tr>
                    <td colSpan={2} className="px-3 py-8 text-center text-[hsl(var(--pg-muted-foreground))]">
                      Nessun cliente in rubrica
                    </td>
                  </tr>
                ) : (
                  profiles.map((profile) => (
                    <tr
                      key={profile.id}
                      className={`cursor-pointer border-t border-[hsl(var(--pg-border))]/50 ${
                        selectedId === profile.id ? "bg-[hsl(var(--pg-primary))]/15" : "hover:bg-[hsl(var(--pg-muted))]/50"
                      }`}
                      onClick={() => {
                        setSelectedId(profile.id);
                        setEditing(false);
                        setMessage("");
                        setError("");
                      }}
                    >
                      <td className="px-3 py-2 font-medium">{profile.businessName}</td>
                      <td className="px-3 py-2 text-[hsl(var(--pg-muted-foreground))]">
                        {profile.city ?? "—"}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="flex min-h-0 flex-col p-4">
          <input
            className={`${inputClass} mb-3 text-lg font-semibold`}
            placeholder="Ragione sociale *"
            value={draft.businessName}
            onChange={(e) => setField("businessName", e.target.value)}
          />

          <div className="mb-3 flex gap-2">
            {(
              [
                ["info", "Info"],
                ["fiscal", "Dati fiscali"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                type="button"
                className="h-9 flex-1"
                variant={tab === id ? "default" : "outline"}
                onClick={() => setTab(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="min-h-0 flex-1 space-y-3 overflow-y-auto">
            {tab === "info" ? (
              <>
                <Field label="Indirizzo" value={draft.address ?? ""} onChange={(v) => setField("address", v)} />
                <div className="grid grid-cols-3 gap-2">
                  <Field label="CAP" value={draft.postalCode ?? ""} onChange={(v) => setField("postalCode", v)} />
                  <Field label="Prov." value={draft.province ?? ""} onChange={(v) => setField("province", v)} />
                  <Field label="Città" value={draft.city ?? ""} onChange={(v) => setField("city", v)} />
                </div>
                <Field label="Stato" value={draft.country ?? "IT"} onChange={(v) => setField("country", v)} />
                <Field label="Telefono" value={draft.phone ?? ""} onChange={(v) => setField("phone", v)} />
                <Field label="Email" value={draft.email ?? ""} onChange={(v) => setField("email", v)} />
                <div>
                  <label className="mb-1 block text-sm font-medium">Nota</label>
                  <textarea
                    className={`${inputClass} min-h-[72px] py-2`}
                    value={draft.notes ?? ""}
                    onChange={(e) => setField("notes", e.target.value)}
                  />
                </div>
              </>
            ) : (
              <>
                <Field label="P.IVA *" value={draft.vatNumber ?? ""} onChange={(v) => setField("vatNumber", v)} highlight />
                <Field label="C.F. *" value={draft.taxCode ?? ""} onChange={(v) => setField("taxCode", v)} highlight />
                <Field label="Codice SDI *" value={draft.sdiCode ?? ""} onChange={(v) => setField("sdiCode", v)} />
                <Field label="PEC *" value={draft.pec ?? ""} onChange={(v) => setField("pec", v)} />
                <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                  Obbligatori per fattura: ragione sociale + (P.IVA o CF) + (SDI o PEC).
                </p>
              </>
            )}
          </div>

          {message && <p className="mt-2 text-sm text-green-700">{message}</p>}
          {error && <p className="mt-2 text-sm text-red-600">{error}</p>}
        </section>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-primary))]/10 p-4">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" className="h-11" onClick={startNew}>
            + Nuovo
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-11"
            disabled={!selectedId || editing}
            onClick={startEdit}
          >
            Modifica
          </Button>
          {editing && (
            <Button type="button" className="h-11" disabled={loading} onClick={() => void saveProfile()}>
              {loading ? "Salvataggio…" : "Salva rubrica"}
            </Button>
          )}
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="h-11 min-w-[120px]" onClick={onCancel}>
            Annulla
          </Button>
          <Button type="button" className="h-11 min-w-[120px]" onClick={handleIntesta}>
            Intesta
          </Button>
        </div>
      </footer>
    </div>
  );
}

function Field({
  label,
  value,
  onChange,
  highlight,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  highlight?: boolean;
}) {
  return (
    <label className="block text-sm">
      <span className={`mb-1 block ${highlight ? "font-semibold text-green-700" : "text-[hsl(var(--pg-muted-foreground))"}`}>
        {label}
      </span>
      <input
        className={`h-11 w-full rounded-lg border px-3 text-sm ${
          highlight
            ? "border-green-500/50 bg-green-500/5"
            : "border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))]"
        }`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </label>
  );
}
