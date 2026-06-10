import { z } from "zod";

export const vatRateSchema = z.union([z.literal(4), z.literal(10), z.literal(22)]);

export const localizedStringSchema = z.record(z.string().min(1), z.string().min(1));

export const createCategorySchema = z.object({
  name: localizedStringSchema,
  description: localizedStringSchema.optional(),
  colorHex: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  defaultVatRate: vatRateSchema,
  hold: z.boolean().default(false),
  dessert: z.boolean().default(false),
  sortOrder: z.number().int().min(0),
});

export const createProductSchema = z.object({
  categoryId: z.string().uuid(),
  name: localizedStringSchema,
  description: localizedStringSchema.optional(),
  basePrice: z.number().positive(),
  hold: z.boolean().default(false),
  dessert: z.boolean().default(false),
  allergenIds: z.array(z.string()).default([]),
  sortOrder: z.number().int().min(0).optional(),
});

export const reorderCategoriesSchema = z.object({
  ids: z.array(z.string().uuid()).min(1),
});
