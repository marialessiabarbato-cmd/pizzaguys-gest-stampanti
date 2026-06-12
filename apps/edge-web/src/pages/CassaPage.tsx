import type { PaymentMethod, TableStatus } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnalyticSplitPanel } from "../components/AnalyticSplitPanel";
import { PaymentModal } from "../components/PaymentModal";
import { parsePaymentAmount } from "../components/PaymentPad";
import { PinModal } from "../components/PinModal";
import { PinPad } from "../components/PinPad";
import { ClosureWizard } from "../components/ClosureWizard";
import { ShiftCloseModal } from "../components/ShiftCloseModal";
import { edgeApi } from "../lib/api";
import { useEdgeWs } from "../lib/ws";

const STATUS_COLORS: Record<TableStatus, string> = {
  FREE: "bg-green-500",
  OCCUPIED: "bg-blue-500",
  LOCKED: "bg-red-500",
  BILL_REQUESTED: "bg-yellow-500 animate-pulse",
  SPLIT_IN_PROGRESS: "bg-purple-500",
};

type ChannelFilter = "ALL" | "SALA" | "ASPORTO" | "DELIVERY";

interface LiveTable {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  status: TableStatus;
  lockedBy?: string;
  lockedByName?: string;
  isVirtual: boolean;
  virtualType: string | null;
}

