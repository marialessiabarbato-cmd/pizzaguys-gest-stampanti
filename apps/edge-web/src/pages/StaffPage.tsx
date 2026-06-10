import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useEffect, useState } from "react";
import { edgeApi } from "@/lib/api";

interface StaffMember {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
  isActive: boolean;
}

interface Shift {
  id: string;
  staffId: string;
  startedAt: string;
}

export function StaffPage() {
  const [staff, setStaff] = useState<StaffMember[]>([]);
  const [shifts, setShifts] = useState<Shift[]>([]);
  const [form, setForm] = useState({
    firstName: "",
    lastName: "",
    role: "WAITER",
    pin: "",
  });

  const load = async () => {
    const [s, sh] = await Promise.all([
      edgeApi<StaffMember[]>("/api/staff"),
      edgeApi<Shift[]>("/api/shifts"),
    ]);
    setStaff(s);
    setShifts(sh);
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

  const startShift = async (staffId: string) => {
    await edgeApi("/api/shifts/start", { method: "POST", body: JSON.stringify({ staffId }) });
    void load();
  };

  const endShift = async (shiftId: string) => {
    await edgeApi(`/api/shifts/${shiftId}/end`, { method: "POST" });
    void load();
  };

  const activeShift = (staffId: string) => shifts.find((s) => s.staffId === staffId);

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
        {staff.map((m) => {
          const shift = activeShift(m.id);
          return (
            <Card key={m.id}>
              <CardContent className="flex items-center justify-between pt-6">
                <div>
                  <p className="font-medium">{m.firstName} {m.lastName}</p>
                  <p className="text-xs uppercase text-[hsl(var(--pg-muted-foreground))]">{m.role}</p>
                </div>
                {shift ? (
                  <Button variant="outline" onClick={() => void endShift(shift.id)}>
                    Chiudi turno
                  </Button>
                ) : (
                  <Button onClick={() => void startShift(m.id)}>Apri turno</Button>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
