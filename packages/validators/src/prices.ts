import { z } from "zod";

export const salesChannelSchema = z.enum(["TABLE", "TAKEAWAY", "DELIVERY"]);

export const upsertProductPriceSchema = z.object({
  productId: z.string().uuid(),
  locationId: z.string().uuid(),
  channel: salesChannelSchema,
  price: z.number().positive().nullable(),
});

export const bulkPricePercentSchema = z.object({
  locationId: z.string().uuid(),
  channel: salesChannelSchema.optional(),
  percentChange: z.number().min(-99).max(500),
});
