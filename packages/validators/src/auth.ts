import { z } from "zod";

export const pinSchema = z.string().regex(/^[0-9]{4}$/, "PIN deve essere 4 cifre");

export const superAdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const createUserAdminSchema = z.object({
  email: z.string().email(),
  firstName: z.string().min(1),
  lastName: z.string().min(1),
  locationId: z.string().uuid(),
  pin: pinSchema,
  password: z.string().min(8).optional(),
});

export const updateUserAdminSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  pin: pinSchema.optional(),
  isActive: z.boolean().optional(),
});
