import { z } from "zod";

export const createLocationSchema = z.object({
  name: z.string().min(1).max(120),
  address: z.string().min(1).max(255),
  vatNumber: z.string().regex(/^[0-9]{11}$/, "Partita IVA non valida (11 cifre)"),
  fiscalCode: z.string().max(16).optional(),
  managerEmail: z.string().email(),
});

export type CreateLocationInput = z.infer<typeof createLocationSchema>;

export const provHandshakeSchema = z.object({
  apiToken: z.string().min(32),
  edgeDeviceId: z.string().uuid(),
  schemaVersion: z.number().int().min(0).optional(),
});
