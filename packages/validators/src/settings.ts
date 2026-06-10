import { z } from "zod";

export const patchSettingsSchema = z.object({
  maxDiscountPercent: z.number().int().min(0).max(100).optional(),
  tableLockTimeoutMinutes: z.number().int().min(1).max(120).optional(),
  sdiEnabled: z.boolean().optional(),
  deliveryBrokers: z.array(z.string().min(1)).optional(),
});
