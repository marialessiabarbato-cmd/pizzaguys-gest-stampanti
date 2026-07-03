import type { FiscalDocumentType, InvoiceCustomer, LocationDiscountPreset, LocationMealVoucherPreset, PaymentMethod } from "@pizzaguys/types";
import { Button } from "@pizzaguys/ui";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnalyticSplitPanel } from "../components/AnalyticSplitPanel";
import { ComandaPanel } from "../components/ComandaPanel";
import { ConfirmModal } from "../components/ConfirmModal";
import { CounterOrderModal, type CounterChannel } from "../components/CounterOrderModal";
import { DiscountModal } from "../components/DiscountModal";
import { DiscountPresetsBar } from "../components/DiscountPresetsBar";
import { PaymentModal } from "../components/PaymentModal";
import { EMPTY_INVOICE_CUSTOMER } from "../components/InvoiceCustomerForm";
import { parsePaymentAmount } from "../components/PaymentPad";
import { PinModal } from "../components/PinModal";
import { PinPad } from "../components/PinPad";
import { ClosureWizard } from "../components/ClosureWizard";
import { ClosureHistoryModal } from "../components/ClosureHistoryModal";
import { DocumentListModal } from "../components/DocumentListModal";
import { OpenTablesModal } from "../components/OpenTablesModal";
import { ReservationsModal } from "../components/ReservationsModal";
import { ShiftCloseModal } from "../components/ShiftCloseModal";
import { TableTransferModal } from "../components/TableTransferModal";
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
  guests?: number;
  defaultGuests?: number;
  isVirtual: boolean;
  virtualType: string | null;
  roomId?: string | null;
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
  counterOrder?: {
    displayNumber: string;
    customerName?: string;
    phone?: string;
    address?: string;
    notes?: string;
    broker?: string;
    asap: boolean;
    scheduledLabel?: string;
  };
}

interface CounterOrderRow {
  id: string;
  displayNumber: string;
  channel: CounterChannel;
  customerName?: string;
  phone?: string;
  scheduledLabel: string;
  status: TableStatus;
  total: number;
  lineCount: number;
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
  const { connected, on } = useEdgeWs();
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
  const [documentType, setDocumentType] = useState<FiscalDocumentType>("RECEIPT");
  const [invoiceCustomer, setInvoiceCustomer] = useState<InvoiceCustomer>(EMPTY_INVOICE_CUSTOMER);
  const [fullMealReceipt, setFullMealReceipt] = useState(false);
  const [cashAmount, setCashAmount] = useState("");
  const [paymentRequestId, setPaymentRequestId] = useState<string | undefined>();
  const [paymentResult, setPaymentResult] = useState<{
    change?: number;
    receiptId?: string;
    romanSplitComplete?: boolean;
    paidShares?: number;
    totalShares?: number;
    documentType?: FiscalDocumentType;
    invoiceNumber?: string;
    invoiceId?: string;
  } | null>(null);
  const [pendingPayments, setPendingPayments] = useState<PaymentRequest[]>([]);
  const [romanShares, setRomanShares] = useState("2");
  const [discountLine, setDiscountLine] = useState<BillLine | null>(null);
  const [discountError, setDiscountError] = useState("");
  const [maxDiscount, setMaxDiscount] = useState(20);
  const [pinDiscountThreshold, setPinDiscountThreshold] = useState(10);
  const [discountPresets, setDiscountPresets] = useState<LocationDiscountPreset[]>([]);
  const [mealVoucherPresets, setMealVoucherPresets] = useState<LocationMealVoucherPreset[]>([]);
  const [mealVoucherAmount, setMealVoucherAmount] = useState("");
  const [remainderMethod, setRemainderMethod] = useState<"CASH" | "POS">("CASH");
  const [remainderCashAmount, setRemainderCashAmount] = useState("");
  const [pendingPreset, setPendingPreset] = useState<LocationDiscountPreset | null>(null);
  const [presetPinError, setPresetPinError] = useState("");
  const [panelTab, setPanelTab] = useState<"conto" | "comanda">("conto");
  const [pendingUnlockAction, setPendingUnlockAction] = useState<"view" | "comanda" | null>(null);
  const [confirmPay, setConfirmPay] = useState(false);
  const [confirmLogout, setConfirmLogout] = useState(false);
  const [confirmPrebill, setConfirmPrebill] = useState(false);
  const [confirmRomanSplit, setConfirmRomanSplit] = useState(false);
  const [confirmStartShift, setConfirmStartShift] = useState(false);
  const [confirmClosure, setConfirmClosure] = useState(false);
  const [confirmShiftClose, setConfirmShiftClose] = useState(false);
  const [confirmClosePanel, setConfirmClosePanel] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [showShiftClose, setShowShiftClose] = useState(false);
  const [showClosureWizard, setShowClosureWizard] = useState(false);
  const [showClosureHistory, setShowClosureHistory] = useState(false);
  const [showDocumentList, setShowDocumentList] = useState(false);
  const [showOpenTables, setShowOpenTables] = useState(false);
  const [showReservations, setShowReservations] = useState(false);
  const [analyticCheckId, setAnalyticCheckId] = useState<string | undefined>();
  const [counterOrders, setCounterOrders] = useState<CounterOrderRow[]>([]);
  const [showCounterModal, setShowCounterModal] = useState(false);
  const [counterModalChannel, setCounterModalChannel] = useState<CounterChannel>("TAKEAWAY");
  const tablesRef = useRef(tables);
  const pendingUnlockTableRef = useRef(pendingUnlockTable);
  const pendingUnlockActionRef = useRef(pendingUnlockAction);
  tablesRef.current = tables;
  pendingUnlockTableRef.current = pendingUnlockTable;
  pendingUnlockActionRef.current = pendingUnlockAction;

