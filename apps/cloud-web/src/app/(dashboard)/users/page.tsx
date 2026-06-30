"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";
import { api } from "@/lib/api";

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
    const qs = filterLocationId ? `?locationId=${filterLocationId}` : "";
    void api<UserAdmin[]>(`/api/v2/users${qs}`).then(setUsers);
  };

  useEffect(() => {
    void api<Location[]>("/api/v2/locations").then(setLocations);
  }, []);

  useEffect(() => {
    load();
  }, [filterLocationId]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await api<{ password: string }>("/api/v2/users", {
      method: "POST",
      body: JSON.stringify(form),
    });
    setPasswordReveal(res.password);
    setForm({ email: "", firstName: "", lastName: "", locationId: "", pin: "" });
    load();
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
      <h1 className="text-2xl font-bold">User Admin per sede</h1>

      {passwordReveal && (
        <Card className="border-[hsl(var(--pg-warning))]">
          <CardContent className="pt-6">
            <p className="mb-2 font-medium text-[hsl(var(--pg-warning))]">
              Password temporanea — copiala ora:
            </p>
            <code className="block break-all rounded bg-[hsl(var(--pg-muted))] p-3 text-sm">
              {passwordReveal}
            </code>
            <Button className="mt-3" variant="outline" onClick={() => setPasswordReveal(null)}>
              Ho salvato la password
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Nuovo User Admin</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
            <input
              className="rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
              placeholder="Email"
              type="email"
              value={form.email}
              onChange={(e) => setForm({ ...form, email: e.target.value })}
              required
            />
            <input
              className="rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
              placeholder="Nome"
              value={form.firstName}
              onChange={(e) => setForm({ ...form, firstName: e.target.value })}
              required
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
              value={form.locationId}
              onChange={(e) => setForm({ ...form, locationId: e.target.value })}
              required
            >
              <option value="">Seleziona sede</option>
              {locations.map((l) => (
                <option key={l.id} value={l.id}>{l.name}</option>
              ))}
            </select>
            <input
              className="rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2"
              placeholder="PIN (4 cifre)"
              pattern="[0-9]{4}"
              maxLength={4}
              value={form.pin}
              onChange={(e) => setForm({ ...form, pin: e.target.value })}
              required
            />
            <Button type="submit" className="md:col-span-2">Crea User Admin</Button>
          </form>
        </CardContent>
      </Card>

      <div className="flex items-center gap-3">
        <label className="text-sm">Filtra per sede:</label>
        <select
          className="rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
          value={filterLocationId}
          onChange={(e) => setFilterLocationId(e.target.value)}
        >
          <option value="">Tutte</option>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>{l.name}</option>
          ))}
        </select>
      </div>

      <div className="space-y-3">
        {users.map((u) => (
          <Card key={u.id}>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="font-semibold">{u.firstName} {u.lastName}</p>
                <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{u.email}</p>
                <p className="text-xs">Sede: {locationName(u.locationId)}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`text-xs uppercase ${u.isActive ? "text-green-600" : "text-red-500"}`}>
                  {u.isActive ? "Attivo" : "Disattivo"}
                </span>
                <Button variant="outline" onClick={() => setToggleTarget(u)}>
                  {u.isActive ? "Disattiva" : "Attiva"}
                </Button>
                <Button variant="ghost" onClick={() => setDeleteTarget(u)}>
                  Elimina
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
        {users.length === 0 && (
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessun User Admin configurato.</p>
        )}
      </div>

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
