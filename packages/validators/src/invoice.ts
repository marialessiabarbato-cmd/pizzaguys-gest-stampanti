import { z } from "zod";

const VAT_NUMBER_RE = /^[0-9]{11}$/;
const TAX_CODE_RE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/i;
const SDI_CODE_RE = /^[A-Z0-9]{7}$/i;

export const invoiceCustomerSchema = z
  .object({
    businessName: z.string().min(1, "Ragione sociale obbligatoria").max(120),
    vatNumber: z
      .string()
      .regex(VAT_NUMBER_RE, "Partita IVA non valida (11 cifre)")
      .optional()
      .or(z.literal("")),
    taxCode: z
      .string()
      .regex(TAX_CODE_RE, "Codice fiscale non valido")
      .optional()
      .or(z.literal("")),
    sdiCode: z
      .string()
      .regex(SDI_CODE_RE, "Codice SDI non valido (7 caratteri)")
      .optional()
      .or(z.literal("")),
    pec: z.string().email("PEC non valida").optional().or(z.literal("")),
  })
  .transform((data) => ({
    businessName: data.businessName.trim(),
    vatNumber: data.vatNumber?.trim() || undefined,
    taxCode: data.taxCode?.trim().toUpperCase() || undefined,
    sdiCode: data.sdiCode?.trim().toUpperCase() || undefined,
    pec: data.pec?.trim().toLowerCase() || undefined,
  }))
  .refine((data) => Boolean(data.vatNumber || data.taxCode), {
    message: "Inserire Partita IVA o Codice Fiscale",
    path: ["vatNumber"],
  })
  .refine((data) => Boolean(data.sdiCode || data.pec), {
    message: "Inserire Codice SDI o indirizzo PEC",
    path: ["sdiCode"],
  });

export type InvoiceCustomerInput = z.infer<typeof invoiceCustomerSchema>;
