import { z } from "zod";

export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, "Orario non valido (HH:MM)");

export const partnerEmailsSchema = z
  .string()
  .max(500)
  .refine(
    (value) =>
      value
        .split(",")
        .map((e) => e.trim())
        .filter(Boolean)
        .every((e) => z.string().email().safeParse(e).success),
    "Email soci non valide — separale con una virgola",
  );

export const createLocationSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().min(1).max(255),
  vatNumber: z.string().regex(/^[0-9]{11}$/, "Partita IVA non valida (11 cifre)"),
  fiscalCode: z.string().max(16).optional(),
  managerEmail: z.string().email(),
  sendClosureEmail: z.boolean().optional(),
  partnerEmails: partnerEmailsSchema.optional(),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

/** `day`: 0=Domenica … 6=Sabato (Date.getDay()). Più fasce per giorno = più turni (es. pranzo+cena). */
export const shiftReminderWindowSchema = z
  .object({
    day: z.number().int().min(0).max(6),
    start: timeOfDaySchema,
    end: timeOfDaySchema,
  })
  .refine((w) => w.start !== w.end, "Orario apertura e chiusura non possono coincidere");

export const shiftReminderScheduleSchema = z.array(shiftReminderWindowSchema).max(14);

export const updateLocationSchema = z.object({
  coverChargeAmount: z.number().min(0).max(100).optional(),
  maxGuestCapacity: z.number().int().min(0).max(10000).optional(),
  sendClosureEmail: z.boolean().optional(),
  partnerEmails: partnerEmailsSchema.optional(),
  /** Array vuoto per disattivare il promemoria apertura turno */
  shiftReminderSchedule: shiftReminderScheduleSchema.optional(),
});

export type UpdateLocationInput = z.infer<typeof updateLocationSchema>;

export const provHandshakeSchema = z.object({
  apiToken: z.string().min(32),
  edgeDeviceId: z.string().uuid(),
  schemaVersion: z.number().int().min(0).optional(),
});
