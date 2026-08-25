import { z } from "zod";

export const pinSchema = z.string().regex(/^[0-9]{4}$/, "PIN deve essere 4 cifre");

export const superAdminLoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export const cloudUserRoleSchema = z.enum([
  "SUPER_ADMIN",
  "USER_ADMIN",
  "CASHIER",
  "WAITER",
]);

/** Creazione utente cloud (tutti i ruoli). */
export const createUserAdminSchema = z
  .object({
    email: z.string().email(),
    firstName: z.string().min(1),
    lastName: z.string().min(1),
    role: cloudUserRoleSchema.default("USER_ADMIN"),
    locationId: z.string().uuid().optional().nullable(),
    pin: pinSchema.optional(),
    password: z.string().min(8).optional(),
  })
  .superRefine((data, ctx) => {
    if (data.role === "SUPER_ADMIN") return;
    if (!data.locationId) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Sede obbligatoria per questo ruolo",
        path: ["locationId"],
      });
    }
    if (!data.pin) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "PIN obbligatorio per questo ruolo",
        path: ["pin"],
      });
    }
  });

export const updateUserAdminSchema = z.object({
  firstName: z.string().min(1).optional(),
  lastName: z.string().min(1).optional(),
  role: cloudUserRoleSchema.optional(),
  locationId: z.string().uuid().nullable().optional(),
  pin: pinSchema.optional(),
  isActive: z.boolean().optional(),
});
