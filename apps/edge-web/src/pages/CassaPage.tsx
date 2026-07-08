import type { FiscalDocumentType, InvoiceCustomer, LocationDiscountPreset, LocationMealVoucherPreset, PaymentMethod, TableStatus } from "@pizzaguys/types";
import { Button, useTheme } from "@pizzaguys/ui";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnalyticSplitPanel } from "../components/AnalyticSplitPanel";
import { CassaHeader } from "../components/CassaHeader";
import { TableMapViewport } from "../components/TableMapViewport";
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
import { dedupeRecentCustomers } from "../lib/counter-customers";
import {
  TABLE_STATUS_COLORS,
  TABLE_STATUS_LABELS,
  filterTablesByRoom,
  formatTableLabel,
  tableLabelFontClass,
} from "../lib/table-display";
import { useEdgeWs } from "../lib/ws";

const STATUS_COLORS = TABLE_STATUS_COLORS;

type ChannelFilter = "SALA" | "ASPORTO" | "DELIVERY";
type CassaWorkspace = "main" | "openTables" | "reservations";
type UnifiedMenuItem = {
  id: string;
  label: string;
  channel: ChannelFilter;
  roomId?: string;
};

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
  address?: string;
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
  const { theme, setTheme } = useTheme();
  const { connected, on } = useEdgeWs();
  const [operator, setOperator] = useState<Operator | null>(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [tables, setTables] = useState<LiveTable[]>([]);
  const [channelFilter, setChannelFilter] = useState<ChannelFilter>("SALA");
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
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [profilePin, setProfilePin] = useState("");
  const [profilePinConfirm, setProfilePinConfirm] = useState("");
  const [profilePinError, setProfilePinError] = useState("");
  const [profileSaving, setProfileSaving] = useState(false);
  const [showTransferModal, setShowTransferModal] = useState(false);
  const [rooms, setRooms] = useState<Array<{ id: string; name: string }>>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [activeShift, setActiveShift] = useState<Shift | null>(null);
  const [showShiftClose, setShowShiftClose] = useState(false);
  const [showClosureWizard, setShowClosureWizard] = useState(false);
  const [showClosureHistory, setShowClosureHistory] = useState(false);
  const [showDocumentList, setShowDocumentList] = useState(false);
  const [workspace, setWorkspace] = useState<CassaWorkspace>("main");
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
  const isCounterOrderSelected = Boolean(bill?.counterOrder);
  const showCounterOrders = channelFilter === "ASPORTO" || channelFilter === "DELIVERY";
  const counterChannelLabel = channelFilter === "ASPORTO" ? "asporto" : "delivery";
  const counterAsideOpen =
    showCounterOrders && Boolean(selectedTable) && !showCounterModal;
  const recentCounterCustomers = useMemo(
    () => dedupeRecentCustomers(counterOrders),
    [counterOrders],
  );

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
    if (rooms.length === 0) {
      setSelectedRoomId("");
      return;
    }
    setSelectedRoomId((current) => {
      if (current && rooms.some((room) => room.id === current)) return current;
      const internalRoom = rooms.find((room) => room.name.trim().toLowerCase().includes("interna"));
      return internalRoom?.id ?? rooms[0]?.id ?? "";
    });
  }, [rooms]);

  useEffect(() => {
    if (!operator) return;
    loadCounterOrders();
  }, [channelFilter, operator, loadCounterOrders]);

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
    setChannelFilter(channel === "TAKEAWAY" ? "ASPORTO" : "DELIVERY");
    setSelectedTable(null);
    setBill(null);
    setPaymentResult(null);
    setShowCounterModal(true);
  };

  const handleChannelFilter = (id: ChannelFilter) => {
    setWorkspace("main");
    setChannelFilter(id);
    if (id === "SALA") {
      if (selectedTable?.isVirtual) {
        setSelectedTable(null);
        setBill(null);
        setPaymentResult(null);
      }
    } else if (selectedTable && !selectedTable.isVirtual) {
      setSelectedTable(null);
      setBill(null);
      setPaymentResult(null);
    }
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

  const allPhysicalTables = useMemo(() => tables.filter((t) => !t.isVirtual), [tables]);

  const filteredTables = useMemo(
    () => filterTablesByRoom(tables, selectedRoomId || null, rooms.length),
    [tables, selectedRoomId, rooms.length],
  );
  const displayTables = useMemo(() => {
    const internalRoom = rooms.find((room) => room.name.trim().toLowerCase().includes("interna"));
    const internalMinX = tables
      .filter((t) => !t.isVirtual && internalRoom && t.roomId === internalRoom.id)
      .reduce<number | null>((min, t) => (min == null ? t.x : Math.min(min, t.x)), null);
    const baseX = internalMinX ?? filteredTables.reduce<number | null>(
      (min, t) => (min == null ? t.x : Math.min(min, t.x)),
      null,
    );
    if (baseX == null) return filteredTables;
    return filteredTables.map((t) => ({ ...t, x: t.x - baseX }));
  }, [filteredTables, rooms, tables]);

  const activeRoomName = useMemo(
    () => rooms.find((room) => room.id === selectedRoomId)?.name,
    [rooms, selectedRoomId],
  );
  const unifiedMenuItems = useMemo<UnifiedMenuItem[]>(() => {
    const roomItems = rooms.map((room) => ({
      id: `room:${room.id}`,
      label: `Sala ${room.name}`,
      channel: "SALA" as const,
      roomId: room.id,
    }));
    return [
      ...roomItems,
      { id: "channel:ASPORTO", label: "Asporto", channel: "ASPORTO" as const },
      { id: "channel:DELIVERY", label: "Delivery", channel: "DELIVERY" as const },
    ];
  }, [rooms]);

  const tableStatusSummary = useMemo(() => {
    const counts: Partial<Record<TableStatus, number>> = {};
    for (const t of filteredTables) {
      counts[t.status] = (counts[t.status] ?? 0) + 1;
    }
    return counts;
  }, [filteredTables]);

  const openTableCount = useMemo(
    () => allPhysicalTables.filter((t) => t.status !== "FREE").length,
    [allPhysicalTables],
  );

  const selectedUnifiedItemId = useMemo(() => {
    if (channelFilter === "SALA") return selectedRoomId ? `room:${selectedRoomId}` : "room:none";
    return `channel:${channelFilter}`;
  }, [channelFilter, selectedRoomId]);

  const operatorRoleLabel = useMemo(() => {
    if (!operator) return "—";
    if (operator.role === "USER_ADMIN") return "User Admin";
    if (operator.role === "CASHIER") return "Cassiere";
    if (operator.role === "WAITER") return "Cameriere";
    return operator.role;
  }, [operator]);
  const operatorInitials = useMemo(() => {
    if (!operator) return "";
    const a = operator.firstName?.[0] ?? "";
    const b = operator.lastName?.[0] ?? "";
    return `${a}${b}`.toUpperCase();
  }, [operator]);

  const handleProfilePinReset = async () => {
    if (!operator) return;
    if (!/^[0-9]{4}$/.test(profilePin)) {
      setProfilePinError("Il PIN deve avere 4 cifre numeriche.");
      return;
    }
    if (profilePin !== profilePinConfirm) {
      setProfilePinError("I PIN non coincidono.");
      return;
    }
    setProfileSaving(true);
    setProfilePinError("");
    try {
      await edgeApi(`/api/staff/${operator.id}`, {
        method: "PATCH",
        body: JSON.stringify({ pin: profilePin }),
      });
      setProfilePin("");
      setProfilePinConfirm("");
      setMessage("PIN aggiornato");
      setShowProfileModal(false);
    } catch (err) {
      setProfilePinError(err instanceof Error ? err.message : "Errore aggiornamento PIN");
    } finally {
      setProfileSaving(false);
    }
  };

  if (!operator) {
    return (
      <main className="flex h-dvh flex-col items-center justify-center overflow-y-auto p-6">
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
    <div className="grid h-dvh grid-rows-[auto_minmax(0,1fr)] overflow-hidden bg-[hsl(var(--pg-background))]">
      <CassaHeader
        operatorName={`${operator.firstName} ${operator.lastName}`}
        locationName={locationName}
        connected={connected}
        activeShift={activeShift}
        openTableCount={openTableCount}
        pendingPaymentCount={pendingPayments.length}
        canManage={canComanda}
        onOpenTables={() => setWorkspace("openTables")}
        onReservations={() => setWorkspace("reservations")}
        onDocumentList={() => setShowDocumentList(true)}
        onClosureHistory={() => setShowClosureHistory(true)}
        onClosureDay={() => setConfirmClosure(true)}
        onStartShift={() => setConfirmStartShift(true)}
        onCloseShift={() => setConfirmShiftClose(true)}
        onAdmin={onAdmin}
        onProfile={() => setShowProfileModal(true)}
        onLogout={() => setConfirmLogout(true)}
      />

      <div className="flex min-h-0 flex-col overflow-hidden">
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

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {workspace === "openTables" ? (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
            <OpenTablesModal
              embedded
              shiftId={activeShift?.id}
              rooms={rooms}
              onClose={() => setWorkspace("main")}
              onSelectTable={(tableId) => {
                setWorkspace("main");
                void openTableById(tableId);
              }}
            />
          </section>
        ) : workspace === "reservations" && operator ? (
          <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
            <ReservationsModal
              embedded
              operatorId={operator.id}
              operatorName={`${operator.firstName} ${operator.lastName}`}
              rooms={rooms}
              tables={tables}
              onClose={() => setWorkspace("main")}
              onOpenTable={(tableId) => {
                setWorkspace("main");
                void openTableById(tableId);
                loadTables();
              }}
            />
          </section>
        ) : (
        <>
        {!isComandaMode && (
        <section className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden p-3">
          <div className="mb-3 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-2">
            {unifiedMenuItems.map((item) => (
              <Button
                key={item.id}
                className="h-9 px-3 text-sm"
                variant={selectedUnifiedItemId === item.id ? "default" : "outline"}
                onClick={() => {
                  if (item.channel === "SALA") {
                    if (item.roomId) setSelectedRoomId(item.roomId);
                    handleChannelFilter("SALA");
                    return;
                  }
                  handleChannelFilter(item.channel);
                }}
              >
                {item.label}
              </Button>
            ))}
            </div>
            {channelFilter === "SALA" ? (
            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
              {filteredTables.length}{" "}
              {filteredTables.length === 1 ? "tavolo" : "tavoli"}
              {activeRoomName ? ` · ${activeRoomName}` : " in sala"}
            </p>
            ) : (
            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
              {counterOrders.length}{" "}
              {counterOrders.length === 1 ? "ordine attivo" : "ordini attivi"}
            </p>
            )}
            </div>
          </div>

          {channelFilter === "SALA" ? (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            <TableMapViewport tables={displayTables} maxScale={1.15} align="start" className="!p-0">
              {(scale) =>
                displayTables.length === 0 ? (
                  <p className="absolute inset-0 flex items-center justify-center px-6 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
                    {rooms.length > 1 && activeRoomName
                      ? `Nessun tavolo in ${activeRoomName} — configura la mappa da Admin → Sala`
                      : "Nessun tavolo in sala — configura la mappa da Admin → Sala"}
                  </p>
                ) : (
                  displayTables.map((t) => (
                    <button
                      key={t.id}
                      type="button"
                      disabled={lockPending === t.id}
                      onClick={() => selectTable(filteredTables.find((row) => row.id === t.id) ?? t)}
                      style={{
                        position: "absolute",
                        left: t.x,
                        top: t.y,
                        width: t.width,
                        height: t.height,
                      }}
                      className={`flex min-h-[42px] min-w-[42px] flex-col items-center justify-center gap-0.5 overflow-hidden rounded-lg border-2 border-white/20 px-1 text-white shadow-md transition active:scale-[0.97] ${STATUS_COLORS[t.status] ?? "bg-gray-500"} ${selectedTable?.id === t.id ? "ring-4 ring-white ring-offset-2 ring-offset-[hsl(var(--pg-background))]" : ""} ${lockPending === t.id ? "opacity-50" : ""}`}
                    >
                      <span
                        className={`max-w-full truncate px-1 font-bold leading-tight ${tableLabelFontClass(t.label, t.width * scale)}`}
                      >
                        {formatTableLabel(t.label)}
                      </span>
                      <span className="text-[10px] font-medium opacity-90">
                        {(t.guests ?? t.defaultGuests ?? 0) > 0
                          ? `${t.guests ?? t.defaultGuests} cop.`
                          : "0 cop."}
                      </span>
                      {t.lockedByName && t.status === "LOCKED" && (
                        <span className="max-w-full truncate px-1 text-[10px] opacity-90">
                          {t.lockedByName}
                        </span>
                      )}
                    </button>
                  ))
                )
              }
            </TableMapViewport>

            <div className="flex flex-wrap gap-x-4 gap-y-2 border-t border-[hsl(var(--pg-border))] px-4 py-2.5 text-xs text-[hsl(var(--pg-muted-foreground))]">
              {(Object.keys(STATUS_COLORS) as TableStatus[]).map((status) => (
                <span key={status} className="flex items-center gap-1.5">
                  <span className={`h-2.5 w-2.5 rounded-full ${STATUS_COLORS[status].split(" ")[0]}`} />
                  {TABLE_STATUS_LABELS[status]}
                  {tableStatusSummary[status] != null && tableStatusSummary[status]! > 0 && (
                    <span className="tabular-nums text-[hsl(var(--pg-foreground))]">
                      ({tableStatusSummary[status]})
                    </span>
                  )}
                </span>
              ))}
            </div>
          </div>
          ) : (
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20">
            <div className="flex items-start justify-between gap-3 border-b border-[hsl(var(--pg-border))] px-4 py-3">
              <div className="min-w-0 flex-1">
                {showCounterModal ? (
                  <>
                    <h2 className="text-xl font-bold capitalize">Nuovo ordine {counterChannelLabel}</h2>
                    <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                      Compila i dati qui sotto e conferma con Ok
                    </p>
                  </>
                ) : selectedTable && bill ? (
                  <>
                    <button
                      type="button"
                      className="mb-1 text-xs text-[hsl(var(--pg-primary))] hover:underline"
                      onClick={() => {
                        setSelectedTable(null);
                        setBill(null);
                        setPaymentResult(null);
                      }}
                    >
                      ← Lista ordini {counterChannelLabel}
                    </button>
                    <h2 className="text-xl font-bold">{bill.tableLabel}</h2>
                    <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                      {selectedTable.status}
                      {bill.counterOrder?.scheduledLabel && (
                        <span> · {bill.counterOrder.scheduledLabel}</span>
                      )}
                      <span> · € {bill.total.toFixed(2)}</span>
                    </p>
                    {bill.counterOrder && (
                      <div className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-sm text-[hsl(var(--pg-muted-foreground))]">
                        {bill.counterOrder.customerName && (
                          <span>{bill.counterOrder.customerName}</span>
                        )}
                        {bill.counterOrder.phone && <span>{bill.counterOrder.phone}</span>}
                        {bill.counterOrder.address && <span>{bill.counterOrder.address}</span>}
                        {bill.counterOrder.broker && <span>{bill.counterOrder.broker}</span>}
                        {bill.counterOrder.notes && (
                          <span className="italic">Nota: {bill.counterOrder.notes}</span>
                        )}
                      </div>
                    )}
                  </>
                ) : selectedTable ? (
                  <>
                    <h2 className="text-xl font-bold">{selectedTable.label}</h2>
                    <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Caricamento conto…</p>
                  </>
                ) : (
                  <>
                    <h2 className="text-xl font-bold capitalize">{counterChannelLabel}</h2>
                    <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                      Gestione ordini {counterChannelLabel}
                    </p>
                  </>
                )}
              </div>
              {canComanda && !showCounterModal && (
                <Button
                  className="h-10 shrink-0 px-4 text-sm"
                  onClick={() =>
                    openCounterModal(channelFilter === "ASPORTO" ? "TAKEAWAY" : "DELIVERY")
                  }
                >
                  + Nuovo ordine
                </Button>
              )}
            </div>
            {showCounterModal ? (
              <CounterOrderModal
                embedded
                hideChannelTabs
                initialChannel={counterModalChannel}
                loading={loading}
                recentCustomers={recentCounterCustomers}
                onClose={() => setShowCounterModal(false)}
                onConfirm={(payload) => void handleCreateCounterOrder(payload)}
              />
            ) : (
            <div className="min-h-0 flex-1 overflow-y-auto p-4">
              {counterOrders.length === 0 ? (
                <div className="flex h-full min-h-[240px] flex-col items-center justify-center gap-3 text-center">
                  <p className="text-base font-medium">Nessun ordine attivo</p>
                  <p className="max-w-sm text-sm text-[hsl(var(--pg-muted-foreground))]">
                    Crea un nuovo ordine {counterChannelLabel} per iniziare a prendere comanda e incassare.
                  </p>
                  {canComanda && (
                    <Button
                      className="h-10 px-4"
                      onClick={() =>
                        openCounterModal(channelFilter === "ASPORTO" ? "TAKEAWAY" : "DELIVERY")
                      }
                    >
                      + Nuovo ordine
                    </Button>
                  )}
                </div>
              ) : (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {counterOrders.map((order) => (
                    <button
                      key={order.id}
                      type="button"
                      onClick={() => selectCounterOrder(order)}
                      className={`rounded-xl border p-4 text-left transition active:scale-[0.99] ${
                        selectedTable?.id === order.id
                          ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10 shadow-sm"
                          : "border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] hover:border-[hsl(var(--pg-primary))]/40"
                      }`}
                    >
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <p className="text-lg font-bold">{order.displayNumber}</p>
                        <p className="font-semibold tabular-nums">€ {order.total.toFixed(2)}</p>
                      </div>
                      <p className="truncate text-sm text-[hsl(var(--pg-muted-foreground))]">
                        {order.customerName || "Cliente da banco"}
                        {order.phone ? ` · ${order.phone}` : ""}
                      </p>
                      <p className="mt-1 text-xs text-[hsl(var(--pg-muted-foreground))]">
                        {order.scheduledLabel} · {order.lineCount} articoli · {order.status}
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>
            )}
          </div>
          )}
        </section>
        )}

        {(!showCounterOrders || counterAsideOpen) && (
        <aside
          className={`flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-[hsl(var(--pg-border))] ${
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
                {!showCounterOrders && (
                  <>
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
                        {bill.counterOrder.customerName && (
                          <p>Cliente: {bill.counterOrder.customerName}</p>
                        )}
                        {bill.counterOrder.phone && <p>Tel: {bill.counterOrder.phone}</p>}
                        {bill.counterOrder.address && (
                          <p>Indirizzo: {bill.counterOrder.address}</p>
                        )}
                        {bill.counterOrder.broker && <p>Broker: {bill.counterOrder.broker}</p>}
                        {bill.counterOrder.notes && <p>Nota: {bill.counterOrder.notes}</p>}
                      </div>
                    )}
                  </>
                )}
                {showCounterOrders && (
                  <div className="flex gap-2">
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
          ) : !showCounterOrders ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2 p-8 text-center">
              <p className="text-base font-medium text-[hsl(var(--pg-foreground))]">
                Nessun tavolo selezionato
              </p>
              <p className="max-w-xs text-sm text-[hsl(var(--pg-muted-foreground))]">
                Tocca un tavolo sulla mappa per aprire il conto, incassare o gestire la comanda.
              </p>
            </div>
          ) : null}
        </aside>
        )}
        </>
        )}
      </div>
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

      {showProfileModal && operator && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4">
          <div className="w-full max-w-md rounded-xl border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-background))] shadow-xl">
            <div className="flex items-center justify-between border-b border-[hsl(var(--pg-border))] px-4 py-3">
              <h2 className="text-base font-semibold">Profilo</h2>
              <button
                type="button"
                className="rounded px-2 py-1 text-sm text-[hsl(var(--pg-muted-foreground))] hover:bg-[hsl(var(--pg-muted))]/50"
                onClick={() => {
                  setShowProfileModal(false);
                  setProfilePin("");
                  setProfilePinConfirm("");
                  setProfilePinError("");
                }}
                aria-label="Chiudi"
              >
                ✕
              </button>
            </div>

            <div className="space-y-4 px-4 py-4">
              <div className="rounded-lg border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20 p-4">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[hsl(var(--pg-primary))]/15 text-sm font-bold text-[hsl(var(--pg-primary))]">
                    {operatorInitials}
                  </div>
                  <div>
                    <p className="text-base font-semibold leading-tight">
                      {operator.firstName} {operator.lastName}
                    </p>
                    <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{operatorRoleLabel}</p>
                  </div>
                </div>
                <div className="mt-3 grid gap-2 text-sm">
                  {locationName && (
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-[hsl(var(--pg-muted-foreground))]">Sede</span>
                      <strong className="text-right">{locationName}</strong>
                    </div>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Tema</p>
                <div className="inline-flex rounded-lg border border-[hsl(var(--pg-border))] p-1">
                  <button
                    type="button"
                    className={`h-8 rounded-md px-3 text-sm ${
                      theme === "light"
                        ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                        : "text-[hsl(var(--pg-muted-foreground))]"
                    }`}
                    onClick={() => setTheme("light")}
                  >
                    Chiaro
                  </button>
                  <button
                    type="button"
                    className={`h-8 rounded-md px-3 text-sm ${
                      theme === "dark"
                        ? "bg-[hsl(var(--pg-primary))] text-[hsl(var(--pg-primary-foreground))]"
                        : "text-[hsl(var(--pg-muted-foreground))]"
                    }`}
                    onClick={() => setTheme("dark")}
                  >
                    Scuro
                  </button>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-medium">Modifica codice di sblocco</p>
                <input
                  className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
                  placeholder="Nuovo PIN (4 cifre)"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={profilePin}
                  onChange={(e) => {
                    setProfilePin(e.target.value);
                    setProfilePinError("");
                  }}
                />
                <input
                  className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
                  placeholder="Conferma PIN"
                  pattern="[0-9]{4}"
                  maxLength={4}
                  value={profilePinConfirm}
                  onChange={(e) => {
                    setProfilePinConfirm(e.target.value);
                    setProfilePinError("");
                  }}
                />
                {profilePinError && <p className="text-sm text-red-600">{profilePinError}</p>}
              </div>
            </div>

            <div className="flex justify-end gap-2 border-t border-[hsl(var(--pg-border))] px-4 py-3">
              <Button
                variant="outline"
                onClick={() => {
                  setShowProfileModal(false);
                  setProfilePin("");
                  setProfilePinConfirm("");
                  setProfilePinError("");
                }}
              >
                Chiudi
              </Button>
              <Button onClick={() => void handleProfilePinReset()} disabled={profileSaving}>
                {profileSaving ? "Salvataggio..." : "Salva PIN"}
              </Button>
            </div>
          </div>
        </div>
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

    </div>
  );
}
