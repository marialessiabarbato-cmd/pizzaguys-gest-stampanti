import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useMemo, useState } from "react";
import { edgeApi } from "../lib/api";
import { ConfirmModal } from "./ConfirmModal";

type ReservationShift = "LUNCH" | "DINNER_1" | "DINNER_2" | "OTHER";
type ReservationStatus =
  | "PENDING"
  | "CONFIRMED"
  | "ARRIVED"
  | "SEATED"
  | "CANCELLED"
  | "NO_SHOW";

interface ReservationRow {
  id: string;
  seqNumber: number;
  reservationDate: string;
  reservationTime: string;
  shift: ReservationShift;
  customerName: string;
  phone: string | null;
  guests: number;
  tableId: string | null;
  tableLabel: string | null;
  roomId: string | null;
  roomName: string | null;
  notes: string | null;
  status: ReservationStatus;
  isWaitingList: boolean;
}

interface LiveTableOption {
  id: string;
  label: string;
  roomId?: string | null;
  isVirtual: boolean;
}

const SHIFT_OPTIONS: Array<{ id: ReservationShift | "ALL"; label: string }> = [
  { id: "ALL", label: "Tutti i turni" },
  { id: "LUNCH", label: "Pranzo" },
  { id: "DINNER_1", label: "Cena 1° turno" },
  { id: "DINNER_2", label: "Cena 2° turno" },
  { id: "OTHER", label: "Altro" },
];

const SHIFT_LABEL: Record<ReservationShift, string> = {
  LUNCH: "Pranzo",
  DINNER_1: "Cena 1°",
  DINNER_2: "Cena 2°",
  OTHER: "Altro",
};

const STATUS_LABEL: Record<ReservationStatus, string> = {
  PENDING: "In attesa",
  CONFIRMED: "Confermata",
  ARRIVED: "Arrivato",
  SEATED: "Seduto",
  CANCELLED: "Annullata",
  NO_SHOW: "No show",
};

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

const EMPTY_FORM = {
  reservationDate: todayKey(),
  reservationTime: "20:00",
  shift: "DINNER_1" as ReservationShift,
  customerName: "",
  phone: "",
  guests: "2",
  tableId: "",
  notes: "",
  isWaitingList: false,
};

