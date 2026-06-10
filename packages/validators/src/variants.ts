import { z } from "zod";
import { localizedStringSchema } from "./menu.js";

export const createVariantGroupSchema = z.object({
  name: localizedStringSchema,
  categoryIds: z.array(z.string().uuid()).default([]),
});

export const createVariantSchema = z.object({
  groupId: z.string().uuid(),
  name: localizedStringSchema,
  type: z.enum(["ADD", "REMOVE"]),
  priceDelta: z.number().min(0),
});
