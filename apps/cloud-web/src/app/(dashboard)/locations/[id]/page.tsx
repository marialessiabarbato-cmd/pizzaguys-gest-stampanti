"use client";

import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { LocationDiscountPresetsPanel } from "@/components/LocationDiscountPresetsPanel";
import { LocationMealVoucherPresetsPanel } from "@/components/LocationMealVoucherPresetsPanel";
import { locationStatusLabel } from "@/lib/activity-labels";
import { api } from "@/lib/api";
import {
  backLinkClass,
  btnSize,
  formRowEndGap3Class,
  inputClass,
} from "@/lib/cloud-admin-ui";

interface ShiftReminderWindow {
  day: number;
  start: string;
  end: string;
}

interface LocationDetail {
  id: string;
  name: string;
  address: string;
  vatNumber: string;
  fiscalCode: string | null;
  managerEmail: string;
  sendClosureEmail: boolean;
  partnerEmails: string | null;
  coverChargeAmount: number;
  maxGuestCapacity: number;
  shiftReminderSchedule: ShiftReminderWindow[];
  healthStatus: string;
  schemaVersion: number;
  lastHeartbeatAt: string | null;
  hasToken: boolean;
  createdAt: string;
  updatedAt: string;
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs text-[hsl(var(--pg-muted-foreground))]">{label}</dt>
      <dd className="mt-0.5 text-sm">{value?.trim() ? value : "—"}</dd>
    </div>
  );
}

function statusColor(status: string) {
  if (status === "ONLINE") return "text-green-600";
  if (status === "DESYNC") return "text-amber-600";
  return "text-red-500";
}

function euro(value: number) {
  return `€ ${value.toFixed(2).replace(".", ",")}`;
}

/** Ordine di visualizzazione Lun→Dom; `day` è il valore salvato (0=Domenica … 6=Sabato, Date.getDay()). */
const WEEKDAYS: Array<{ day: number; label: string }> = [
  { day: 1, label: "Lunedì" },
  { day: 2, label: "Martedì" },
  { day: 3, label: "Mercoledì" },
  { day: 4, label: "Giovedì" },
  { day: 5, label: "Venerdì" },
  { day: 6, label: "Sabato" },
  { day: 0, label: "Domenica" },
];

interface DayShiftDraft {
  start1: string;
  end1: string;
  start2: string;
  end2: string;
}

const EMPTY_DAY_DRAFT: DayShiftDraft = { start1: "", end1: "", start2: "", end2: "" };

function scheduleToDraft(schedule: ShiftReminderWindow[]): Record<number, DayShiftDraft> {
  const draft: Record<number, DayShiftDraft> = {};
  for (const { day } of WEEKDAYS) draft[day] = { ...EMPTY_DAY_DRAFT };
  for (const day of WEEKDAYS.map((w) => w.day)) {
    const windows = schedule.filter((w) => w.day === day);
    const row = draft[day];
    if (!row) continue;
    if (windows[0]) {
      row.start1 = windows[0].start;
      row.end1 = windows[0].end;
    }
    if (windows[1]) {
      row.start2 = windows[1].start;
      row.end2 = windows[1].end;
    }
  }
  return draft;
}

function draftToSchedule(draft: Record<number, DayShiftDraft>): ShiftReminderWindow[] {
  const schedule: ShiftReminderWindow[] = [];
  for (const { day } of WEEKDAYS) {
    const row = draft[day];
    if (!row) continue;
    if (row.start1 && row.end1) schedule.push({ day, start: row.start1, end: row.end1 });
    if (row.start2 && row.end2) schedule.push({ day, start: row.start2, end: row.end2 });
  }
  return schedule;
}

