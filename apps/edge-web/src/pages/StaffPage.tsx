import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { edgeApi } from "@/lib/api";
import { ConfirmModal } from "@/components/ConfirmModal";

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
  createdAt?: string;
}

export function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    role: "WAITER",
    pin: "",
  });
  const [deactivateTarget, setDeactivateTarget] = useState<StaffMember | null>(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [detailTarget, setDetailTarget] = useState<StaffMember | null>(null);
  const [pinTarget, setPinTarget] = useState<StaffMember | null>(null);
  const [pinForm, setPinForm] = useState({ pin: "", confirmPin: "" });
  const [pinError, setPinError] = useState("");
  const [createError, setCreateError] = useState("");

  const load = async () => {
    const s = await edgeApi<StaffMember[]>("/api/staff");
    setStaff(s);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreateError("");
    try {
      await edgeApi("/api/staff", { method: "POST", body: JSON.stringify(form) });
      setForm({ firstName: "", lastName: "", role: "WAITER", pin: "" });
      setShowCreateModal(false);
      void load();
    } catch (err) {
      setCreateError(err instanceof Error ? err.message : "Errore creazione operatore");
    }
  };

  const toggleActive = async (member: StaffMember) => {
    await edgeApi(`/api/staff/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !member.isActive }),
    });
    setDeactivateTarget(null);
    void load();
  };
  const resetPin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pinTarget) return;
    if (!/^[0-9]{4}$/.test(pinForm.pin)) {
      setPinError("Il PIN deve avere 4 cifre numeriche.");
      return;
    }
    if (pinForm.pin !== pinForm.confirmPin) {
      setPinError("I PIN non coincidono.");
      return;
    }
    try {
      await edgeApi(`/api/staff/${pinTarget.id}`, {
        method: "PATCH",
        body: JSON.stringify({ pin: pinForm.pin }),
      });
      setPinTarget(null);
      setPinForm({ pin: "", confirmPin: "" });
      setPinError("");
      void load();
    } catch (err) {
      setPinError(err instanceof Error ? err.message : "Errore aggiornamento PIN");
    }
  };

  const roleLabel = (role: string): string => {
    if (role === "USER_ADMIN") return "User Admin";
    if (role === "CASHIER") return "Cassiere";
    if (role === "WAITER") return "Cameriere";
    return role;
  };
  const formatDateTime = (iso?: string): string => {
    if (!iso) return "—";
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return "—";
    return d.toLocaleString("it-IT", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  const activeCount = staff.filter((m) => m.isActive).length;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-bold">Staff locale</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            {activeCount} attiv{activeCount === 1 ? "o" : "i"} su {staff.length} operatori
          </p>
        </div>
        <Button type="button" onClick={() => setShowCreateModal(true)}>
          Nuovo operatore
        </Button>
      </div>

      <Card className="overflow-hidden border-[hsl(var(--pg-border))] shadow-sm">
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-[hsl(var(--pg-muted))]/50 text-xs uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
                <tr>
                  <th className="px-4 py-3 text-left font-semibold">Operatore</th>
                  <th className="px-4 py-3 text-left font-semibold">Ruolo</th>
                  <th className="px-4 py-3 text-left font-semibold">Stato</th>
                  <th className="px-4 py-3 text-right font-semibold">Azioni</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((m) => (
                  <tr
                    key={m.id}
                    className={`transition hover:bg-[hsl(var(--pg-muted))]/25 ${!m.isActive ? "opacity-70" : ""}`}
                  >
                    <td className="border-t border-[hsl(var(--pg-border))] px-4 py-3 font-medium">
                      {m.firstName} {m.lastName}
                    </td>
                    <td className="border-t border-[hsl(var(--pg-border))] px-4 py-3">
                      <span className="inline-flex rounded-full border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/35 px-2 py-0.5 text-xs font-medium">
                        {roleLabel(m.role)}
                      </span>
                    </td>
                    <td className="border-t border-[hsl(var(--pg-border))] px-4 py-3">
                      <span
                        className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                          m.isActive
                            ? "bg-emerald-500/15 text-emerald-700"
                            : "bg-amber-500/15 text-amber-800"
                        }`}
                      >
                        {m.isActive ? "Attivo" : "Disattivato"}
                      </span>
                    </td>
                    <td className="border-t border-[hsl(var(--pg-border))] px-4 py-3 text-right">
                      <div className="inline-flex items-center gap-2">
                        <Button
                          variant="outline"
                          className="h-8 px-3 text-xs"
                          onClick={() => setDetailTarget(m)}
                        >
                          Dettaglio
                        </Button>
                        {m.isActive ? (
                          <Button
                            variant="outline"
                            className="h-8 px-3 text-xs"
                            onClick={() => setDeactivateTarget(m)}
                          >
                            Disattiva
                          </Button>
                        ) : (
                          <Button
                            variant="outline"
                            className="h-8 px-3 text-xs"
                            onClick={() => void toggleActive(m)}
                          >
                            Riattiva
                          </Button>
                        )}
                        <Button
                          variant="outline"
                          className="h-8 px-3 text-xs"
                          onClick={() => {
                            setPinTarget(m);
                            setPinForm({ pin: "", confirmPin: "" });
                            setPinError("");
                          }}
                        >
                          Reimposta PIN
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {staff.length === 0 && (
                  <tr>
                    <td
                      colSpan={4}
                      className="border-t border-[hsl(var(--pg-border))] px-4 py-8 text-center text-sm text-[hsl(var(--pg-muted-foreground))]"
                    >
                      Nessun operatore configurato.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {deactivateTarget && (
        <ConfirmModal
          title="Disattivare operatore?"
          message={`${deactivateTarget.firstName} ${deactivateTarget.lastName} non potrà più accedere con il PIN.`}
          confirmLabel="Disattiva"
          variant="danger"
          onConfirm={() => void toggleActive(deactivateTarget)}
          onCancel={() => setDeactivateTarget(null)}
        />
      )}

      {showCreateModal && (
        <ActionModal
          title="Nuovo operatore"
          onClose={() => {
            setShowCreateModal(false);
            setCreateError("");
          }}
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError("");
                }}
              >
                Annulla
              </Button>
              <Button type="submit" form="create-staff-form">
                Aggiungi
              </Button>
            </>
          }
        >
          <form id="create-staff-form" onSubmit={create} className="grid gap-2 md:grid-cols-2">
            <input
              className="rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
              placeholder="Nome"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
              autoFocus
            />
            <input
              className="rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
              placeholder="Cognome"
              value={form.lastName}
              onChange={(e) => setForm({ ...form, lastName: e.target.value })}
              required
            />
            <select
              className="rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
              value={form.role}
              onChange={(e) => setForm({ ...form, role: e.target.value })}
            >
              <option value="USER_ADMIN">User Admin</option>
              <option value="CASHIER">Cassiere</option>
              <option value="WAITER">Cameriere</option>
            </select>
            <input
              className="rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
              placeholder="PIN 4 cifre"
              pattern="[0-9]{4}"
              maxLength={4}
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value })}
              required
            />
            {createError && <p className="text-sm text-red-600 md:col-span-2">{createError}</p>}
          </form>
        </ActionModal>
      )}

      {detailTarget && (
        <ActionModal
          title="Dettaglio operatore"
          onClose={() => setDetailTarget(null)}
          footer={
            <Button type="button" variant="outline" onClick={() => setDetailTarget(null)}>
              Chiudi
            </Button>
          }
        >
          <div className="grid gap-2 text-sm">
            <DetailRow label="Nome" value={detailTarget.firstName} />
            <DetailRow label="Cognome" value={detailTarget.lastName} />
            <DetailRow label="Ruolo" value={roleLabel(detailTarget.role)} />
            <DetailRow label="Stato" value={detailTarget.isActive ? "Attivo" : "Disattivato"} />
            <DetailRow label="Creato il" value={formatDateTime(detailTarget.createdAt)} />
            <DetailRow label="ID" value={detailTarget.id} mono />
          </div>
        </ActionModal>
      )}

      {pinTarget && (
        <ActionModal
          title={`Reimposta PIN · ${pinTarget.firstName} ${pinTarget.lastName}`}
          onClose={() => {
            setPinTarget(null);
            setPinForm({ pin: "", confirmPin: "" });
            setPinError("");
          }}
          footer={
            <>
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setPinTarget(null);
                  setPinForm({ pin: "", confirmPin: "" });
                  setPinError("");
                }}
              >
                Annulla
              </Button>
              <Button type="submit" form="reset-pin-form">
                Salva PIN
              </Button>
            </>
          }
        >
          <form id="reset-pin-form" onSubmit={resetPin} className="space-y-3">
            <input
              className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
              placeholder="Nuovo PIN (4 cifre)"
              pattern="[0-9]{4}"
              maxLength={4}
              value={pinForm.pin}
              onChange={(e) => {
                setPinForm((prev) => ({ ...prev, pin: e.target.value }));
                setPinError("");
              }}
              required
              autoFocus
            />
            <input
              className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
              placeholder="Conferma PIN"
              pattern="[0-9]{4}"
              maxLength={4}
              value={pinForm.confirmPin}
              onChange={(e) => {
                setPinForm((prev) => ({ ...prev, confirmPin: e.target.value }));
                setPinError("");
              }}
              required
            />
            {pinError && <p className="text-sm text-red-600">{pinError}</p>}
          </form>
        </ActionModal>
      )}
    </div>
  );
}

function ActionModal({
  title,
  children,
  footer,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  footer: React.ReactNode;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
      <div className="w-full max-w-xl rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] shadow-2xl">
        <div className="flex items-center justify-between border-b border-[hsl(var(--pg-border))] px-4 py-3">
          <h2 className="text-base font-semibold">{title}</h2>
          <button
            type="button"
            className="rounded px-2 py-1 text-sm text-[hsl(var(--pg-muted-foreground))] hover:bg-[hsl(var(--pg-muted))]/50"
            onClick={onClose}
            aria-label="Chiudi"
          >
            ✕
          </button>
        </div>
        <div className="px-4 py-4">{children}</div>
        <div className="flex justify-end gap-2 border-t border-[hsl(var(--pg-border))] px-4 py-3">{footer}</div>
      </div>
    </div>
  );
}

function DetailRow({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="grid grid-cols-[110px_1fr] items-start gap-2 border-b border-[hsl(var(--pg-border))] pb-2 last:border-b-0 last:pb-0">
      <span className="text-xs font-semibold uppercase tracking-wide text-[hsl(var(--pg-muted-foreground))]">
        {label}
      </span>
      <span className={`break-all ${mono ? "font-mono text-xs" : ""}`}>{value}</span>
    </div>
  );
}
