/** Servizio a cui appartiene una sessione di cassa. La cena è una sola sessione anche con doppio turno di prenotazioni. */
export type CashService = "LUNCH" | "DINNER";

export const CASH_SERVICE_LABELS: Record<CashService, string> = {
  LUNCH: "Pranzo",
  DINNER: "Cena",
};

export type CashSessionStatus = "OPEN" | "CLOSED";

export type CashMovementType = "WITHDRAWAL" | "DEPOSIT" | "EXPENSE";

export const CASH_MOVEMENT_LABELS: Record<CashMovementType, string> = {
  WITHDRAWAL: "Prelievo",
  DEPOSIT: "Versamento",
  EXPENSE: "Spesa",
};

/** Ruoli che possono aprire e chiudere la cassa (D1): mai i camerieri. */
export const CASH_OPERATOR_ROLES = ["CASHIER", "USER_ADMIN"] as const;

export function isCashOperatorRole(role: string | null | undefined): boolean {
  return (CASH_OPERATOR_ROLES as readonly string[]).includes(role ?? "");
}

/** Tagli di banconote e monete per il conteggio (in euro). */
export const CASH_DENOMINATIONS = [
  500, 200, 100, 50, 20, 10, 5, 2, 1, 0.5, 0.2, 0.1, 0.05, 0.02, 0.01,
] as const;

/** Quantità per taglio: chiave = valore del taglio come stringa ("50", "0.5"). */
export type CashBreakdown = Record<string, number>;

export function sumCashBreakdown(breakdown: CashBreakdown): number {
  let cents = 0;
  for (const [value, count] of Object.entries(breakdown)) {
    const qty = Math.max(0, Math.floor(Number(count) || 0));
    cents += Math.round(Number(value) * 100) * qty;
  }
  return cents / 100;
}

/** Sopra questa soglia (in valore assoluto) la nota di chiusura è obbligatoria (D5). */
export const DEFAULT_CASH_DISCREPANCY_NOTE_THRESHOLD = 5;

export interface CashMovement {
  id: string;
  sessionId: string;
  type: CashMovementType;
  amount: number;
  reason: string | null;
  staffId: string;
  staffName: string;
  createdAt: string;
}

export interface CashSessionTheoretical {
  /** Incassi per metodo di pagamento (documenti emessi, esclusi annullati e training). */
  byPaymentMethod: Record<string, number>;
  cashSales: number;
  posSales: number;
  totalSales: number;
  documentCount: number;
  withdrawals: number;
  deposits: number;
  expenses: number;
  openingFund: number;
  /** fondo + contanti incassati + versamenti − prelievi − spese */
  expectedCash: number;
}

export interface CashSession {
  id: string;
  businessDate: string;
  service: CashService;
  status: CashSessionStatus;
  openedByStaffId: string;
  openedByName: string;
  openedAt: string;
  openingFund: number;
  openingFundBreakdown: CashBreakdown | null;
  closedByStaffId: string | null;
  closedByName: string | null;
  closedAt: string | null;
  countedCash: number | null;
  countedCashBreakdown: CashBreakdown | null;
  posDeclared: number | null;
  closingFundLeft: number | null;
  theoretical: CashSessionTheoretical | null;
  discrepancyCash: number | null;
  discrepancyPos: number | null;
  notes: string | null;
  syncedAt: string | null;
}

export interface CashSessionSummary {
  session: CashSession;
  movements: CashMovement[];
  theoretical: CashSessionTheoretical;
  /** Conti in attesa di pagamento: bloccano la chiusura (D3). */
  pendingPayments: Array<{ requestId: string; tableLabel: string; total: number }>;
  /** Tavoli ancora aperti: non bloccano, verranno incassati nella sessione successiva (D3). */
  openTables: Array<{ tableId: string; status: string }>;
  canClose: boolean;
  discrepancyNoteThreshold: number;
}

/** Broadcast all'apertura/chiusura della cassa: il locale è operativo solo con una sessione aperta. */
export interface CashSessionStatusPayload {
  open: boolean;
  session: Pick<CashSession, "id" | "service" | "businessDate" | "openedAt" | "openedByName"> | null;
  /** Fondo lasciato dalla sessione chiusa più recente, da proporre all'apertura. */
  suggestedOpeningFund: number | null;
}