  const canComanda = operator?.role === "USER_ADMIN" || operator?.role === "CASHIER";
  const isComandaMode =
    !!selectedTable && panelTab === "comanda" && canComanda && !!operator;
  const isCounterChannelView = channelFilter === "ASPORTO" || channelFilter === "DELIVERY";
  const isCounterOrderSelected = Boolean(bill?.counterOrder);

  const loadCounterOrders = useCallback(() => {
    const channel = channelFilter === "ASPORTO" ? "TAKEAWAY" : channelFilter === "DELIVERY" ? "DELIVERY" : undefined;
    const query = channel ? `?channel=${channel}` : "";
    void edgeApi<CounterOrderRow[]>(`/api/pos/counter-orders${query}`).then(setCounterOrders);
  }, [channelFilter]);

  const loadTables = useCallback(() => {
    void edgeApi<LiveTable[]>("/api/tables/live").then(setTables);
    void edgeApi<Array<{ id: string; name: string }>>("/api/rooms").then(setRooms);
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
    loadCounterOrders();
    void loadActiveShift(operator.id);
    void edgeApi<{
      snapshot?: {
        settings?: { maxDiscountPercent?: number; pinDiscountThresholdPercent?: number };
        discountPresets?: LocationDiscountPreset[];
        mealVoucherPresets?: LocationMealVoucherPreset[];
      };
    }>("/api/menu").then((m) => {
      setMaxDiscount(m.snapshot?.settings?.maxDiscountPercent ?? 20);
      setPinDiscountThreshold(m.snapshot?.settings?.pinDiscountThresholdPercent ?? 10);
      setDiscountPresets(
        [...(m.snapshot?.discountPresets ?? [])].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "it"),
        ),
      );
      setMealVoucherPresets(
        [...(m.snapshot?.mealVoucherPresets ?? [])].sort(
          (a, b) => a.sortOrder - b.sortOrder || a.label.localeCompare(b.label, "it"),
        ),
      );
    });
  }, [operator, loadTables, loadPendingPayments, loadCounterOrders, loadActiveShift]);

  useEffect(() => {
    if (!operator) return;
    loadTables();
    const offLocked = on("TABLE_LOCKED_BROADCAST", () => loadTables());
    const offStatus = on("TABLE_STATUS_UPDATE", () => {
      loadTables();
      loadCounterOrders();
    });
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
        const action = pendingUnlockActionRef.current;
        setPanelTab(action === "comanda" ? "comanda" : "conto");
        if (action !== "comanda") void loadBill(table.id);
      }
      setPendingUnlockTable(null);
      setPendingUnlockAction(null);
    });
    const offDenied = on("LOCK_DENIED", (payload) => {
      const p = payload as { reason?: string };
      setLockPending(null);
      setPinModalError(p.reason ?? "Sblocco negato");
    });
    const offMoved = on("TABLE_ACCOUNT_MOVED", (payload) => {
      const p = payload as { sourceTableIds: string[]; targetTableId: string };
      loadTables();
      if (selectedTable && p.sourceTableIds.includes(selectedTable.id)) {
        void loadBill(selectedTable.id).then(() => {
          setBill((b) => (b && b.lines.length === 0 ? null : b));
        });
      }
      if (selectedTable?.id === p.targetTableId) {
        void loadBill(p.targetTableId);
      }
    });
    return () => {
      offLocked();
      offStatus();
      offPending();
      offComplete();
      offGranted();
      offDenied();
      offMoved();
    };
  }, [operator, on, loadTables, loadPendingPayments, loadCounterOrders, loadBill]);

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

  const acquireTableLock = async (table: LiveTable, overridePin?: string) => {
    if (!operator) throw new Error("Operatore non autenticato");
    return edgeApi<{
      tableId: string;
      status: string;
      lockedBy?: string;
      lockedByName?: string;
      guests?: number;
    }>(`/api/tables/${table.id}/lock`, {
      method: "POST",
      body: JSON.stringify({
        operatorId: operator.id,
        operatorName: `${operator.firstName} ${operator.lastName}`,
        overridePin,
        guests: table.guests ?? table.defaultGuests ?? 2,
      }),
    });
  };

  const enterComanda = async () => {
    if (!selectedTable || !operator || !canComanda) return;
    if (selectedTable.status === "LOCKED" && selectedTable.lockedBy !== operator.id) {
      setPendingUnlockTable(selectedTable);
      setPendingUnlockAction("comanda");
      setPinModalError("");
      return;
    }
    if (selectedTable.status === "LOCKED" && selectedTable.lockedBy === operator.id) {
      setPanelTab("comanda");
      return;
    }

    setLockPending(selectedTable.id);
    setMessage("");
    try {
      const lock = await acquireTableLock(selectedTable);
      setSelectedTable({
        ...selectedTable,
        status: "LOCKED",
        lockedBy: lock.lockedBy ?? operator.id,
        lockedByName: lock.lockedByName ?? `${operator.firstName} ${operator.lastName}`,
      });
      setPanelTab("comanda");
      loadTables();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Impossibile aprire la comanda");
    } finally {
      setLockPending(null);
    }
  };

  const handleUnlockPin = async (value: string) => {
    if (!operator || !pendingUnlockTable) return;
    setPinModalError("");
    setLockPending(pendingUnlockTable.id);
    try {
      const lock = await acquireTableLock(pendingUnlockTable, value);
      const table = {
        ...pendingUnlockTable,
        status: "LOCKED" as const,
        lockedBy: lock.lockedBy ?? operator.id,
        lockedByName: lock.lockedByName ?? `${operator.firstName} ${operator.lastName}`,
      };
      const action = pendingUnlockActionRef.current;
      setSelectedTable(table);
      setPanelTab(action === "comanda" ? "comanda" : "conto");
      if (action !== "comanda") void loadBill(table.id);
      setPendingUnlockTable(null);
      setPendingUnlockAction(null);
      loadTables();
    } catch (err) {
      setPinModalError(err instanceof Error ? err.message : "Sblocco negato");
    } finally {
      setLockPending(null);
    }
  };

  const openTable = (tableId: string, requestId?: string) => {
    const table = tables.find((t) => t.id === tableId);
    if (table) {
      setSelectedTable(table);
      setPaymentRequestId(requestId);
      void loadBill(tableId);
    }
  };

  const openTableById = async (tableId: string) => {
    let table = tables.find((t) => t.id === tableId);
    if (!table) {
      const live = await edgeApi<LiveTable[]>("/api/tables/live");
      setTables(live);
      table = live.find((t) => t.id === tableId);
    }
    if (table) {
      setChannelFilter("SALA");
      selectTable(table);
    }
  };

  const selectTable = (table: LiveTable) => {
    if (table.status === "LOCKED" && table.lockedBy === operator?.id) {
      setPaymentRequestId(undefined);
      setSelectedTable(table);
      setPanelTab("conto");
      setMessage("");
      setPaymentResult(null);
      void loadBill(table.id);
      return;
    }
    if (table.status === "LOCKED" && table.lockedBy !== operator?.id) {
      setPendingUnlockTable(table);
      setPendingUnlockAction("view");
      setPinModalError("");
      return;
    }
    setPaymentRequestId(undefined);
    setSelectedTable(table);
    setPanelTab("conto");
    setMessage("");
    setPaymentResult(null);
    void loadBill(table.id);
  };

  const selectCounterOrder = (order: CounterOrderRow) => {
    const table: LiveTable = {
      id: order.id,
      label: order.displayNumber,
      x: 0,
      y: 0,
      width: 0,
      height: 0,
      status: order.status,
      isVirtual: true,
      virtualType: order.channel === "TAKEAWAY" ? "ASPORTO" : "DELIVERY",
    };
    selectTable(table);
  };

  const openCounterModal = (channel: CounterChannel) => {
    setCounterModalChannel(channel);
    setShowCounterModal(true);
  };

  const handleCreateCounterOrder = async (payload: {
    channel: CounterChannel;
    customerName?: string;
    phone?: string;
    address?: string;
    notes?: string;
    broker?: string;
    asap: boolean;
    scheduledAt?: string;
  }) => {
    if (!operator) return;
    setLoading(true);
    setMessage("");
    try {
      const result = await edgeApi<{
        order: {
          id: string;
          displayNumber: string;
          virtualType: string;
        };
      }>("/api/pos/counter-orders", {
        method: "POST",
        body: JSON.stringify({
          ...payload,
          operatorId: operator.id,
          operatorName: `${operator.firstName} ${operator.lastName}`,
        }),
      });
      const table: LiveTable = {
        id: result.order.id,
        label: result.order.displayNumber,
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        status: "OCCUPIED",
        isVirtual: true,
        virtualType: result.order.virtualType,
      };
      setShowCounterModal(false);
      setSelectedTable(table);
      setPanelTab("comanda");
      loadCounterOrders();
      loadTables();
      setLockPending(table.id);
      try {
        const lock = await acquireTableLock(table);
        setSelectedTable({
          ...table,
          status: "LOCKED",
          lockedBy: lock.lockedBy ?? operator.id,
          lockedByName: lock.lockedByName ?? `${operator.firstName} ${operator.lastName}`,
        });
        loadTables();
      } finally {
        setLockPending(null);
      }
      setMessage(`Ordine ${result.order.displayNumber} aperto`);
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore apertura ordine");
    } finally {
      setLoading(false);
    }
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

  const handleDiscountApply = async (percent: number, managerPin?: string) => {
    if (!selectedTable || !discountLine) return;
    setDiscountError("");
    setLoading(true);
    try {
      const result = await edgeApi<{ bill: TableBill }>(
        `/api/pos/tables/${selectedTable.id}/discount`,
        {
          method: "POST",
          body: JSON.stringify({
            lineId: discountLine.id,
            discountPercent: percent,
            ...(managerPin ? { managerPin } : {}),
          }),
        },
      );
      setBill(result.bill);
      setDiscountLine(null);
      setMessage(`Sconto ${percent}% applicato`);
    } catch (err) {
      setDiscountError(err instanceof Error ? err.message : "Sconto rifiutato");
    } finally {
      setLoading(false);
    }
  };

  const applyDiscountPreset = async (preset: LocationDiscountPreset, managerPin?: string) => {
    if (!selectedTable) return;
    setPresetPinError("");
    setLoading(true);
    setMessage("");
    try {
      const result = await edgeApi<{ bill: TableBill }>(
        `/api/pos/tables/${selectedTable.id}/discount-preset`,
        {
          method: "POST",
          body: JSON.stringify({
            percent: preset.percent,
            presetId: preset.id,
            presetLabel: preset.label,
            ...(managerPin ? { managerPin } : {}),
          }),
        },
      );
      setBill(result.bill);
      setPendingPreset(null);
      setMessage(`Sconto "${preset.label}" applicato a tutte le righe`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Sconto non applicato";
      if (msg.includes("PIN manager") && !managerPin) {
        setPendingPreset(preset);
        setPresetPinError("");
      } else {
        setPresetPinError(msg);
        setMessage(msg);
      }
    } finally {
      setLoading(false);
    }
  };

  const handlePresetClick = (preset: LocationDiscountPreset) => {
    if (preset.percent > pinDiscountThreshold) {
      setPendingPreset(preset);
      setPresetPinError("");
      return;
    }
    void applyDiscountPreset(preset);
  };

  const clearDiscountPresets = async () => {
    if (!selectedTable) return;
    setLoading(true);
    try {
      const result = await edgeApi<{ bill: TableBill }>(
        `/api/pos/tables/${selectedTable.id}/discount-clear`,
        { method: "POST" },
      );
      setBill(result.bill);
      setMessage("Sconti rimossi dal conto");
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Errore rimozione sconti");
    } finally {
      setLoading(false);
    }
  };

  const hasBillDiscounts = Boolean(bill?.lines.some((l) => l.discountPercent && l.discountPercent > 0));

  const analyticCheck = bill?.analyticSplit?.checks.find((c) => c.id === analyticCheckId);
  const payAmount =
    analyticCheck?.total ?? bill?.romanSplit?.nextShareAmount ?? bill?.total ?? 0;
  const isRomanPay = Boolean(bill?.romanSplit && bill.romanSplit.remainingShares > 0);
  const isAnalyticPay = Boolean(analyticCheckId && analyticCheck && !analyticCheck.paid);
  const hasAnalyticSplit = Boolean(bill?.analyticSplit);

  const openPayment = (requestId?: string, checkId?: string) => {
    setPaymentMethod("CASH");
    setDocumentType("RECEIPT");
    setInvoiceCustomer(EMPTY_INVOICE_CUSTOMER);
    setFullMealReceipt(false);
    setCashAmount("");
    setMealVoucherAmount("");
    setRemainderMethod("CASH");
    setRemainderCashAmount("");
    setPaymentRequestId(requestId);
    setAnalyticCheckId(checkId);
    setConfirmPay(true);
  };

  const handlePaymentMethod = (method: PaymentMethod) => {
    setPaymentMethod(method);
    if (method === "MEAL_VOUCHER") {
      setDocumentType("RECEIPT");
      setInvoiceCustomer(EMPTY_INVOICE_CUSTOMER);
      setFullMealReceipt(false);
    }
  };

  const handlePay = async () => {
    if (!selectedTable || !bill || !operator) return;
    const amount = payAmount;

    let paymentBody: Record<string, unknown> = {
      operatorId: operator.id,
      operatorName: `${operator.firstName} ${operator.lastName}`,
      paymentRequestId,
      shiftId: activeShift?.id,
      splitMode: isAnalyticPay ? "ANALYTIC" : isRomanPay ? "ROMAN" : "FULL",
      checkId: analyticCheckId,
      documentType,
      invoiceCustomer: documentType === "INVOICE" ? invoiceCustomer : undefined,
      fullMealReceipt: documentType === "RECEIPT" && fullMealReceipt,
    };

    if (paymentMethod === "MEAL_VOUCHER") {
      const voucher = parsePaymentAmount(mealVoucherAmount);
      if (voucher <= 0 || voucher > amount + 0.001) {
        setMessage("Importo buono non valido");
        return;
      }
      const remainder = Math.round((amount - voucher) * 100) / 100;
      if (remainder > 0.009) {
        if (remainderMethod === "CASH") {
          const received = parsePaymentAmount(remainderCashAmount);
          if (received < remainder) {
            setMessage("Importo contanti insufficiente per il saldo");
            return;
          }
          paymentBody.paymentSplits = [
            { paymentMethod: "MEAL_VOUCHER", amount: voucher },
            { paymentMethod: "CASH", amount: remainder, amountReceived: received },
          ];
        } else {
          paymentBody.paymentSplits = [
            { paymentMethod: "MEAL_VOUCHER", amount: voucher },
            { paymentMethod: "POS", amount: remainder },
          ];
        }
      } else {
        paymentBody.paymentMethod = "MEAL_VOUCHER";
        paymentBody.paymentSplits = [{ paymentMethod: "MEAL_VOUCHER", amount: voucher }];
      }
    } else if (paymentMethod === "CASH") {
      const received = parsePaymentAmount(cashAmount);
      if (received < amount) {
        setMessage("Importo insufficiente");
        return;
      }
      paymentBody.paymentMethod = paymentMethod;
      paymentBody.amountReceived = received;
    } else {
      paymentBody.paymentMethod = paymentMethod;
    }

    setLoading(true);
    setMessage("");
    try {
      const result = await edgeApi<{
        change?: number;
        receipt: { id: string; fiscalNote?: string };
        status: string;
        romanSplitComplete?: boolean;
        paidShares?: number;
        totalShares?: number;
        invoice?: {
          id: string;
          invoiceNumber: string;
          jsonPath: string;
          xmlPath: string;
          syncQueued: boolean;
        };
        bill: TableBill | null;
      }>(`/api/pos/tables/${selectedTable.id}/pay`, {
        method: "POST",
        body: JSON.stringify(paymentBody),
      });
      setPaymentResult({
        change: result.change,
        receiptId: result.receipt.id,
        romanSplitComplete: result.romanSplitComplete,
        paidShares: result.paidShares,
        totalShares: result.totalShares,
        documentType,
        invoiceNumber: result.invoice?.invoiceNumber,
        invoiceId: result.invoice?.id,
      });
      setShowPayment(false);
      setCashAmount("");
      setMealVoucherAmount("");
      setRemainderCashAmount("");
      setInvoiceCustomer(EMPTY_INVOICE_CUSTOMER);
      setFullMealReceipt(false);
      setDocumentType("RECEIPT");
      setPaymentRequestId(undefined);
      setAnalyticCheckId(undefined);
      setPendingPayments((prev) => prev.filter((p) => p.requestId !== paymentRequestId));
      loadPendingPayments();
      loadCounterOrders();

      if (result.status === "FREE") {
        setMessage(
          result.invoice
            ? `Fattura n. ${result.invoice.invoiceNumber} emessa — sync cloud in coda`
            : `Pagamento completato — scontrino ${result.receipt.id}`,
        );
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
    if (t.isVirtual) return false;
    if (channelFilter === "ALL") return true;
    if (channelFilter === "SALA") return true;
    return false;
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
            <>
              <Button
                variant="outline"
                className="h-9 px-3 text-sm"
                onClick={() => setShowOpenTables(true)}
              >
                Tavoli aperti
              </Button>
              <Button
                variant="outline"
                className="h-9 px-3 text-sm"
                onClick={() => setShowReservations(true)}
              >
                Prenotazioni
              </Button>
              <Button
                variant="outline"
                className="h-9 px-3 text-sm"
                onClick={() => setShowDocumentList(true)}
              >
                Lista documenti
              </Button>
              <Button
                variant="outline"
                className="h-9 px-3 text-sm"
                onClick={() => setShowClosureHistory(true)}
              >
                Storico chiusure
              </Button>
              <Button
                variant="outline"
                className="h-9 px-3 text-sm"
                onClick={() => setConfirmClosure(true)}
              >
                Chiusura giornata
              </Button>
            </>
          )}
          {activeShift ? (
            <Button
              variant="outline"
              className="h-9 px-3 text-sm"
              onClick={() => setConfirmShiftClose(true)}
            >
              Chiusura turno
            </Button>
          ) : (
            <Button variant="outline" className="h-9 px-3 text-sm" onClick={() => setConfirmStartShift(true)}>
              Avvia turno
            </Button>
          )}
          <Button variant="outline" className="h-9 px-3 text-sm" onClick={onAdmin}>
            Admin
          </Button>
          <Button variant="ghost" className="h-9 px-3 text-sm" onClick={() => setConfirmLogout(true)}>
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
        {!isComandaMode && (
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
            {canComanda && (
              <>
                <Button
                  className="h-9 px-3 text-sm"
                  variant="outline"
                  onClick={() => openCounterModal("TAKEAWAY")}
                >
                  + Asporto
                </Button>
                <Button
                  className="h-9 px-3 text-sm"
                  variant="outline"
                  onClick={() => openCounterModal("DELIVERY")}
                >
                  + Delivery
                </Button>
              </>
            )}
          </div>

          {isCounterChannelView ? (
            <div className="flex min-h-0 flex-1 flex-col gap-3">
              {canComanda && (
                <Button
                  className="h-12 w-full text-base"
                  onClick={() =>
                    openCounterModal(channelFilter === "ASPORTO" ? "TAKEAWAY" : "DELIVERY")
                  }
                >
                  + Nuovo ordine {channelFilter === "ASPORTO" ? "asporto" : "delivery"}
                </Button>
              )}
              <div className="min-h-0 flex-1 space-y-2 overflow-y-auto rounded-lg border border-[hsl(var(--pg-border))] p-3">
                {counterOrders.length === 0 ? (
                  <p className="py-8 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
                    Nessun ordine attivo
                  </p>
                ) : (
                  counterOrders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => selectCounterOrder(order)}
                      className={`flex w-full items-center justify-between gap-3 rounded-lg border px-4 py-3 text-left transition active:scale-[0.99] ${
                        selectedTable?.id === order.id
                          ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10"
                          : "border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20"
                      }`}
                    >
                      <div>
                        <p className="font-bold">{order.displayNumber}</p>
                        <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                          {order.customerName || "Cliente da banco"}
                          {order.phone ? ` · ${order.phone}` : ""}
                        </p>
                        <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                          {order.scheduledLabel} · {order.lineCount} articoli
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-semibold tabular-nums">€ {order.total.toFixed(2)}</p>
                        <p className="text-xs uppercase text-[hsl(var(--pg-muted-foreground))]">
                          {order.status}
                        </p>
                      </div>
                    </button>
                  ))
                )}
              </div>
            </div>
          ) : (
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
          )}

          {!isCounterChannelView && (
          <div className="mt-3 flex flex-wrap gap-3 text-xs">
            {Object.entries(STATUS_COLORS).map(([status, color]) => (
              <span key={status} className="flex items-center gap-1">
                <span className={`h-3 w-3 rounded ${color.split(" ")[0]}`} />
                {status}
              </span>
            ))}
          </div>
          )}
        </section>
        )}

        <aside
          className={`flex shrink-0 flex-col border-l border-[hsl(var(--pg-border))] ${
            isComandaMode ? "min-w-0 flex-1" : "w-full max-w-md lg:w-[28rem]"
          }`}
        >
          {selectedTable && panelTab === "comanda" && canComanda && operator ? (
            <ComandaPanel
              table={selectedTable}
              operator={operator}
              onClose={() => {
                setPanelTab("conto");
                loadTables();
                void loadBill(selectedTable.id);
              }}
              onSubmitted={() => {
                setPanelTab("conto");
                loadTables();
                void loadBill(selectedTable.id);
                setMessage("Comanda inviata in cucina");
              }}
            />
          ) : selectedTable && bill ? (
            <>
              <div className="border-b border-[hsl(var(--pg-border))] p-4">
                <div className="mb-2 flex gap-2">
                  <Button
                    className="h-8 flex-1 text-xs"
                    variant={panelTab === "conto" ? "default" : "outline"}
                    onClick={() => setPanelTab("conto")}
                  >
                    Conto
                  </Button>
                  {canComanda && (
                    <Button
                      className="h-8 flex-1 text-xs"
                      variant={panelTab === "comanda" ? "default" : "outline"}
                      onClick={() => void enterComanda()}
                    >
                      Comanda
                    </Button>
                  )}
                </div>
                <h2 className="text-lg font-bold">{bill.tableLabel}</h2>
                <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                  {selectedTable.status}
                  {bill.counterOrder?.scheduledLabel && (
                    <span> · {bill.counterOrder.scheduledLabel}</span>
                  )}
                  {bill.romanSplit && (
                    <span>
                      {" "}
                      · Split {bill.romanSplit.paidShares}/{bill.romanSplit.shares}
                    </span>
                  )}
                </p>
                {bill.counterOrder && (
                  <div className="mt-2 space-y-0.5 text-xs text-[hsl(var(--pg-muted-foreground))]">
                    {bill.counterOrder.customerName && <p>Cliente: {bill.counterOrder.customerName}</p>}
                    {bill.counterOrder.phone && <p>Tel: {bill.counterOrder.phone}</p>}
                    {bill.counterOrder.address && <p>Indirizzo: {bill.counterOrder.address}</p>}
                    {bill.counterOrder.broker && <p>Broker: {bill.counterOrder.broker}</p>}
                    {bill.counterOrder.notes && <p>Nota: {bill.counterOrder.notes}</p>}
                  </div>
                )}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {bill.lines.length === 0 ? (
                  <div className="flex flex-col items-center gap-4 py-8 text-center">
                    <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                      Nessuna voce in conto
                    </p>
                    {canComanda && (
                      <Button
                        className="h-12 w-full max-w-xs text-base"
                        disabled={lockPending === selectedTable.id}
                        onClick={() => void enterComanda()}
                      >
                        + Aggiungi articoli
                      </Button>
                    )}
                  </div>
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
                            onClick={() => setDiscountLine(line)}
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
                      Tap riga per sconto (PIN oltre {pinDiscountThreshold}%)
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
                    <DiscountPresetsBar
                      presets={discountPresets}
                      hasDiscounts={hasBillDiscounts}
                      loading={loading}
                      onApply={handlePresetClick}
                      onClear={() => void clearDiscountPresets()}
                    />
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
                        onClick={() => setConfirmRomanSplit(true)}
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
                  disabled={
                    loading ||
                    bill.lines.length === 0 ||
                    selectedTable.status === "SPLIT_IN_PROGRESS" ||
                    isCounterOrderSelected
                  }
                  onClick={() => setShowTransferModal(true)}
                >
                  SPOSTA / UNISCI TAVOLI
                </Button>
                <Button
                  className="h-12 w-full text-base"
                  variant="outline"
                  disabled={loading || bill.lines.length === 0}
                  onClick={() => setConfirmPrebill(true)}
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
                <Button variant="ghost" className="w-full" onClick={() => setConfirmClosePanel(true)}>
                  Chiudi pannello
                </Button>
              </div>
            </>
          ) : selectedTable ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 p-6 text-center">
              <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento conto…</p>
              {canComanda && (
                <Button
                  className="h-12 w-full max-w-xs"
                  disabled={lockPending === selectedTable.id}
                  onClick={() => void enterComanda()}
                >
                  + Aggiungi articoli
                </Button>
              )}
            </div>
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
        <DiscountModal
          lineName={discountLine.name}
          maxPercent={maxDiscount}
          pinThreshold={pinDiscountThreshold}
          presets={discountPresets}
          onApply={(percent, pin) => void handleDiscountApply(percent, pin)}
          onCancel={() => {
            setDiscountLine(null);
            setDiscountError("");
          }}
          error={discountError}
        />
      )}

      {pendingPreset && (
        <PinModal
          title={`PIN manager — ${pendingPreset.label} (${pendingPreset.percent}%)`}
          onComplete={(pin) => void applyDiscountPreset(pendingPreset, pin)}
          onCancel={() => {
            setPendingPreset(null);
            setPresetPinError("");
          }}
          error={presetPinError}
        />
      )}

      {confirmPay && bill && (
        <ConfirmModal
          title="Confermi il pagamento?"
          message={`Incasso di € ${payAmount.toFixed(2)} per tavolo ${bill.tableLabel}.`}
          confirmLabel="Procedi"
          onConfirm={() => {
            setConfirmPay(false);
            setShowPayment(true);
          }}
          onCancel={() => setConfirmPay(false)}
        />
      )}

      {confirmLogout && (
        <ConfirmModal
          title="Uscire dalla cassa?"
          message="La sessione operatore verrà chiusa."
          confirmLabel="Esci"
          onConfirm={() => {
            setConfirmLogout(false);
            setOperator(null);
          }}
          onCancel={() => setConfirmLogout(false)}
        />
      )}

      {confirmPrebill && (
        <ConfirmModal
          title="Stampare il preconto?"
          message="Verrà emesso un documento non fiscale."
          confirmLabel="Stampa"
          onConfirm={() => {
            setConfirmPrebill(false);
            void handlePrebill();
          }}
          onCancel={() => setConfirmPrebill(false)}
        />
      )}

      {confirmRomanSplit && (
        <ConfirmModal
          title="Avviare split romano?"
          message={`Dividere il conto in ${romanShares} quote uguali.`}
          confirmLabel="Conferma"
          onConfirm={() => {
            setConfirmRomanSplit(false);
            void handleStartRomanSplit();
          }}
          onCancel={() => setConfirmRomanSplit(false)}
        />
      )}

      {confirmStartShift && (
        <ConfirmModal
          title="Avviare turno cassa?"
          message="Il turno verrà associato al tuo operatore."
          confirmLabel="Avvia"
          onConfirm={() => {
            setConfirmStartShift(false);
            void startShift();
          }}
          onCancel={() => setConfirmStartShift(false)}
        />
      )}

      {confirmClosure && (
        <ConfirmModal
          title="Avviare chiusura giornaliera?"
          message="Procedura irreversibile: verifica tavoli e turni aperti."
          confirmLabel="Procedi"
          variant="danger"
          onConfirm={() => {
            setConfirmClosure(false);
            setShowClosureWizard(true);
          }}
          onCancel={() => setConfirmClosure(false)}
        />
      )}

      {confirmShiftClose && (
        <ConfirmModal
          title="Chiudere il turno?"
          message="Conteggio cieco contanti e POS."
          confirmLabel="Procedi"
          onConfirm={() => {
            setConfirmShiftClose(false);
            setShowShiftClose(true);
          }}
          onCancel={() => setConfirmShiftClose(false)}
        />
      )}

      {confirmClosePanel && (
        <ConfirmModal
          title="Chiudere il pannello conto?"
          message="Il tavolo resta nello stato attuale."
          confirmLabel="Chiudi"
          onConfirm={() => {
            setConfirmClosePanel(false);
            setSelectedTable(null);
          }}
          onCancel={() => setConfirmClosePanel(false)}
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
          onMethod={handlePaymentMethod}
          documentType={documentType}
          onDocumentType={setDocumentType}
          invoiceCustomer={invoiceCustomer}
          onInvoiceCustomer={setInvoiceCustomer}
          fullMealReceipt={fullMealReceipt}
          onFullMealReceipt={setFullMealReceipt}
          fullMealAvailable={!isRomanPay && !isAnalyticPay}
          cashAmount={cashAmount}
          onCashAmount={setCashAmount}
          mealVoucherPresets={mealVoucherPresets}
          mealVoucherAmount={mealVoucherAmount}
          onMealVoucherAmount={setMealVoucherAmount}
          remainderMethod={remainderMethod}
          onRemainderMethod={setRemainderMethod}
          remainderCashAmount={remainderCashAmount}
          onRemainderCashAmount={setRemainderCashAmount}
          loading={loading}
          onConfirm={() => void handlePay()}
          onCancel={() => setShowPayment(false)}
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

      {showClosureHistory && <ClosureHistoryModal onClose={() => setShowClosureHistory(false)} />}

      {showDocumentList && operator && (
        <DocumentListModal operatorId={operator.id} onClose={() => setShowDocumentList(false)} />
      )}

      {showOpenTables && (
        <OpenTablesModal
          shiftId={activeShift?.id}
          rooms={rooms}
          onClose={() => setShowOpenTables(false)}
          onSelectTable={(tableId) => {
            void openTableById(tableId);
          }}
        />
      )}

      {showReservations && operator && (
        <ReservationsModal
          operatorId={operator.id}
          operatorName={`${operator.firstName} ${operator.lastName}`}
          rooms={rooms}
          tables={tables}
          onClose={() => setShowReservations(false)}
          onOpenTable={(tableId) => {
            void openTableById(tableId);
            setShowReservations(false);
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

      {showTransferModal && selectedTable && operator && bill && (
        <TableTransferModal
          sourceTable={selectedTable}
          operator={operator}
          billLines={bill.lines.filter((l) => l.id !== "__cover_charge__")}
          tables={tables}
          rooms={rooms}
          connected={connected}
          onClose={() => setShowTransferModal(false)}
          onSuccess={(msg) => {
            setMessage(msg);
            setShowTransferModal(false);
            loadTables();
            void loadBill(selectedTable.id);
          }}
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
                {paymentResult.documentType === "INVOICE" ? (
                  <>
                    FATTURA ALLEGATA · Scontrino {paymentResult.receiptId}
                    {paymentResult.invoiceNumber && (
                      <> · Fattura mock n. {paymentResult.invoiceNumber}</>
                    )}
                  </>
                ) : (
                  <>Scontrino {paymentResult.receiptId}</>
                )}
                {paymentResult.paidShares != null && paymentResult.totalShares != null && (
                  <> · Quota {paymentResult.paidShares}/{paymentResult.totalShares}</>
                )}
              </p>
            )}
            {paymentResult.documentType === "INVOICE" && (
              <p className="mb-4 text-xs text-amber-700">
                Verifica file in <code>tmp/prints/</code> (JSON + XML) e Cloud Admin → Fatture.
              </p>
            )}
            <Button className="w-full" onClick={() => setPaymentResult(null)}>
              OK
            </Button>
          </div>
        </div>
      )}

      {showCounterModal && (
        <CounterOrderModal
          initialChannel={counterModalChannel}
          loading={loading}
          onClose={() => setShowCounterModal(false)}
          onConfirm={(payload) => void handleCreateCounterOrder(payload)}
        />
      )}
    </div>
  );
}
