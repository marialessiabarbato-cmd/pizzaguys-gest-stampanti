import {
  ComandaWorkspace,
  PinModal,
  PinPad,
  PrintAlertModal,
  resolveLiveTable,
  useComanda,
} from "@pizzaguys/comanda";
import { useCallback, useEffect, useRef, useState } from "react";
import { GuestsModal, type GuestsConfirmPayload } from "./components/GuestsModal";
import { TableTransferModal } from "./components/TableTransferModal";
import { edgeApi } from "./lib/api";
import { clearDraft, loadDraft, saveDraft } from "./lib/offline";
import type { LiveTable, Operator, Screen, WorkspaceTab } from "./lib/types";
import { useEdgeWs } from "./lib/ws";
import { CounterOrdersScreen } from "./screens/CounterOrdersScreen";
import { MapScreen } from "./screens/MapScreen";

type PinModalMode = "unlock" | "guests-lock" | null;

/** Bozza del palmare salvata sul dispositivo: sopravvive a una perdita di rete. */
const deviceDraftStore = {
  load: async (tableId: string) => (await loadDraft(tableId))?.cart ?? null,
  save: saveDraft,
  clear: clearDraft,
};

export default function App() {
  const { connected, send, on } = useEdgeWs();
  const [online, setOnline] = useState(navigator.onLine);
  const [screen, setScreen] = useState<Screen>("pin");
  const pendingAfterLockRef = useRef<(() => void) | null>(null);
  const [operator, setOperator] = useState<Operator | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [tables, setTables] = useState<LiveTable[]>([]);
  const [activeTable, setActiveTable] = useState<LiveTable | null>(null);
  const activeTableRef = useRef(activeTable);
  activeTableRef.current = activeTable;
  const [message, setMessage] = useState("");
  const [printAlert, setPrintAlert] = useState<string[] | null>(null);
  const [lockPending, setLockPending] = useState<string | null>(null);
  const [pinModal, setPinModal] = useState<PinModalMode>(null);
  const [pinModalError, setPinModalError] = useState("");
  const [pendingUnlockTable, setPendingUnlockTable] = useState<LiveTable | null>(null);
  const [pendingGuestsTable, setPendingGuestsTable] = useState<LiveTable | null>(null);
  const [guestsModalLoading, setGuestsModalLoading] = useState(false);
  const [guestsModalError, setGuestsModalError] = useState("");
  const [pendingGuestsAction, setPendingGuestsAction] = useState<{
    table: LiveTable;
    payload: GuestsConfirmPayload;
    mode: "open" | "edit";
  } | null>(null);
  const [unlockOverridePin, setUnlockOverridePin] = useState<string | undefined>();
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [showEditGuestsModal, setShowEditGuestsModal] = useState(false);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);

  const isOffline = !connected || !online;
  /** null = stato non ancora noto: non blocchiamo nulla finché l'edge non risponde. */
  const [shiftActive, setShiftActive] = useState<boolean | null>(null);
  const shiftInactive = shiftActive === false;
  const hasLock =
    !!operator &&
    !!activeTable &&
    activeTable.lockedBy === operator.id &&
    (activeTable.status === "LOCKED" || activeTable.status === "OCCUPIED");

  /** Il palmare deve prendere il tavolo prima di modificare la bozza. */
  const ensureLock = (action: () => void) => {
    if (!operator || !activeTable) return;
    if (hasLock) {
      action();
      return;
    }
    pendingAfterLockRef.current = action;
    void requestLock(activeTable);
  };

  /** Preconto dal palmare: la cassa riceve la richiesta e lo stampa. */
  const requestPayment = () => {
    if (!operator || !activeTable || isOffline) return;
    send("REQUEST_PAYMENT", {
      tableId: activeTable.id,
      operatorId: operator.id,
      operatorName: `${operator.firstName} ${operator.lastName}`,
    });
    setMessage("Pagamento richiesto — cassa notificata");
    loadTables();
  };

  const comanda = useComanda({
    api: edgeApi,
    send,
    operator,
    table: activeTable,
    tables,
    isOffline,
    setMessage,
    ensureLock,
    draftStore: deviceDraftStore,
    onPrintWarnings: setPrintAlert,
    onPreconto: requestPayment,
    onSubmitted: async ({ remainingLines }) => {
      if (!activeTable || !operator) return;
      // Il lock resta all'operatore che ha appena inviato (lo gestisce l'Edge in submit).
      const live = await edgeApi<LiveTable[]>("/api/tables/live");
      setTables(live);
      const refreshed = live.find((t) => t.id === activeTable.id);
      if (refreshed) {
        setActiveTable({
          ...refreshed,
          status: remainingLines > 0 ? "LOCKED" : "OCCUPIED",
          lockedBy: remainingLines > 0 ? operator.id : refreshed.lockedBy,
        });
      }
    },
  });
  const {
    loadMenu,
    reload: loadDraftForTable,
    open: openComanda,
    reset: resetComanda,
    setOrderForTableId,
  } = comanda;

  const openWorkspace = async (
    table: LiveTable,
    tab: WorkspaceTab = "comanda",
    options?: { resetNavigation?: boolean },
  ) => {
    if (!operator) return;
    setActiveTable(table);
    await comanda.open(table.id, { tab, resetNavigation: options?.resetNavigation ?? false });
    setScreen("table");

    // Asporto/delivery: chi apre l'ordine lo prende in carico subito (come in cassa).
    // Evita il banner "Prendi" su un ordine già gestito dall'operatore.
    if (table.isVirtual) {
      setLockPending(table.id);
      try {
        const lock = await edgeApi<{
          lockedBy?: string;
          lockedByName?: string;
        }>(`/api/tables/${table.id}/lock`, {
          method: "POST",
          body: JSON.stringify({
            operatorId: operator.id,
            operatorName: `${operator.firstName} ${operator.lastName}`,
            guests: 1,
          }),
        });
        setActiveTable({
          ...table,
          status: "LOCKED",
          lockedBy: lock.lockedBy ?? operator.id,
          lockedByName:
            lock.lockedByName ?? `${operator.firstName} ${operator.lastName}`,
          guests: 1,
        });
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Impossibile prendere in carico l'ordine");
      } finally {
        setLockPending(null);
      }
    }
  };

  const loadTables = useCallback(() => {
    void edgeApi<LiveTable[]>("/api/tables/live").then(setTables);
    void edgeApi<Array<{ id: string; name: string }>>("/api/rooms").then(setRooms);
  }, []);

  const applyLockGranted = useCallback(
    async (table: LiveTable, guests?: number) => {
      if (!operator) return;
      setActiveTable({
        ...table,
        status: "LOCKED",
        lockedBy: operator.id,
        guests: guests ?? table.guests,
      });
      setOrderForTableId(table.id);
      const run = pendingAfterLockRef.current;
      pendingAfterLockRef.current = null;
      if (run) {
        await loadDraftForTable(table.id);
        run();
      } else {
        await openComanda(table.id, { tab: "menu", resetNavigation: true });
        setScreen("table");
      }
      setLockPending(null);
      setPendingUnlockTable(null);
      setPendingGuestsTable(null);
      setUnlockOverridePin(undefined);
    },
    [operator, loadDraftForTable, openComanda, setOrderForTableId],
  );

  const requestLock = useCallback(
    async (table: LiveTable, overridePin?: string, guests?: number) => {
      if (!operator) return;
      setLockPending(table.id);
      try {
        const lock = await edgeApi<{
          guests?: number;
          lockedBy?: string;
          lockedByName?: string;
          tableCapacity?: number;
          linkedTableIds?: string[];
        }>(`/api/tables/${table.id}/lock`, {
          method: "POST",
          body: JSON.stringify({
            operatorId: operator.id,
            operatorName: `${operator.firstName} ${operator.lastName}`,
            overridePin,
            guests: guests ?? table.guests ?? 1,
          }),
        });
        await applyLockGranted(
          {
            ...table,
            lockedBy: lock.lockedBy ?? operator.id,
            lockedByName: lock.lockedByName ?? `${operator.firstName} ${operator.lastName}`,
            tableCapacity: lock.tableCapacity ?? table.tableCapacity,
            linkedTableIds: lock.linkedTableIds ?? table.linkedTableIds,
          },
          lock.guests ?? guests,
        );
        loadTables();
      } catch (err) {
        setMessage(err instanceof Error ? err.message : "Lock negato");
        setLockPending(null);
      }
    },
    [operator, applyLockGranted, loadTables],
  );

  useEffect(() => {
    const onOnline = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  useEffect(() => {
    if (screen === "map" && operator) {
      loadTables();
      void loadMenu();
    }
  }, [screen, operator, loadTables, loadMenu]);

  useEffect(() => {
    if (pendingGuestsTable || showEditGuestsModal) loadTables();
  }, [pendingGuestsTable, showEditGuestsModal, loadTables]);

  // Stato turno: letto al login e a ogni riconnessione, poi aggiornato dal broadcast.
  useEffect(() => {
    if (!operator || !connected) return;
    edgeApi<{ shift?: { active: boolean } }>("/api/status")
      .then((s) => setShiftActive(s.shift?.active ?? null))
      .catch(() => {});
  }, [operator, connected]);

  useEffect(() => {
    const unsub = on("SHIFT_STATUS", (payload) => {
      setShiftActive((payload as { active: boolean }).active);
    });
    return () => {
      unsub();
    };
  }, [on]);

  useEffect(() => {
    const unsub1 = on("TABLE_LOCKED_BROADCAST", () => loadTables());
    const unsub2 = on("TABLE_STATUS_UPDATE", () => loadTables());
    const unsub3 = on("LOCK_GRANTED", (payload) => {
      const p = payload as { tableId: string; guests?: number };
      const table =
        tables.find((t) => t.id === p.tableId) ??
        (activeTableRef.current?.id === p.tableId ? activeTableRef.current : null);
      if (table && operator) {
        void applyLockGranted(table, p.guests ?? table.guests);
      }
    });
    const unsub4 = on("LOCK_DENIED", (payload) => {
      const p = payload as { reason?: string };
      setMessage(p.reason ?? "Lock negato");
      setLockPending(null);
    });
    const unsub5 = on("PAYMENT_COMPLETE", (payload) => {
      const p = payload as { tableId: string };
      if (activeTable?.id === p.tableId) {
        setMessage("Pagamento completato dalla cassa");
        resetComanda();
        setScreen("map");
        setActiveTable(null);
        loadTables();
      } else {
        loadTables();
      }
    });
    const unsub6 = on("TABLE_ACCOUNT_MOVED", (payload) => {
      const p = payload as { sourceTableIds: string[]; targetTableId: string };
      loadTables();
      if (activeTable && p.sourceTableIds.includes(activeTable.id)) {
        void loadDraftForTable(activeTable.id).then((data) => {
          if (data.cart.length === 0 && data.submitted.length === 0) {
            setMessage("Conto spostato su altro tavolo");
            setScreen("map");
            setActiveTable(null);
            resetComanda();
          }
        });
      } else if (activeTable?.id === p.targetTableId) {
        void loadDraftForTable(activeTable.id);
      }
    });
    return () => {
      unsub1();
      unsub2();
      unsub3();
      unsub4();
      unsub5();
      unsub6();
    };
  }, [on, loadTables, tables, operator, loadDraftForTable, applyLockGranted, resetComanda, activeTable]);

  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (screen === "table" && comanda.cart.length > 0) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [screen, comanda.cart]);

  const verifyPin = async (value: string) => {
    setPinError("");
    try {
      const op = await edgeApi<Operator>("/api/staff/verify-pin", {
        method: "POST",
        body: JSON.stringify({ pin: value }),
      });
      setOperator(op);
      setPin("");
      setScreen("map");
      loadTables();
      void loadMenu();
    } catch {
      setPinError("PIN errato");
      setPin("");
    }
  };

  const openGuestsModal = (table: LiveTable) => {
    setGuestsModalError("");
    setPendingGuestsTable(table);
  };

  const openTableWithGuests = async (
    table: LiveTable,
    payload: GuestsConfirmPayload,
    overridePin?: string,
  ) => {
    if (!operator) return;
    setGuestsModalLoading(true);
    setGuestsModalError("");
    try {
      let target = table;
      if (payload.mergeTableIds.length > 0) {
        await edgeApi("/api/tables/merge", {
          method: "POST",
          body: JSON.stringify({
            operatorId: operator.id,
            operatorName: `${operator.firstName} ${operator.lastName}`,
            overridePin,
            sourceTableIds: payload.mergeTableIds,
            targetTableId: table.id,
            guestsByTable: payload.guestsByTable,
          }),
        });
        const live = await edgeApi<LiveTable[]>("/api/tables/live");
        if (Array.isArray(live)) {
          target = live.find((t) => t.id === table.id) ?? target;
          setTables(live);
        } else {
          loadTables();
        }
      }
      setUnlockOverridePin(undefined);
      const hostGuests = payload.guestsByTable[table.id] ?? payload.guests;
      await requestLock(target, overridePin, hostGuests);
      if (payload.mergeTableIds.length > 0) {
        setMessage("");
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore apertura tavolo";
      if (msg.includes("bloccato") && !overridePin) {
        setPendingGuestsAction({ table, payload, mode: "open" });
        setPinModal("guests-lock");
      } else {
        setGuestsModalError(msg);
      }
    } finally {
      setGuestsModalLoading(false);
    }
  };

  const confirmGuests = (payload: GuestsConfirmPayload) => {
    if (!pendingGuestsTable) return;
    void openTableWithGuests(pendingGuestsTable, payload, unlockOverridePin);
  };

  const saveTableGuests = async (
    payload: GuestsConfirmPayload,
    overridePin?: string,
  ) => {
    if (!operator || !activeTable) return;
    setGuestsModalLoading(true);
    setGuestsModalError("");
    try {
      if (payload.mergeTableIds.length > 0) {
        await edgeApi("/api/tables/merge", {
          method: "POST",
          body: JSON.stringify({
            operatorId: operator.id,
            operatorName: `${operator.firstName} ${operator.lastName}`,
            overridePin,
            sourceTableIds: payload.mergeTableIds,
            targetTableId: activeTable.id,
            guestsByTable: payload.guestsByTable,
          }),
        });
        const live = await edgeApi<LiveTable[]>("/api/tables/live");
        if (Array.isArray(live)) {
          setTables(live);
          const updated = live.find((t) => t.id === activeTable.id);
          if (updated) {
            setActiveTable(updated);
          }
        } else {
          loadTables();
        }
      }
      const row = await edgeApi<{
        guests: number;
        guestTotal?: number;
        tableCapacity: number;
        guestsByTable?: Record<string, number>;
      }>(`/api/tables/${activeTable.id}/guests`, {
        method: "PATCH",
        body: JSON.stringify({
          guestsByTable: payload.guestsByTable,
          guests: payload.guestsByTable[activeTable.id] ?? payload.guests,
          operatorId: operator.id,
        }),
      });
      const parts = Object.entries(payload.guestsByTable)
        .map(([, g]) => g)
        .filter((g) => g > 0);
      const total =
        row.guestTotal ??
        parts.reduce((a, b) => a + b, 0) ??
        payload.guests;
      const live = await edgeApi<LiveTable[]>("/api/tables/live");
      if (Array.isArray(live)) {
        setTables(live);
        const updated = live.find((t) => t.id === activeTable.id);
        if (updated) setActiveTable(updated);
      } else {
        setActiveTable({
          ...activeTable,
          guests: row.guestsByTable?.[activeTable.id] ?? row.guests,
          tableCapacity: row.tableCapacity,
        });
        loadTables();
      }
      setShowEditGuestsModal(false);
      setGuestsModalError("");
      setMessage(
        parts.length > 1
          ? `Coperti aggiornati: ${parts.join("+")} · tot. ${total}`
          : `Coperti aggiornati: ${total}`,
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Errore aggiornamento coperti";
      if (msg.includes("bloccato") && !overridePin) {
        setPendingGuestsAction({ table: activeTable, payload, mode: "edit" });
        setPinModal("guests-lock");
      } else {
        setGuestsModalError(msg);
      }
    } finally {
      setGuestsModalLoading(false);
    }
  };

  const openEditGuests = () => {
    if (!activeTable) return;
    setGuestsModalError("");
    setShowEditGuestsModal(true);
  };

  const handleGuestsLockPin = (pin: string) => {
    if (!pendingGuestsAction) return;
    setPinModal(null);
    setPinModalError("");
    const action = pendingGuestsAction;
    setPendingGuestsAction(null);
    if (action.mode === "open") {
      void openTableWithGuests(action.table, action.payload, pin);
    } else {
      void saveTableGuests(action.payload, pin);
    }
  };

  const enterTable = (table: LiveTable, overridePin?: string) => {
    if (!table.isVirtual && table.status === "FREE") {
      if (overridePin) setUnlockOverridePin(overridePin);
      openGuestsModal(table);
      return;
    }
    requestLock(table, overridePin);
  };

  const reenterTable = async (table: LiveTable) => {
    const data = await loadDraftForTable(table.id);
    const tab: WorkspaceTab =
      data.cart.length > 0 ? "comanda" : data.submitted.length > 0 ? "comanda" : "menu";
    await openWorkspace({ ...table, status: "LOCKED" }, tab);
  };

  const selectTable = (table: LiveTable) => {
    if (!operator) return;
    setMessage("");
    if (table.mergedIntoTableId) {
      const host = tables.find((t) => t.id === table.mergedIntoTableId);
      if (host) {
        selectTable(host);
        return;
      }
    }
    if (table.status === "LOCKED" && table.lockedBy === operator.id) {
      void reenterTable(table);
      return;
    }
    if (table.status === "LOCKED" && table.lockedBy !== operator.id) {
      setPendingUnlockTable(table);
      setPinModal("unlock");
      return;
    }
    if (
      !table.isVirtual &&
      (table.status === "OCCUPIED" ||
        table.status === "BILL_REQUESTED" ||
        table.status === "SPLIT_IN_PROGRESS")
    ) {
      if (!table.lockedBy && operator) {
        pendingAfterLockRef.current = () => {
          void openWorkspace(table, "comanda");
        };
        void requestLock(table);
        return;
      }
      void openWorkspace(table, "comanda");
      return;
    }
    if (table.isVirtual) {
      requestLock(table, undefined, 1);
      return;
    }
    enterTable(table);
  };

  const handleUnlockPin = (value: string) => {
    if (!operator || !pendingUnlockTable) return;
    setPinModalError("");
    setPinModal(null);
    const table = pendingUnlockTable;
    setPendingUnlockTable(null);
    enterTable(table, value);
  };

  const releaseLockIfHeld = () => {
    // Dopo Spedisci il tavolo è OCCUPIED ma resta assegnato a chi ha inviato: va rilasciato comunque.
    if (operator && activeTable?.lockedBy === operator.id) {
      send("RELEASE_TABLE_LOCK", { tableId: activeTable.id, operatorId: operator.id });
    }
  };

  /** Uscita dal tavolo (già confermata dalla comanda se c'erano piatti non spediti). */
  const leaveTable = () => {
    if (comanda.cart.length > 0) void comanda.persistDraft();
    releaseLockIfHeld();
    setScreen("map");
    setActiveTable(null);
    comanda.setSelectedLineId(null);
    comanda.setSelectedSubmittedId(null);
  };

  const logout = () => {
    setOperator(null);
    setScreen("pin");
    setActiveTable(null);
    resetComanda();
  };

  const modals = (
    <>
      {printAlert && <PrintAlertModal messages={printAlert} onClose={() => setPrintAlert(null)} />}
      {pinModal === "unlock" && (
        <PinModal
          title="PIN manager per sblocco tavolo"
          onComplete={handleUnlockPin}
          onCancel={() => {
            setPinModal(null);
            setPendingUnlockTable(null);
          }}
          error={pinModalError}
        />
      )}
      {pinModal === "guests-lock" && (
        <PinModal
          title="PIN manager — tavolo bloccato"
          onComplete={handleGuestsLockPin}
          onCancel={() => {
            setPinModal(null);
            setPendingGuestsAction(null);
          }}
          error={pinModalError}
        />
      )}
    </>
  );

  if (screen === "pin") {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <h1 className="mb-8 text-2xl font-bold">Pizza Guys — Sala</h1>
        <PinPad pin={pin} onChange={setPin} onComplete={(v) => void verifyPin(v)} error={pinError} />
        <p className={`mt-6 text-xs ${connected ? "text-green-600" : "text-yellow-600"}`}>
          {connected ? "Connesso all'edge" : "Connessione edge..."}
        </p>
      </main>
    );
  }

  if (screen === "table" && activeTable && operator) {
    return (
      <>
        <ComandaWorkspace
          comanda={comanda}
          layout="handheld"
          table={activeTable}
          tables={tables}
          operator={operator}
          isOffline={isOffline}
          shiftInactive={shiftInactive}
          hasLock={hasLock}
          message={message}
          backLabel="← Tavoli"
          onLeave={leaveTable}
          onAcquireLock={() => ensureLock(() => setMessage("Tavolo acquisito"))}
          onEditGuests={openEditGuests}
          onOpenTransfer={() => setShowTransferModal(true)}
        />
        {showEditGuestsModal && activeTable && (() => {
          const primary = resolveLiveTable(activeTable, tables);
          return (
          <GuestsModal
            key={`${primary.id}-${(primary.linkedTableIds ?? []).join(",")}`}
            primaryTable={primary}
            tables={tables}
            initialGuests={primary.guests != null && primary.guests > 0 ? primary.guests : 1}
            confirmLabel="Salva"
            loading={guestsModalLoading}
            error={guestsModalError}
            onConfirm={(payload) => void saveTableGuests(payload)}
            onCancel={() => {
              setShowEditGuestsModal(false);
              setGuestsModalError("");
            }}
          />
          );
        })()}
        {showTransferModal && activeTable && operator && (
          <TableTransferModal
            sourceTable={activeTable}
            operator={operator}
            cart={comanda.cart}
            submittedLines={comanda.submittedLines}
            tables={tables}
            rooms={rooms}
            isOffline={isOffline}
            onRefresh={loadTables}
            onClose={() => setShowTransferModal(false)}
            onSuccess={(msg) => {
              setMessage(msg);
              setShowTransferModal(false);
              void loadDraftForTable(activeTable.id).then((data) => {
                if (data.cart.length === 0 && data.submitted.length === 0) {
                  setScreen("map");
                  setActiveTable(null);
                }
              });
              loadTables();
            }}
          />
        )}
        {modals}
      </>
    );
  }

  if (screen === "map" && operator) {
    return (
      <>
        <MapScreen
          operator={operator}
          tables={tables}
          rooms={rooms}
          message={message}
          isOffline={isOffline}
          shiftInactive={shiftInactive}
          lockPending={lockPending}
          logoutConfirm={logoutConfirm}
          pendingGuestsTable={pendingGuestsTable}
          guestsModalLoading={guestsModalLoading}
          guestsModalError={guestsModalError}
          onSelectTable={selectTable}
          onOpenCounter={() => setScreen("counter")}
          onLogout={() => setLogoutConfirm(true)}
          onConfirmLogout={() => {
            setLogoutConfirm(false);
            logout();
          }}
          onCancelLogout={() => setLogoutConfirm(false)}
          onConfirmGuests={confirmGuests}
          onCancelGuests={() => {
            setPendingGuestsTable(null);
            setGuestsModalError("");
            setUnlockOverridePin(undefined);
          }}
        />
        {modals}
      </>
    );
  }

  if (screen === "counter" && operator) {
    return (
      <>
        <CounterOrdersScreen
          operator={operator}
          isOffline={isOffline}
          shiftInactive={shiftInactive}
          message={message}
          onBack={() => setScreen("map")}
          onMessage={setMessage}
          onOpenOrder={(table) => void openWorkspace(table, "comanda", { resetNavigation: true })}
        />
        {modals}
      </>
    );
  }

  return null;
}
