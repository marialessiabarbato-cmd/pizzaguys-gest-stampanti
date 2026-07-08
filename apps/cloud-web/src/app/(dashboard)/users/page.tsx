"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";
import { api } from "@/lib/api";
import {
  btnSize,
  formGridClass,
  formRowEndGap3Class,
  inputFullClass,
  pageHeaderRowClass,
  selectClass,
  stackedLabelClass,
  stackedSelectClass,
} from "@/lib/cloud-admin-ui";

interface Location {
  id: string;
  name: string;
}

interface UserAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  locationId: string | null;
  isActive: boolean;
}

export default function UsersPage() {
  const [users, setUsers] = useState<UserAdmin[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [passwordReveal, setPasswordReveal] = useState<string | null>(null);
  const [filterLocationId, setFilterLocationId] = useState("");
  const [toggleTarget, setToggleTarget] = useState<UserAdmin | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<UserAdmin | null>(null);
  const [form, setForm] = useState({
    email: "",
    firstName: "",
    lastName: "",
    locationId: "",
    pin: "",
  });

  const load = () => {
    setLoading(true);
    const qs = filterLocationId ? `?locationId=${filterLocationId}` : "";
    void api<UserAdmin[]>(`/api/v2/users${qs}`)
      .then(setUsers)
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    void api<Location[]>("/api/v2/locations").then(setLocations);
  }, []);

  useEffect(() => {
    load();
  }, [filterLocationId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    try {
      const res = await api<{ password: string }>("/api/v2/users", {
        method: "POST",
        body: JSON.stringify(form),
      });
      setShowCreate(false);
      setPasswordReveal(res.password);
      setForm({ email: "", firstName: "", lastName: "", locationId: "", pin: "" });
      load();
    } finally {
      setCreating(false);
    }
  };

  const toggleActive = async (user: UserAdmin) => {
    await api(`/api/v2/users/${user.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !user.isActive }),
    });
    setToggleTarget(null);
    load();
  };

  const deleteUser = async (user: UserAdmin) => {
    await api(`/api/v2/users/${user.id}`, { method: "DELETE" });
    setDeleteTarget(null);
    load();
  };

  const locationName = (id: string | null) =>
    locations.find((l) => l.id === id)?.name ?? "—";

  return (
    <div className="space-y-6">
      <div className={pageHeaderRowClass}>
        <div>
          <h1 className="text-2xl font-bold">User Admin per sede</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Account locali per la gestione operativa di ogni punto vendita.
          </p>
        </div>
        <Button size={btnSize.inline} onClick={() => setShowCreate(true)}>
          Crea User Admin
        </Button>
      </div>

      {passwordReveal && (
        <Card className="border-[hsl(var(--pg-warning))]">
          <CardContent className="pt-6">
            <p className="mb-2 font-medium text-[hsl(var(--pg-warning))]">
              Password temporanea — copiala ora:
            </p>
            <code className="block break-all rounded bg-[hsl(var(--pg-muted))] p-3 text-sm">
              {passwordReveal}
            </code>
            <Button
              className="mt-3"
              size={btnSize.inline}
              variant="outline"
              onClick={() => setPasswordReveal(null)}
            >
              Ho salvato la password
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Elenco User Admin</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className={formRowEndGap3Class}>
            <label className={stackedLabelClass}>
              Sede
              <select
                className={stackedSelectClass}
                value={filterLocationId}
                onChange={(e) => setFilterLocationId(e.target.value)}
              >
                <option value="">Tutte le sedi</option>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            {filterLocationId
              ? `${locationName(filterLocationId)} · ${users.length} ${users.length === 1 ? "utente" : "utenti"}`
              : `${users.length} ${users.length === 1 ? "utente" : "utenti"} in totale`}
          </p>

          {loading ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>
          ) : users.length === 0 ? (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              Nessun User Admin configurato. Clicca &quot;Crea User Admin&quot; per iniziare.
            </p>
          ) : (
            <div className="overflow-x-auto rounded-lg border border-[hsl(var(--pg-border))]">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--pg-border))] text-xs text-[hsl(var(--pg-muted-foreground))]">
                    <th className="px-6 py-3 font-medium">Nome</th>
                    <th className="px-3 py-3 font-medium">Email</th>
                    <th className="px-3 py-3 font-medium">Sede</th>
                    <th className="px-3 py-3 font-medium">Stato</th>
                    <th className="px-6 py-3 font-medium text-right">Azioni</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u) => (
                    <tr key={u.id} className="border-b border-[hsl(var(--pg-border))]/50">
                      <td className="px-6 py-3 font-medium">
                        {u.firstName} {u.lastName}
                      </td>
                      <td className="px-3 py-3 text-[hsl(var(--pg-muted-foreground))]">{u.email}</td>
                      <td className="px-3 py-3">{locationName(u.locationId)}</td>
                      <td className="px-3 py-3">
                        <span
                          className={`text-xs font-medium uppercase ${
                            u.isActive ? "text-green-600" : "text-red-500"
                          }`}
                        >
                          {u.isActive ? "Attivo" : "Disattivo"}
                        </span>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex justify-end gap-1">
                          <Button
                            size={btnSize.list}
                            variant="outline"
                            onClick={() => setToggleTarget(u)}
                          >
                            {u.isActive ? "Disattiva" : "Attiva"}
                          </Button>
                          <Button
                            size={btnSize.list}
                            variant="ghost"
                            className="text-red-600"
                            onClick={() => setDeleteTarget(u)}
                          >
                            Elimina
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <Card className="w-full max-w-lg">
            <CardContent className="space-y-4 pt-6">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-semibold">Nuovo User Admin</h2>
                  <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                    L&apos;utente accederà alla cassa della sede selezionata con email e PIN.
                  </p>
                </div>
                <Button variant="ghost" type="button" size={btnSize.inline} onClick={() => setShowCreate(false)}>
                  ✕
                </Button>
              </div>
              <form onSubmit={create} className={formGridClass}>
                <input
                  className={inputFullClass}
                  placeholder="Email"
                  type="email"
                  value={form.email}
                  onChange={(e) => setForm({ ...form, email: e.target.value })}
                  required
                />
                <input
                  className={inputFullClass}
                  placeholder="Nome"
                  value={form.firstName}
                  onChange={(e) => setForm({ ...form, firstName: e.target.value })}
                  required
                />
                <input
                  className={inputFullClass}
                  placeholder="Cognome"
                  value={form.lastName}
                  onChange={(e) => setForm({ ...form, lastName: e.target.value })}
                  required
                />
                <select
                  className={`w-full ${selectClass}`}
                  value={form.locationId}
                  onChange={(e) => setForm({ ...form, locationId: e.target.value })}
                  required
                >
                  <option value="">Seleziona sede</option>
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>
                      {l.name}
                    </option>
                  ))}
                </select>
                <input
                  className={inputFullClass}
                  placeholder="PIN (4 cifre)"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={form.pin}
                  onChange={(e) => setForm({ ...form, pin: e.target.value })}
                  required
                />
                <div className="flex justify-end gap-2 md:col-span-2">
                  <Button type="button" variant="outline" size={btnSize.inline} onClick={() => setShowCreate(false)}>
                    Annulla
                  </Button>
                  <Button type="submit" size={btnSize.inline} disabled={creating}>
                    {creating ? "Creazione..." : "Crea User Admin"}
                  </Button>
                </div>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {toggleTarget && (
        <ConfirmModal
          title={toggleTarget.isActive ? "Disattivare utente?" : "Riattivare utente?"}
          message={`${toggleTarget.firstName} ${toggleTarget.lastName} (${toggleTarget.email})`}
          confirmLabel={toggleTarget.isActive ? "Disattiva" : "Attiva"}
          variant={toggleTarget.isActive ? "danger" : "default"}
          onConfirm={() => void toggleActive(toggleTarget)}
          onCancel={() => setToggleTarget(null)}
        />
      )}

      {deleteTarget && (
        <ConfirmModal
          title="Eliminazione definitiva"
          message={`Rimuovere permanentemente ${deleteTarget.email}? Operazione irreversibile.`}
          confirmLabel="Elimina"
          variant="danger"
          onConfirm={() => void deleteUser(deleteTarget)}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
