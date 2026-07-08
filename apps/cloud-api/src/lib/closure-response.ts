import type { dailyClosures } from "@pizzaguys/db/schema";
import { extractDailyReportFromReceipts } from "@pizzaguys/types";

type ClosureRow = typeof dailyClosures.$inferSelect;

export function formatClosureResponse(row: ClosureRow, locationName: string) {
  return {
    id: row.id,
    locationId: row.locationId,
    locationName,
    closureDate: row.closureDate,
    fiscalZNumber: row.fiscalZNumber,
    gross: Number(row.gross),
    cashDeclared: Number(row.cashDeclared),
    posDeclared: Number(row.posDeclared),
    discrepancy: Number(row.discrepancy),
    byChannel: row.byChannel,
    byPaymentMethod: row.byPaymentMethod,
    receivedAt: row.receivedAt,
    createdAt: row.createdAt,
    dailyReport: extractDailyReportFromReceipts(row.receipts as unknown[]),
  };
}
