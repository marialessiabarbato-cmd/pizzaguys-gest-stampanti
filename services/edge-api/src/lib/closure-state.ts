export interface DailyClosureRecord {
  id: string;
  closureDate: string;
  zNumber?: number;
  theoretical: {
    cash: number;
    pos: number;
    total: number;
    byPaymentMethod: Record<string, number>;
    transactionCount: number;
  };
  declared: { cash: number; pos: number };
  discrepancy: { cash: number; pos: number; total: number };
  operatorName: string;
  syncedAt?: string;
  createdAt: string;
}

let zReportToday: { zNumber: number; issuedAt: string } | null = null;
let lastClosure: DailyClosureRecord | null = null;

export function setZReportToday(zNumber: number) {
  zReportToday = { zNumber, issuedAt: new Date().toISOString() };
}

export function getZReportToday() {
  return zReportToday;
}

export function saveClosure(record: DailyClosureRecord) {
  lastClosure = record;
  zReportToday = null;
}

export function getLastClosure() {
  return lastClosure;
}

export function resetClosureSession() {
  zReportToday = null;
}