export default function LocationDetailPage() {
  const params = useParams<{ id: string }>();
  const locationId = params.id;
  const [location, setLocation] = useState<LocationDetail | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [tokenReveal, setTokenReveal] = useState<string | null>(null);
  const [coverCharge, setCoverCharge] = useState("0");
  const [maxGuestCapacity, setMaxGuestCapacity] = useState("0");
  const [sendClosureEmail, setSendClosureEmail] = useState(false);
  const [partnerEmails, setPartnerEmails] = useState("");
  const [scheduleDraft, setScheduleDraft] = useState<Record<number, DayShiftDraft>>(
    scheduleToDraft([]),
  );

  const load = useCallback(async () => {
    if (!locationId) return;
    setLoading(true);
    setError("");
    try {
      const row = await api<LocationDetail>(`/api/v2/locations/${locationId}`);
      setLocation(row);
      setCoverCharge(String(row.coverChargeAmount));
      setMaxGuestCapacity(String(row.maxGuestCapacity ?? 0));
      setSendClosureEmail(row.sendClosureEmail);
      setPartnerEmails(row.partnerEmails ?? "");
      setScheduleDraft(scheduleToDraft(row.shiftReminderSchedule ?? []));
    } catch (err) {
      setLocation(null);
      setError(err instanceof Error ? err.message : "Errore caricamento");
    } finally {
      setLoading(false);
    }
  }, [locationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!locationId) return;
    const stored = sessionStorage.getItem(`pg_location_token_${locationId}`);
    if (stored) {
      setTokenReveal(stored);
      sessionStorage.removeItem(`pg_location_token_${locationId}`);
    }
  }, [locationId]);

  const saveCoverCharge = async () => {
    if (!location) return;
    const amount = Number(coverCharge);
    if (!Number.isFinite(amount) || amount < 0) return;
    await api(`/api/v2/locations/${location.id}`, {
      method: "PATCH",
      body: JSON.stringify({ coverChargeAmount: amount }),
    });
    await load();
  };

  const saveMaxGuestCapacity = async () => {
    if (!location) return;
    const capacity = Number.parseInt(maxGuestCapacity, 10);
    if (!Number.isFinite(capacity) || capacity < 0) return;
    await api(`/api/v2/locations/${location.id}`, {
      method: "PATCH",
      body: JSON.stringify({ maxGuestCapacity: capacity }),
    });
    await load();
  };

  const saveClosureEmail = async () => {
    if (!location) return;
    await api(`/api/v2/locations/${location.id}`, {
      method: "PATCH",
      body: JSON.stringify({ sendClosureEmail, partnerEmails }),
    });
    await load();
  };

  const saveShiftReminder = async () => {
    if (!location) return;
    await api(`/api/v2/locations/${location.id}`, {
      method: "PATCH",
      body: JSON.stringify({ shiftReminderSchedule: draftToSchedule(scheduleDraft) }),
    });
    await load();
  };

  const setDaySlot = (
    day: number,
    slot: "start1" | "end1" | "start2" | "end2",
    value: string,
  ) => {
    setScheduleDraft((prev) => ({
      ...prev,
      [day]: { ...(prev[day] ?? EMPTY_DAY_DRAFT), [slot]: value },
    }));
  };

  const regenerateToken = async () => {
    if (!location || !confirm("Rigenerare il token? Il vecchio token smetterà di funzionare.")) return;
    const res = await api<{ apiToken: string }>(`/api/v2/locations/${location.id}/regenerate-token`, {
      method: "POST",
    });
    setTokenReveal(res.apiToken);
    await load();
  };

  const revokeToken = async () => {
    if (!location || !confirm("Revocare il token? L'edge perderà la connessione al cloud.")) return;
    await api(`/api/v2/locations/${location.id}/token`, { method: "DELETE" });
    await load();
  };

  if (loading) {
    return <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento...</p>;
  }

  if (error || !location) {
    return (
      <div className="space-y-4">
        <Link href="/locations" className={backLinkClass}>
          ← Torna alle sedi
        </Link>
        <p className="text-sm text-red-500">{error || "Sede non trovata"}</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/locations"
            className={backLinkClass}
          >
            ← Torna alle sedi
          </Link>
          <h1 className="text-2xl font-bold">{location.name}</h1>
          <p className={`text-sm ${statusColor(location.healthStatus)}`}>
            {locationStatusLabel(location.healthStatus)}
            {location.lastHeartbeatAt && (
              <span className="text-[hsl(var(--pg-muted-foreground))]">
                {" "}
                · Ultimo contatto {new Date(location.lastHeartbeatAt).toLocaleString("it-IT")}
              </span>
            )}
          </p>
        </div>
        <Button variant="outline" asChild>
          <Link href="/locations">Elenco sedi</Link>
        </Button>
      </div>

      {tokenReveal && (
        <Card className="border-[hsl(var(--pg-warning))]">
          <CardContent className="pt-6">
            <p className="mb-2 font-medium text-[hsl(var(--pg-warning))]">
              Token API — copialo ora, non verrà più mostrato:
            </p>
            <code className="block break-all rounded bg-[hsl(var(--pg-muted))] p-3 text-sm">
              {tokenReveal}
            </code>
            <Button className="mt-3" variant="outline" onClick={() => setTokenReveal(null)}>
              Ho salvato il token
            </Button>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Dati sede</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Nome" value={location.name} />
            <Field label="Indirizzo" value={location.address} />
            <Field label="Partita IVA" value={location.vatNumber} />
            <Field label="Codice fiscale" value={location.fiscalCode} />
            <Field label="Email manager" value={location.managerEmail} />
            <Field label="Token collegamento" value={location.hasToken ? "Attivo" : "Revocato"} />
            <Field
              label="Creato il"
              value={new Date(location.createdAt).toLocaleString("it-IT")}
            />
            <Field
              label="Aggiornato il"
              value={new Date(location.updatedAt).toLocaleString("it-IT")}
            />
          </dl>

          <div className="border-t border-[hsl(var(--pg-border))] pt-4">
            <label className="mb-2 block text-sm font-medium">Coperto (€ per persona)</label>
            <div className={formRowEndGap3Class}>
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                className={`w-28 ${inputClass}`}
                value={coverCharge}
                onChange={(e) => setCoverCharge(e.target.value)}
              />
              <Button type="button" size={btnSize.inline} variant="outline" onClick={() => void saveCoverCharge()}>
                Salva coperto
              </Button>
              <span className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                Attuale: {euro(location.coverChargeAmount)}
              </span>
            </div>
          </div>

          <div className="border-t border-[hsl(var(--pg-border))] pt-4">
            <label className="mb-2 block text-sm font-medium">
              Capienza massima coperti sede
            </label>
            <p className="mb-2 text-xs text-[hsl(var(--pg-muted-foreground))]">
              Intero ≥ 0. Valore 0 = illimitata.
            </p>
            <div className={formRowEndGap3Class}>
              <input
                type="number"
                min={0}
                max={10000}
                step={1}
                className={`w-28 ${inputClass}`}
                value={maxGuestCapacity}
                onChange={(e) => setMaxGuestCapacity(e.target.value)}
              />
              <Button
                type="button"
                size={btnSize.inline}
                variant="outline"
                onClick={() => void saveMaxGuestCapacity()}
              >
                Salva capienza
              </Button>
              <span className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                Attuale:{" "}
                {location.maxGuestCapacity === 0
                  ? "Illimitata"
                  : `${location.maxGuestCapacity} coperti`}
              </span>
            </div>
          </div>

          <div className="border-t border-[hsl(var(--pg-border))] pt-4">
            <label className="mb-2 block text-sm font-medium">
              Promemoria apertura turno cassa
            </label>
            <p className="mb-3 text-xs text-[hsl(var(--pg-muted-foreground))]">
              Per ogni giorno, fino a due fasce (es. pranzo e cena). Se in quella fascia nessun
              operatore ha ancora avviato il turno, la Cassa mostra un promemoria. Lascia le
              caselle vuote per i giorni/fasce senza promemoria.
            </p>
            <div className="space-y-2">
              {WEEKDAYS.map(({ day, label }) => {
                const row = scheduleDraft[day] ?? EMPTY_DAY_DRAFT;
                return (
                  <div key={day} className="flex flex-wrap items-center gap-2">
                    <span className="w-24 shrink-0 text-sm">{label}</span>
                    <input
                      type="time"
                      className={`w-28 ${inputClass}`}
                      value={row.start1}
                      onChange={(e) => setDaySlot(day, "start1", e.target.value)}
                    />
                    <span className="text-sm text-[hsl(var(--pg-muted-foreground))]">—</span>
                    <input
                      type="time"
                      className={`w-28 ${inputClass}`}
                      value={row.end1}
                      onChange={(e) => setDaySlot(day, "end1", e.target.value)}
                    />
                    <input
                      type="time"
                      className={`w-28 ${inputClass}`}
                      value={row.start2}
                      onChange={(e) => setDaySlot(day, "start2", e.target.value)}
                    />
                    <span className="text-sm text-[hsl(var(--pg-muted-foreground))]">—</span>
                    <input
                      type="time"
                      className={`w-28 ${inputClass}`}
                      value={row.end2}
                      onChange={(e) => setDaySlot(day, "end2", e.target.value)}
                    />
                  </div>
                );
              })}
            </div>
            <div className="mt-3 flex items-center gap-3">
              <Button
                type="button"
                size={btnSize.inline}
                variant="outline"
                onClick={() => void saveShiftReminder()}
              >
                Salva orari
              </Button>
              <span className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                {location.shiftReminderSchedule.length === 0
                  ? "Attuale: disattivato"
                  : `Attuale: ${location.shiftReminderSchedule.length} fasce configurate`}
              </span>
            </div>
          </div>

          <div className="border-t border-[hsl(var(--pg-border))] pt-4">
            <label className="mb-2 flex items-center gap-2 text-sm font-medium">
              <input
                type="checkbox"
                checked={sendClosureEmail}
                onChange={(e) => setSendClosureEmail(e.target.checked)}
              />
              Invia email di riepilogo alla chiusura giornaliera
            </label>
            <p className="mb-2 text-xs text-[hsl(var(--pg-muted-foreground))]">
              Va al manager ({location.managerEmail}) e alle email soci indicate qui sotto.
            </p>
            <div className={formRowEndGap3Class}>
              <input
                className={`flex-1 ${inputClass}`}
                placeholder="Email soci (separate da virgola)"
                value={partnerEmails}
                onChange={(e) => setPartnerEmails(e.target.value)}
                disabled={!sendClosureEmail}
              />
              <Button
                type="button"
                size={btnSize.inline}
                variant="outline"
                onClick={() => void saveClosureEmail()}
              >
                Salva
              </Button>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t border-[hsl(var(--pg-border))] pt-4">
            <Button type="button" size={btnSize.inline} variant="outline" onClick={() => void regenerateToken()}>
              Rigenera token
            </Button>
            {location.hasToken && (
              <Button type="button" size={btnSize.inline} variant="ghost" onClick={() => void revokeToken()}>
                Revoca token
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Sconti rapidi in cassa</CardTitle>
        </CardHeader>
        <CardContent>
          <LocationDiscountPresetsPanel locationId={location.id} embedded />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Buoni pasto — importi rapidi</CardTitle>
        </CardHeader>
        <CardContent>
          <LocationMealVoucherPresetsPanel locationId={location.id} embedded />
        </CardContent>
      </Card>
    </div>
  );
}