interface Operator {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

interface BillLine {
  id: string;
  name: string;
  quantity: number;
  unitPrice: number;
  lineTotal: number;
  discountPercent?: number;
}

interface RomanSplitInfo {
  shares: number;
  shareAmounts: number[];
  paidShares: number;
  remainingShares: number;
  nextShareAmount: number | null;
}

interface AnalyticSplitInfo {
  checks: Array<{ id: string; label: string; lineIds: string[]; total: number; paid: boolean }>;
  unassignedLineIds: string[];
  allAssigned: boolean;
  allPaid: boolean;
}

interface TableBill {
  tableId: string;
  tableLabel: string;
  lines: BillLine[];
  total: number;
  isVirtual: boolean;
  virtualType: string | null;
  romanSplit?: RomanSplitInfo;
  analyticSplit?: AnalyticSplitInfo;
}

interface Shift {
  id: string;
  staffId: string;
  startedAt: string;
}

interface PaymentRequest {
  requestId: string;
  tableId: string;
  tableLabel: string;
  total: number;
  operatorName: string;
}

export function CassaPage({
  locationName,
  onAdmin,
}: {
  locationName?: string;
  onAdmin: () => void;
}) {
  const { connected, send, on } = useEdgeWs();
  const [operator, setOperator] = useState<Operator | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [tables, setTables] = useState<LiveTable[]>([]);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("ALL");
  const [selectedTable, setSelectedTable] = useState<LiveTable | null>(null);
  const [bill, setBill] = useState<TableBill | null>(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [lockPending, setLockPending] = useState<string | null>(null);
  const [pendingUnlockTable, setPendingUnlockTable] = useState<LiveTable | null>(null);
  const [pinModalError, setPinModalError] = useState("");
  const [showPayment, setShowPayment] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>("CASH");
  const [cashAmount, setCashAmount] = useState("");
  const [paymentRequestId, setPaymentRequestId] = useState<string | undefined>();
  const [paymentResult, setPaymentResult] = useState<{
    change?: number;
    receiptId?: string;
    romanSplitComplete?: boolean;
    paidShares?: number;
    totalShares?: number;
  } | null>(null);
  const [pendingPayments, setPendingPayments] = useState<PaymentRequest[]>([]);
  const [romanShares, setRomanShares] = useState("2");
  const [discountLine, setDiscountLine] = useState<BillLine | null>(null);
  const [discountPercent, setDiscountPercent] = useState(10);
  const [maxDiscount, setMaxDiscount] = useState(20);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [showShiftClose, setShowShiftClose] = useState(false);
  const [showClosureWizard, setShowClosureWizard] = useState(false);
  const [analyticCheckId, setAnalyticCheckId] = useState<string | undefined>();
  const tablesRef = useRef(tables);
  const pendingUnlockTableRef = useRef(pendingUnlockTable);
  tablesRef.current = tables;
  pendingUnlockTableRef.current = pendingUnlockTable;

  const loadTables = useCallback(() => {
    void edgeApi<LiveTable[]>("/api/tables/live").then(setTables);
  }, []);

  const loadPendingPayments = useCallback(() => {
    void edgeApi<
      Array<{
        id: string;
        tableId: string;
        tableLabel: string;
        total: number;
        operatorName: string;
      }>
    >("/api/pos/payment-requests").then((rows) =>
      setPendingPayments(
        rows.map((r) => ({
          requestId: r.id,
          tableId: r.tableId,
          tableLabel: r.tableLabel,
          total: r.total,
          operatorName: r.operatorName,
        })),
      ),
    );
  }, []);

  const loadBill = useCallback(async (tableId: string) => {
    try {
      const data = await edgeApi<TableBill>(`/api/pos/tables/${tableId}/bill`);
      setBill(data);
    } catch {
      setBill(null);
    }
  }, []);

  const loadActiveShift = useCallback(async (staffId: string) => {
    const shifts = await edgeApi<Shift[]>("/api/shifts");
    setActiveShift(shifts.find((s) => s.staffId === staffId) ?? null);
  }, []);

  const startShift = async () => {
    if (!operator) return;
    const row = await edgeApi<Shift>("/api/shifts/start", {
      method: "POST",
      body: JSON.stringify({ staffId: operator.id }),
    });
    setActiveShift(row);
    setMessage("Turno avviato");
  };

  useEffect(() => {
    if (!operator) return;
    loadTables();
    loadPendingPayments();
    void loadActiveShift(operator.id);
    void edgeApi<{ snapshot?: { settings?: { maxDiscountPercent?: number } } }>("/api/menu").then(
      (m) => setMaxDiscount(m.snapshot?.settings?.maxDiscountPercent ?? 20),
    );
  }, [operator, loadTables, loadPendingPayments, loadActiveShift]);

  useEffect(() => {
    if (!operator) return;
    loadTables();
    const offLocked = on("TABLE_LOCKED_BROADCAST", () => loadTables());
    const offStatus = on("TABLE_STATUS_UPDATE", () => loadTables());
    const offPending = on("PAYMENT_PENDING", (payload) => {
      const p = payload as {
        requestId: string;
        tableId: string;
        tableLabel: string;
        total: number;
        operatorName: string;
      };
      setPendingPayments((prev) => {
        if (prev.some((x) => x.requestId === p.requestId)) return prev;
        return [
          ...prev,
          {
            requestId: p.requestId,
            tableId: p.tableId,
            tableLabel: p.tableLabel,
            total: p.total,
            operatorName: p.operatorName,
          },
        ];
      });
      loadTables();
    });
    const offComplete = on("PAYMENT_COMPLETE", () => {
      loadPendingPayments();
      loadTables();
    });
    const offGranted = on("LOCK_GRANTED", (payload) => {
      const p = payload as { tableId: string };
      setLockPending(null);
      setPinModalError("");
      const table =
        tablesRef.current.find((t) => t.id === p.tableId) ?? pendingUnlockTableRef.current;
      if (table) {
        setSelectedTable(table);
        void loadBill(table.id);
      }
      setPendingUnlockTable(null);
    });
    const offDenied = on("LOCK_DENIED", (payload) => {
      const p = payload as { reason?: string };
      setLockPending(null);
      setPinModalError(p.reason ?? "Sblocco negato");
    });
    return () => {
      offLocked();
      offStatus();
      offPending();
      offComplete();
      offGranted();
      offDenied();
    };
  }, [operator, on, loadTables, loadPendingPayments, loadBill]);

  useEffect(() => {
    if (selectedTable) void loadBill(selectedTable.id);
  }, [selectedTable, loadBill]);

  const verifyPin = async (value: string) => {
    setPinError("");
    try {
      const op = await edgeApi<Operator>("/api/staff/verify-pin", {
        method: "POST",
        body: JSON.stringify({ pin: value }),
      });
      setOperator(op);
      setPin("");
    } catch {
      setPinError("PIN errato");
      setPin("");
    }
  };

  const requestLock = (table: LiveTable, overridePin?: string) => {
    if (!operator) return;
    setLockPending(table.id);
    send("REQUEST_TABLE_LOCK", {
      tableId: table.id,
      operatorId: operator.id,
      operatorName: `${operator.firstName} ${operator.lastName}`,
      overridePin,
    });
  };

  const openTable = (tableId: string, requestId?: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (table) {
      setSelectedTable(table);
      setPaymentRequestId(requestId);
      void loadBill(tableId);
    }
  };

  const selectTable = (table: LiveTable) => {
    if (table.status === "LOCKED" && table.lockedBy !== operator?.id) {
      setPendingUnlockTable(table);
      setPinModalError("");
      return;
    }
    setPaymentRequestId(undefined);
    setSelectedTable(table);
    setMessage("");
    setPaymentResult(null);
    void loadBill(table.id);
  };

  const handleUnlockPin = (value: string) => {
    if (!operator || !pendingUnlockTable) return;
    setPinModalError("");
    requestLock(pendingUnlockTable, value);
  };

  const handlePrebill = async () => {
    if (!selectedTable || !bill) return;
    setLoading(true);
    setMessage("");
    try {
      await edgeApi(`/api/pos/tables/${selectedTable.id}/prebill`, { method: "POST" });
      setMessage("Preconto stampato");
      loadTables();
      void loadBill(selectedTable.id);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore preconto");
    } finally {
      setLoading(false);
    }
  };

  const handleStartRomanSplit = async () => {
    if (!selectedTable || !bill) return;
    const shares = Number.parseInt(romanShares, 10);
    if (shares < 2) {
      setMessage("Minimo 2 quote");
      return;
    }
    setLoading(true);
    setMessage("");
    try {
      const result = await edgeApi<{ bill: TableBill }>(
        `/api/pos/tables/${selectedTable.id}/split/roman`,
        { method: "POST", body: JSON.stringify({ shares }) },
      );
      setBill(result.bill);
      loadTables();
      setMessage(`Split romano: ${shares} quote`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore split");
    } finally {
      setLoading(false);
    }
  };

  const handleDiscountPin = async (pin: string) => {
    if (!selectedTable || !discountLine) return;
    setPinModalError("");
    setLoading(true);
    try {
      const result = await edgeApi<{ bill: TableBill }>(
        `/api/pos/tables/${selectedTable.id}/discount`,
        {
          method: "POST",
          body: JSON.stringify({
            lineId: discountLine.id,
            discountPercent,
            managerPin: pin,
          }),
        },
      );
      setBill(result.bill);
      setDiscountLine(null);
      setMessage(`Sconto ${discountPercent}% applicato`);
    } catch (err) {
      setPinModalError(err instanceof Error ? err.message : "PIN non valido");
    } finally {
      setLoading(false);
    }
  };

  const analyticCheck = bill?.analyticSplit?.checks.find((c) => c.id === analyticCheckId);
  const payAmount =
    analyticCheck?.total ?? bill?.romanSplit?.nextShareAmount ?? bill?.total ?? 0;
  const isRomanPay = Boolean(bill?.romanSplit && bill.romanSplit.remainingShares > 0);
  const isAnalyticPay = Boolean(analyticCheckId && analyticCheck && !analyticCheck.paid);
  const hasAnalyticSplit = Boolean(bill?.analyticSplit);

  const openPayment = (requestId?: string, checkId?: string) => {
    setPaymentMethod("CASH");
    setCashAmount("");
    setPaymentRequestId(requestId);
    setAnalyticCheckId(checkId);
    setShowPayment(true);
  };

  const handlePay = async () => {
    if (!selectedTable || !bill || !operator) return;
    const amount = payAmount;
    if (paymentMethod === "CASH") {
      const received = parsePaymentAmount(cashAmount);
      if (received < amount) {
        setMessage("Importo insufficiente");
        return;
      }
    }
    setLoading(true);
    setMessage("");
    try {
      const result = await edgeApi<{
        change?: number;
        receipt: { id: string };
        status: string;
        romanSplitComplete?: boolean;
        paidShares?: number;
        totalShares?: number;
        bill: TableBill | null;
      }>(`/api/pos/tables/${selectedTable.id}/pay`, {
        method: "POST",
        body: JSON.stringify({
          paymentMethod,
          amountReceived:
            paymentMethod === "CASH" ? parsePaymentAmount(cashAmount) : undefined,
          operatorId: operator.id,
          operatorName: `${operator.firstName} ${operator.lastName}`,
          paymentRequestId,
          shiftId: activeShift?.id,
          splitMode: isAnalyticPay ? "ANALYTIC" : isRomanPay ? "ROMAN" : "FULL",
          checkId: analyticCheckId,
        }),
      });
      setPaymentResult({
        change: result.change,
        receiptId: result.receipt.id,
        romanSplitComplete: result.romanSplitComplete,
        paidShares: result.paidShares,
        totalShares: result.totalShares,
      });
      setShowPayment(false);
      setCashAmount("");
      setPaymentRequestId(undefined);
      setAnalyticCheckId(undefined);
      setPendingPayments((prev) => prev.filter((p) => p.requestId !== paymentRequestId));
      loadPendingPayments();

      if (result.status === "FREE") {
        setMessage(`Pagamento completato — scontrino ${result.receipt.id}`);
        setSelectedTable(null);
        setBill(null);
      } else {
        setBill(result.bill);
        setMessage(
          `Quota ${result.paidShares}/${result.totalShares} pagata — scontrino ${result.receipt.id}`,
        );
      }
      loadTables();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore pagamento");
    } finally {
      setLoading(false);
    }
  };

  const filteredTables = tables.filter((t) => {
    if (channelFilter === "ALL") return true;
    if (channelFilter === "SALA") return !t.isVirtual;
    if (channelFilter === "ASPORTO") return t.virtualType === "ASPORTO";
    if (channelFilter === "DELIVERY") return t.virtualType === "DELIVERY";
    return true;
  });

  if (!operator) {
    return (
      <main className="flex min-h-screen flex-col items-center justify-center p-6">
        <div className="w-full max-w-sm space-y-6">
          <div className="text-center">
            <h1 className="text-2xl font-bold">Cassa</h1>
            {locationName && (
              <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{locationName}</p>
            )}
          </div>
          <PinPad pin={pin} onChange={setPin} onComplete={verifyPin} error={pinError} />
        </div>
      </main>
    );
  }

  return (
    <div className="flex h-screen flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-[hsl(var(--pg-border))] px-4 py-3">
        <div>
          <h1 className="text-xl font-bold">Cassa</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            {operator.firstName} {operator.lastName}
            {locationName ? ` · ${locationName}` : ""}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span
            className={`rounded-full px-2 py-1 text-xs ${connected ? "bg-green-500/20 text-green-600" : "bg-red-500/20 text-red-600"}`}
          >
            {connected ? "Online" : "Offline"}
          </span>
          {(operator.role === "USER_ADMIN" || operator.role === "CASHIER") && (
            <Button
              variant="outline"
              className="h-9 px-3 text-sm"
              onClick={() => setShowClosureWizard(true)}
            >
              Chiusura giornata
            </Button>
          )}
          {activeShift ? (
            <Button
              variant="outline"
              className="h-9 px-3 text-sm"
              onClick={() => setShowShiftClose(true)}
            >
              Chiusura turno
            </Button>
          ) : (
            <Button variant="outline" className="h-9 px-3 text-sm" onClick={() => void startShift()}>
              Avvia turno
            </Button>
          )}
          <Button variant="outline" className="h-9 px-3 text-sm" onClick={onAdmin}>
            Admin
          </Button>
          <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setOperator(null)}>
            Esci
          </Button>
        </div>
      </header>

      {pendingPayments.length > 0 && (
        <div className="shrink-0 space-y-1 border-b border-yellow-500/30 bg-yellow-500/10 px-4 py-2">
          {pendingPayments.map((p) => (
            <div key={p.requestId} className="flex items-center justify-between gap-2 text-sm">
              <span>
                Pagamento richiesto: <strong>{p.tableLabel}</strong> € {p.total.toFixed(2)} —{" "}
                {p.operatorName}
              </span>
              <Button
                className="h-9 shrink-0"
                onClick={() => {
                  openTable(p.tableId, p.requestId);
                  openPayment(p.requestId);
                }}
              >
                Incassa
              </Button>
            </div>
          ))}
        </div>
      )}

      {message && (
        <p className="shrink-0 bg-[hsl(var(--pg-muted))] px-4 py-2 text-sm">{message}</p>
      )}

      <div className="flex min-h-0 flex-1">
        <section className="flex min-w-0 flex-1 flex-col p-4">
          <div className="mb-3 flex flex-wrap gap-2">
            {(
              [
                ["ALL", "Tutti"],
                ["SALA", "Sala"],
                ["ASPORTO", "Asporto"],
                ["DELIVERY", "Delivery"],
              ] as const
            ).map(([id, label]) => (
              <Button
                key={id}
                className="h-9 px-3 text-sm"
                variant={channelFilter === id ? "default" : "outline"}
                onClick={() => setChannelFilter(id)}
              >
                {label}
              </Button>
            ))}
          </div>

          <div className="relative min-h-0 flex-1 rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20">
            {filteredTables.map((t) => (
              <button
                key={t.id}
                type="button"
                disabled={lockPending === t.id}
                onClick={() => selectTable(t)}
                style={{
                  position: "absolute",
                  left: t.x,
                  top: t.y,
                  width: t.width,
                  height: t.height,
                }}
                className={`flex min-h-[48px] min-w-[48px] flex-col items-center justify-center rounded-lg text-white shadow-md transition active:scale-95 ${STATUS_COLORS[t.status] ?? "bg-gray-400"} ${selectedTable?.id === t.id ? "ring-4 ring-white" : ""} ${lockPending === t.id ? "opacity-50" : ""}`}
              >
                <span className="text-lg font-bold">{t.label}</span>
                {t.lockedByName && t.status === "LOCKED" && (
                  <span className="text-[10px]">{t.lockedByName}</span>
                )}
              </button>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <span key={status} className="flex items-center gap-1">
                <span className={`h-3 w-3 rounded ${color.split(" ")[0]}`} />
                {status}
              </span>
            ))}
          </div>
        </section>

        <aside className="flex w-96 shrink-0 flex-col border-l border-[hsl(var(--pg-border))]">
          {selectedTable && bill ? (
            <>
              <div className="border-b border-[hsl(var(--pg-border))] p-4">
                <h2 className="text-lg font-bold">Tavolo {bill.tableLabel}</h2>
                <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                  {selectedTable.status}
                  {bill.romanSplit && (
                    <span>
                      {" "}
                      · Split {bill.romanSplit.paidShares}/{bill.romanSplit.shares}
                    </span>
                  )}
                </p>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {bill.lines.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessuna voce in conto</p>
                ) : hasAnalyticSplit ? (
                  <AnalyticSplitPanel
                    bill={bill}
                    onUpdated={() => selectedTable && void loadBill(selectedTable.id)}
                    onPayCheck={(checkId) => openPayment(undefined, checkId)}
                  />
                ) : (
                  <>
                    <ul className="space-y-2">
                      {bill.lines.map((line) => (
                        <li key={line.id}>
                          <button
                            type="button"
                            className="flex w-full justify-between gap-2 border-b border-[hsl(var(--pg-border))]/50 pb-2 text-left text-sm active:bg-[hsl(var(--pg-muted))]"
                            onClick={() => {
                              setDiscountPercent(maxDiscount);
                              setDiscountLine(line);
                            }}
                          >
                            <span>
                              {line.quantity}× {line.name}
                              {line.discountPercent ? ` (−${line.discountPercent}%)` : ""}
                            </span>
                            <span className="shrink-0 font-medium tabular-nums">
                              € {line.lineTotal.toFixed(2)}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                    <p className="mt-2 text-xs text-[hsl(var(--pg-muted-foreground))]">
                      Tap riga per sconto (PIN manager)
                    </p>
                  </>
                )}
              </div>

              <div className="space-y-3 border-t border-[hsl(var(--pg-border))] p-4">
                <div className="flex justify-between text-xl font-bold">
                  <span>Totale</span>
                  <span className="tabular-nums">€ {bill.total.toFixed(2)}</span>
                </div>

                {bill.romanSplit && bill.romanSplit.nextShareAmount != null && (
                  <p className="text-sm text-purple-600">
                    Prossima quota: € {bill.romanSplit.nextShareAmount.toFixed(2)} (
                    {bill.romanSplit.paidShares + 1}/{bill.romanSplit.shares})
                  </p>
                )}

                {!bill.romanSplit && !hasAnalyticSplit && bill.lines.length > 0 && (
                  <>
                    <div className="flex gap-2">
                      <input
                        type="number"
                        min={2}
                        max={20}
                        value={romanShares}
                        onChange={(e) => setRomanShares(e.target.value)}
                        className="w-16 rounded border border-[hsl(var(--pg-border))] px-2 py-2 text-center"
                      />
                      <Button
                        className="flex-1"
                        variant="outline"
                        disabled={loading}
                        onClick={() => void handleStartRomanSplit()}
                      >
                        Split romano
                      </Button>
                    </div>
                    <AnalyticSplitPanel
                      bill={bill}
                      onUpdated={() => selectedTable && void loadBill(selectedTable.id)}
                      onPayCheck={(checkId) => openPayment(undefined, checkId)}
                    />
                  </>
                )}

                <Button
                  className="h-12 w-full text-base"
                  variant="outline"
                  disabled={loading || bill.lines.length === 0}
                  onClick={() => void handlePrebill()}
                >
                  STAMPA PRECONTO
                </Button>
                {!hasAnalyticSplit && (
                  <Button
                    className="h-14 w-full text-lg"
                    disabled={loading || bill.lines.length === 0}
                    onClick={() => openPayment(paymentRequestId)}
                  >
                    {isRomanPay ? `PAGA QUOTA € ${payAmount.toFixed(2)}` : "PAGA"}
                  </Button>
                )}
                <Button variant="ghost" className="w-full" onClick={() => setSelectedTable(null)}>
                  Chiudi pannello
                </Button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center p-6 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
              Seleziona un tavolo per visualizzare il conto
            </div>
          )}
        </aside>
      </div>

      {pendingUnlockTable && (
        <PinModal
          title={`Sblocca tavolo ${pendingUnlockTable.label}`}
          onComplete={handleUnlockPin}
          onCancel={() => {
            setPendingUnlockTable(null);
            setPinModalError("");
          }}
          error={pinModalError}
        />
      )}

      {discountLine && (
        <PinModal
          title={`Sconto ${discountPercent}% su ${discountLine.name}`}
          onComplete={(pin) => void handleDiscountPin(pin)}
          onCancel={() => {
            setDiscountLine(null);
            setPinModalError("");
          }}
          error={pinModalError}
        />
      )}

      {showClosureWizard && operator && (
        <ClosureWizard
          operatorId={operator.id}
          operatorName={`${operator.firstName} ${operator.lastName}`}
          onClose={() => {
            setShowClosureWizard(false);
            loadTables();
          }}
        />
      )}

      {showShiftClose && activeShift && (
        <ShiftCloseModal
          shiftId={activeShift.id}
          onClose={() => setShowShiftClose(false)}
          onComplete={() => {
            setShowShiftClose(false);
            setActiveShift(null);
            setMessage("Turno chiuso");
          }}
        />
      )}

      {showPayment && bill && (
        <PaymentModal
          title={
            isAnalyticPay
              ? `Pagamento ${analyticCheck?.label ?? "conto"}`
              : isRomanPay
                ? "Quota split romano"
                : "Pagamento"
          }
          amount={payAmount}
          method={paymentMethod}
          onMethod={setPaymentMethod}
          cashAmount={cashAmount}
          onCashAmount={setCashAmount}
          loading={loading}
          onConfirm={() => void handlePay()}
          onCancel={() => setShowPayment(false)}
        />
      )}

      {paymentResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-[hsl(var(--pg-background))] p-8 text-center shadow-xl">
            {paymentResult.change != null && paymentResult.change > 0 ? (
              <>
                <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">RESTO</p>
                <p className="mb-4 font-bold tabular-nums text-[36pt]">
                  € {paymentResult.change.toFixed(2).replace(".", ",")}
                </p>
              </>
            ) : (
              <p className="mb-4 text-lg font-bold">Pagamento registrato</p>
            )}
            {paymentResult.receiptId && (
              <p className="mb-4 text-xs text-[hsl(var(--pg-muted-foreground))]">
                Scontrino {paymentResult.receiptId}
                {paymentResult.paidShares != null && paymentResult.totalShares != null && (
                  <> · Quota {paymentResult.paidShares}/{paymentResult.totalShares}</>
                )}
              </p>
            )}
            <Button className="w-full" onClick={() => setPaymentResult(null)}>
              OK
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
