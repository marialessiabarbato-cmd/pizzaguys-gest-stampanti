import { z } from "zod";

export const createLocationDiscountPresetSchema = z.object({
  label: z.string().min(1).max(40),
  percent: z.number().int().min(1).max(100),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
});

export const updateLocationDiscountPresetSchema = createLocationDiscountPresetSchema.partial();

export const applyTableDiscountPresetSchema = z.object({
  percent: z.number().int().min(1).max(100),
  presetId: z.string().uuid().optional(),
  presetLabel: z.string().max(40).optional(),
  managerPin: z.string().regex(/^[0-9]{4}$/).optional(),
});
