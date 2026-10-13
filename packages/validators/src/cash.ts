import { z } from "zod";

const pinSchema = z.string().regex(/^[0-9]{4}$/, "PIN di 4 cifre");
const moneySchema = z.number().min(0).max(100000);

export const cashBreakdownSchema = z.record(
  z.string().regex(/^\d+(\.\d+)?$/),
  z.number().int().min(0).max(100000),
);

/** Apertura cassa: solo operatore cassa, confermata con PIN. */
export const openCashSessionSchema = z.object({
  pin: pinSchema,
  service: z.enum(["LUNCH", "DINNER"]),
  openingFund: moneySchema,
  openingFundBreakdown: cashBreakdownSchema.optional(),
});

export const cashMovementSchema = z.object({
  pin: pinSchema,
  type: z.enum(["WITHDRAWAL", "DEPOSIT", "EXPENSE"]),
  amount: z.number().positive().max(100000),
  reason: z.string().trim().max(200).optional(),
});

export const deleteCashMovementSchema = z.object({
  pin: pinSchema,
});

/** Chiusura cassa: conteggio contanti, strisciata POS, fondo lasciato e nota. */
export const closeCashSessionSchema = z.object({
  pin: pinSchema,
  countedCash: moneySchema,
  countedCashBreakdown: cashBreakdownSchema.optional(),
  posDeclared: moneySchema,
  closingFundLeft: moneySchema,
  notes: z.string().trim().max(500).optional(),
});
