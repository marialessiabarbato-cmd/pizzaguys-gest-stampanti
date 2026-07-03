import { z } from "zod";

export const paymentSplitSchema = z.object({
  paymentMethod: z.enum(["CASH", "POS", "MEAL_VOUCHER", "SATISPAY", "OTHER"]),
  amount: z.number().positive(),
  amountReceived: z.number().positive().optional(),
});

export const createLocationMealVoucherPresetSchema = z.object({
  label: z.string().min(1).max(40),
  amount: z.number().positive().max(500),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const updateLocationMealVoucherPresetSchema = createLocationMealVoucherPresetSchema.partial();
