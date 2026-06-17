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

  const load = async () => {
    const s = await edgeApi<StaffMember[]>("/api/staff");
    setStaff(s);
  };

  useEffect(() => {
    void load();
  }, []);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    await edgeApi("/api/staff", { method: "POST", body: JSON.stringify(form) });
    setForm({ firstName: "", lastName: "", role: "WAITER", pin: "" });
    void load();
  };

  const toggleActive = async (member: StaffMember) => {
    await edgeApi(`/api/staff/${member.id}`, {
      method: "PATCH",
      body: JSON.stringify({ isActive: !member.isActive }),
    });
    setDeactivateTarget(null);
    void load();
  };

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Staff locale</h1>

      <Card>
        <CardHeader>
          <CardTitle>Nuovo operatore</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={create} className="grid gap-2 md:grid-cols-2">
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
            <Button type="submit" className="md:col-span-2">Aggiungi</Button>
          </form>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {staff.map((m) => (
          <Card key={m.id} className={!m.isActive ? "opacity-60" : ""}>
            <CardContent className="flex items-center justify-between pt-6">
              <div>
                <p className="font-medium">
                  {m.firstName} {m.lastName}
                  {!m.isActive && (
                    <span className="ml-2 text-xs text-orange-600">(disattivato)</span>
                  )}
                </p>
                <p className="text-xs uppercase text-[hsl(var(--pg-muted-foreground))]">{m.role}</p>
              </div>
              {m.isActive ? (
                <Button variant="outline" onClick={() => setDeactivateTarget(m)}>
                  Disattiva
                </Button>
              ) : (
                <Button variant="outline" onClick={() => void toggleActive(m)}>
                  Riattiva
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

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
    </div>
  );
}