export function ReservationsModal({
  operatorId,
  operatorName,
  rooms,
  tables,
  onClose,
  onOpenTable,
}: {
  operatorId: string;
  operatorName: string;
  rooms: Array<{ id: string; name: string }>;
  tables: LiveTableOption[];
  onClose: () => void;
  onOpenTable?: (tableId: string) => void;
}) {
  const [from, setFrom] = useState(todayKey());
  const [to, setTo] = useState(todayKey());
  const [shift, setShift] = useState<ReservationShift | "ALL">("ALL");
  const [roomId, setRoomId] = useState("");
  const [waitingListOnly, setWaitingListOnly] = useState(false);
  const [q, setQ] = useState("");
  const [rows, setRows] = useState<ReservationRow[]>([]);
  const [summary, setSummary] = useState({ total: 0, active: 0, guests: 0, waitingList: 0 });
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [mode, setMode] = useState<"list" | "form">("list");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [showAvailability, setShowAvailability] = useState(false);
  const [availability, setAvailability] = useState<{
    byShift: Record<ReservationShift, { reservations: number; guests: number }>;
    totalTableCapacity: number;
  } | null>(null);
  const [assignTableId, setAssignTableId] = useState("");

  const physicalTables = useMemo(
    () => tables.filter((t) => !t.isVirtual),
    [tables],
  );

  const selected = useMemo(
    () => rows.find((r) => r.id === selectedId) ?? null,
    [rows, selectedId],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const params = new URLSearchParams({ from, to, status: "ALL" });
      if (shift !== "ALL") params.set("shift", shift);
      if (roomId) params.set("roomId", roomId);
      if (waitingListOnly) params.set("waitingList", "1");
      if (q.trim()) params.set("q", q.trim());
      const data = await edgeApi<{
        reservations: ReservationRow[];
        summary: typeof summary;
      }>(`/api/reservations?${params}`);
      setRows(data.reservations);
      setSummary(data.summary);
      setSelectedId((prev) =>
        prev && data.reservations.some((r) => r.id === prev)
          ? prev
          : data.reservations[0]?.id ?? null,
      );
    } catch (err) {
      setRows([]);
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [from, to, shift, roomId, waitingListOnly, q]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (selected?.tableId) setAssignTableId(selected.tableId);
  }, [selected]);

  const openCreate = () => {
    setEditingId(null);
    setForm({ ...EMPTY_FORM, reservationDate: from });
    setMode("form");
    setMessage("");
  };

  const openEdit = () => {
    if (!selected) return;
    setEditingId(selected.id);
    setForm({
      reservationDate: selected.reservationDate,
      reservationTime: selected.reservationTime,
      shift: selected.shift,
      customerName: selected.customerName,
      phone: selected.phone ?? "",
      guests: String(selected.guests),
      tableId: selected.tableId ?? "",
      notes: selected.notes ?? "",
      isWaitingList: selected.isWaitingList,
    });
    setMode("form");
    setMessage("");
  };

  const saveForm = async () => {
    if (!form.customerName.trim()) {
      setError("Nome cliente obbligatorio");
      return;
    }
    const guests = Number(form.guests);
    if (!Number.isFinite(guests) || guests < 1) {
      setError("Coperti non validi");
      return;
    }
    setActionLoading(true);
    setError("");
    try {
      const body = {
        reservationDate: form.reservationDate,
        reservationTime: form.reservationTime,
        shift: form.shift,
        customerName: form.customerName.trim(),
        phone: form.phone.trim() || undefined,
        guests,
        tableId: form.tableId || undefined,
        notes: form.notes.trim() || undefined,
        isWaitingList: form.isWaitingList,
        operatorId,
        operatorName,
      };
      if (editingId) {
        await edgeApi(`/api/reservations/${editingId}`, {
          method: "PATCH",
          body: JSON.stringify(body),
        });
        setMessage("Prenotazione aggiornata");
      } else {
        await edgeApi("/api/reservations", {
          method: "POST",
          body: JSON.stringify(body),
        });
        setMessage("Prenotazione inserita");
      }
      setMode("list");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Salvataggio fallito");
    } finally {
      setActionLoading(false);
    }
  };

  const runAction = async (path: string, success: string) => {
    if (!selected) return;
    setActionLoading(true);
    setError("");
    try {
      await edgeApi(path, { method: "POST", body: JSON.stringify({}) });
      setMessage(success);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione fallita");
    } finally {
      setActionLoading(false);
    }
  };

  const assignTable = async () => {
    if (!selected || !assignTableId) return;
    setActionLoading(true);
    setError("");
    try {
      await edgeApi(`/api/reservations/${selected.id}/assign-table`, {
        method: "POST",
        body: JSON.stringify({ tableId: assignTableId }),
      });
      setMessage("Tavolo assegnato");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Assegnazione fallita");
    } finally {
      setActionLoading(false);
    }
  };

  const arrive = async () => {
    if (!selected) return;
    setActionLoading(true);
    setError("");
    try {
      const updated = await edgeApi<ReservationRow>(`/api/reservations/${selected.id}/arrive`, {
        method: "POST",
        body: JSON.stringify({ openTable: Boolean(selected.tableId) }),
      });
      setMessage(updated.status === "SEATED" ? "Cliente seduto — tavolo aperto" : "Cliente arrivato");
      await load();
      if (updated.tableId && onOpenTable) onOpenTable(updated.tableId);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Operazione fallita");
    } finally {
      setActionLoading(false);
    }
  };

  const loadAvailability = async () => {
    setActionLoading(true);
    try {
      const data = await edgeApi<{
        byShift: Record<ReservationShift, { reservations: number; guests: number }>;
        totalTableCapacity: number;
      }>(`/api/reservations/availability?date=${from}`);
      setAvailability(data);
      setShowAvailability(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Disponibilità non disponibile");
    } finally {
      setActionLoading(false);
    }
  };

  const printList = async () => {
    setActionLoading(true);
    setError("");
    try {
      const result = await edgeApi<{ count: number; txtPath?: string }>("/api/reservations/print", {
        method: "POST",
        body: JSON.stringify({
          from,
          to,
          shift,
          roomId: roomId || undefined,
          operatorName,
        }),
      });
      setMessage(`Stampate ${result.count} prenotazioni (file in tmp/prints/)`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Stampa fallita");
    } finally {
      setActionLoading(false);
    }
  };

  const whatsappLink = selected?.phone
    ? `https://wa.me/${selected.phone.replace(/\D/g, "")}?text=${encodeURIComponent(
        `Buongiorno ${selected.customerName}, la aspettiamo il ${selected.reservationDate} alle ${selected.reservationTime}.`,
      )}`
    : null;

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black/50 p-2 sm:p-4">
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col rounded-xl bg-[hsl(var(--pg-background))] shadow-xl">
        <header className="shrink-0 border-b border-[hsl(var(--pg-border))] px-4 py-3">
          <div className="mb-3 flex items-center justify-between gap-2">
            <h2 className="text-lg font-bold">Prenotazioni</h2>
            <Button variant="ghost" className="h-9" onClick={onClose}>
              Chiudi
            </Button>
          </div>

          {mode === "list" ? (
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-[hsl(var(--pg-muted-foreground))]">Da</span>
                  <input
                    type="date"
                    className="h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                    value={from}
                    onChange={(e) => setFrom(e.target.value)}
                  />
                </label>
                <label className="text-sm">
                  <span className="mb-1 block text-xs text-[hsl(var(--pg-muted-foreground))]">A</span>
                  <input
                    type="date"
                    className="h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                    value={to}
                    onChange={(e) => setTo(e.target.value)}
                  />
                </label>
                <label className="text-sm sm:col-span-2">
                  <span className="mb-1 block text-xs text-[hsl(var(--pg-muted-foreground))]">Turno</span>
                  <select
                    className="h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                    value={shift}
                    onChange={(e) => setShift(e.target.value as ReservationShift | "ALL")}
                  >
                    {SHIFT_OPTIONS.map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                <select
                  className="h-10 rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 text-sm"
                  value={roomId}
                  onChange={(e) => setRoomId(e.target.value)}
                >
                  <option value="">Tutte le sale</option>
                  {rooms.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name}
                    </option>
                  ))}
                </select>
                <input
                  className="h-10 rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 text-sm"
                  placeholder="Cerca cliente, telefono, tavolo…"
                  value={q}
                  onChange={(e) => setQ(e.target.value)}
                />
                <label className="flex h-10 items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={waitingListOnly}
                    onChange={(e) => setWaitingListOnly(e.target.checked)}
                  />
                  Solo lista d&apos;attesa
                </label>
              </div>
              <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                {summary.active} attive · {summary.guests} coperti · {summary.waitingList} in attesa
              </p>
            </div>
          ) : (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
              {editingId ? "Modifica prenotazione" : "Nuova prenotazione"}
            </p>
          )}
        </header>

        {(error || message) && (
          <p
            className={`shrink-0 px-4 py-2 text-sm ${error ? "bg-red-500/10 text-red-600" : "bg-green-500/10 text-green-700"}`}
          >
            {error || message}
          </p>
        )}

        {mode === "form" ? (
          <div className="min-h-0 flex-1 overflow-y-auto p-4">
            <div className="mx-auto grid max-w-lg gap-3">
              <label className="text-sm">
                Data
                <input
                  type="date"
                  className="mt-1 h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                  value={form.reservationDate}
                  onChange={(e) => setForm((f) => ({ ...f, reservationDate: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Orario
                  <input
                    type="time"
                    className="mt-1 h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                    value={form.reservationTime}
                    onChange={(e) => setForm((f) => ({ ...f, reservationTime: e.target.value }))}
                  />
                </label>
                <label className="text-sm">
                  Turno
                  <select
                    className="mt-1 h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                    value={form.shift}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, shift: e.target.value as ReservationShift }))
                    }
                  >
                    {SHIFT_OPTIONS.filter((o) => o.id !== "ALL").map((o) => (
                      <option key={o.id} value={o.id}>
                        {o.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <label className="text-sm">
                Cliente *
                <input
                  className="mt-1 h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                  value={form.customerName}
                  onChange={(e) => setForm((f) => ({ ...f, customerName: e.target.value }))}
                />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className="text-sm">
                  Telefono
                  <input
                    className="mt-1 h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                    value={form.phone}
                    onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  />
                </label>
                <label className="text-sm">
                  Coperti
                  <input
                    type="number"
                    min={1}
                    className="mt-1 h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                    value={form.guests}
                    onChange={(e) => setForm((f) => ({ ...f, guests: e.target.value }))}
                  />
                </label>
              </div>
              <label className="text-sm">
                Tavolo (opzionale)
                <select
                  className="mt-1 h-10 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2"
                  value={form.tableId}
                  onChange={(e) => setForm((f) => ({ ...f, tableId: e.target.value }))}
                >
                  <option value="">Da assegnare</option>
                  {physicalTables.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm">
                Note
                <textarea
                  className="mt-1 min-h-[72px] w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 py-2"
                  value={form.notes}
                  onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                />
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.isWaitingList}
                  onChange={(e) => setForm((f) => ({ ...f, isWaitingList: e.target.checked }))}
                />
                Lista d&apos;attesa (senza tavolo)
              </label>
              <div className="flex gap-2 pt-2">
                <Button className="flex-1" disabled={actionLoading} onClick={() => void saveForm()}>
                  Salva
                </Button>
                <Button
                  variant="outline"
                  className="flex-1"
                  onClick={() => {
                    setMode("list");
                    setError("");
                  }}
                >
                  Annulla
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[1fr_280px]">
            <div className="min-h-0 overflow-auto border-r border-[hsl(var(--pg-border))]">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="sticky top-0 bg-[hsl(var(--pg-muted))] text-left text-xs uppercase">
                  <tr>
                    <th className="px-2 py-2">N.</th>
                    <th className="px-2 py-2">Data</th>
                    <th className="px-2 py-2">Ora</th>
                    <th className="px-2 py-2">Cliente</th>
                    <th className="px-2 py-2">Pers.</th>
                    <th className="px-2 py-2">Tavolo</th>
                    <th className="px-2 py-2">Stato</th>
                    <th className="px-2 py-2">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {loading && rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-2 py-8 text-center text-[hsl(var(--pg-muted-foreground))]">
                        Caricamento…
                      </td>
                    </tr>
                  ) : rows.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="px-2 py-8 text-center text-[hsl(var(--pg-muted-foreground))]">
                        Nessuna prenotazione nel periodo
                      </td>
                    </tr>
                  ) : (
                    rows.map((row) => (
                      <tr
                        key={row.id}
                        className={`cursor-pointer border-t border-[hsl(var(--pg-border))] ${
                          selectedId === row.id ? "bg-[hsl(var(--pg-primary))]/10" : "hover:bg-[hsl(var(--pg-muted))]/30"
                        }`}
                        onClick={() => setSelectedId(row.id)}
                      >
                        <td className="px-2 py-2 tabular-nums">{row.seqNumber}</td>
                        <td className="px-2 py-2">{row.reservationDate}</td>
                        <td className="px-2 py-2">{row.reservationTime}</td>
                        <td className="px-2 py-2">
                          <div>{row.customerName}</div>
                          {row.phone && (
                            <div className="text-xs text-[hsl(var(--pg-muted-foreground))]">{row.phone}</div>
                          )}
                        </td>
                        <td className="px-2 py-2 tabular-nums">{row.guests}</td>
                        <td className="px-2 py-2">{row.tableLabel ?? "—"}</td>
                        <td className="px-2 py-2 text-xs">
                          {STATUS_LABEL[row.status]}
                          {row.isWaitingList ? " · attesa" : ""}
                        </td>
                        <td className="max-w-[120px] truncate px-2 py-2 text-xs">{row.notes ?? ""}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            <aside className="flex min-h-0 flex-col gap-2 overflow-y-auto p-3">
              <p className="text-xs font-semibold uppercase text-[hsl(var(--pg-muted-foreground))]">Azioni</p>
              {selected ? (
                <>
                  <p className="text-sm font-medium">{selected.customerName}</p>
                  <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    {selected.reservationDate} {selected.reservationTime} · {SHIFT_LABEL[selected.shift]}
                  </p>
                  <label className="text-xs">
                    Assegna tavolo
                    <select
                      className="mt-1 h-9 w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 text-sm"
                      value={assignTableId}
                      onChange={(e) => setAssignTableId(e.target.value)}
                    >
                      <option value="">—</option>
                      {physicalTables.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <Button
                    className="h-9 w-full text-xs"
                    variant="outline"
                    disabled={!assignTableId || actionLoading}
                    onClick={() => void assignTable()}
                  >
                    Assegna tavolo
                  </Button>
                  <Button
                    className="h-9 w-full text-xs"
                    disabled={actionLoading || selected.status === "SEATED"}
                    onClick={() => void arrive()}
                  >
                    Cliente arrivato
                  </Button>
                  <Button
                    className="h-9 w-full text-xs"
                    variant="outline"
                    disabled={actionLoading}
                    onClick={() => void runAction(`/api/reservations/${selected.id}/confirm`, "Confermata")}
                  >
                    Conferma
                  </Button>
                  {whatsappLink && (
                    <a
                      href={whatsappLink}
                      target="_blank"
                      rel="noreferrer"
                      className="inline-flex h-9 w-full items-center justify-center rounded-md border border-[hsl(var(--pg-border))] text-xs hover:bg-[hsl(var(--pg-muted))]/40"
                    >
                      WhatsApp
                    </a>
                  )}
                </>
              ) : (
                <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Seleziona una riga</p>
              )}
            </aside>
          </div>
        )}

        {mode === "list" && (
          <footer className="shrink-0 flex flex-wrap gap-2 border-t border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-primary))]/5 px-4 py-3">
            <Button className="h-9 text-sm" onClick={openCreate}>
              + Inserisci
            </Button>
            <Button className="h-9 text-sm" variant="outline" disabled={!selected} onClick={openEdit}>
              Modifica
            </Button>
            <Button
              className="h-9 text-sm"
              variant="outline"
              disabled={!selected || actionLoading}
              onClick={() => setConfirmDelete(true)}
            >
              Elimina
            </Button>
            <Button
              className="h-9 text-sm"
              variant="outline"
              disabled={!selected || actionLoading}
              onClick={() =>
                void runAction(`/api/reservations/${selected!.id}/restore`, "Prenotazione ripristinata")
              }
            >
              Ripristina
            </Button>
            <Button className="h-9 text-sm" variant="outline" onClick={() => void load()}>
              Aggiorna
            </Button>
            <Button className="h-9 text-sm" variant="outline" onClick={() => void loadAvailability()}>
              Disponibilità
            </Button>
            <Button className="h-9 text-sm" variant="outline" disabled={actionLoading} onClick={() => void printList()}>
              Stampa
            </Button>
            <Button
              className="h-9 text-sm"
              variant="outline"
              disabled={!selected || actionLoading}
              onClick={() =>
                void runAction(`/api/reservations/${selected!.id}/no-show`, "Segnato no show")
              }
            >
              No show
            </Button>
          </footer>
        )}
      </div>

      {confirmDelete && selected && (
        <ConfirmModal
          title="Eliminare prenotazione?"
          message={`Rimuovere la prenotazione di ${selected.customerName}?`}
          confirmLabel="Elimina"
          onConfirm={async () => {
            setConfirmDelete(false);
            setActionLoading(true);
            try {
              await edgeApi(`/api/reservations/${selected.id}`, { method: "DELETE" });
              setMessage("Prenotazione eliminata");
              setSelectedId(null);
              await load();
            } catch (err) {
              setError(err instanceof Error ? err.message : "Eliminazione fallita");
            } finally {
              setActionLoading(false);
            }
          }}
          onCancel={() => setConfirmDelete(false)}
        />
      )}

      {showAvailability && availability && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-md rounded-xl bg-[hsl(var(--pg-background))] p-5 shadow-xl">
            <h3 className="mb-3 font-bold">Disponibilità — {from}</h3>
            <p className="mb-3 text-sm text-[hsl(var(--pg-muted-foreground))]">
              Capienza tavoli fisici: {availability.totalTableCapacity} coperti
            </p>
            <ul className="space-y-2 text-sm">
              {(Object.keys(availability.byShift) as ReservationShift[]).map((key) => (
                <li key={key} className="flex justify-between border-b border-[hsl(var(--pg-border))] py-1">
                  <span>{SHIFT_LABEL[key]}</span>
                  <span>
                    {availability.byShift[key].guests} cop. / {availability.byShift[key].reservations} pren.
                  </span>
                </li>
              ))}
            </ul>
            <Button className="mt-4 w-full" onClick={() => setShowAvailability(false)}>
              Chiudi
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
