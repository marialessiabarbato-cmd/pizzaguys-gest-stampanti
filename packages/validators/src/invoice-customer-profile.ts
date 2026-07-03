import { z } from "zod";

const VAT_NUMBER_RE = /^[0-9]{11}$/;
const TAX_CODE_RE = /^[A-Z]{6}[0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{2}[A-Z][0-9LMNPQRSTUV]{3}[A-Z]$/i;
const SDI_CODE_RE = /^[A-Z0-9]{7}$/i;

const fiscalFields = {
  businessName: z.string().min(1, "Ragione sociale obbligatoria").max(120),
  address: z.string().max(200).optional(),
  postalCode: z.string().max(10).optional(),
  province: z.string().max(4).optional(),
  city: z.string().max(80).optional(),
  country: z.string().length(2).default("IT"),
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
  phone: z.string().max(30).optional(),
  email: z.string().email("Email non valida").optional().or(z.literal("")),
  notes: z.string().max(500).optional(),
};

function normalizeFiscal(data: z.infer<z.ZodObject<typeof fiscalFields>>) {
  return {
    businessName: data.businessName.trim(),
    address: data.address?.trim() || undefined,
    postalCode: data.postalCode?.trim() || undefined,
    province: data.province?.trim().toUpperCase() || undefined,
    city: data.city?.trim() || undefined,
    country: (data.country ?? "IT").trim().toUpperCase(),
    vatNumber: data.vatNumber?.trim() || undefined,
    taxCode: data.taxCode?.trim().toUpperCase() || undefined,
    sdiCode: data.sdiCode?.trim().toUpperCase() || undefined,
    pec: data.pec?.trim().toLowerCase() || undefined,
    phone: data.phone?.trim() || undefined,
    email: data.email?.trim().toLowerCase() || undefined,
    notes: data.notes?.trim() || undefined,
  };
}

const fiscalRefines = <T extends z.ZodTypeAny>(schema: T) =>
  schema
    .refine((data: { vatNumber?: string; taxCode?: string }) => Boolean(data.vatNumber || data.taxCode), {
      message: "Inserire Partita IVA o Codice Fiscale",
      path: ["vatNumber"],
    })
    .refine((data: { sdiCode?: string; pec?: string }) => Boolean(data.sdiCode || data.pec), {
      message: "Inserire Codice SDI o indirizzo PEC",
      path: ["sdiCode"],
    });

export const createInvoiceCustomerProfileSchema = fiscalRefines(
  z.object(fiscalFields).transform(normalizeFiscal),
);

export const updateInvoiceCustomerProfileSchema = z
  .object({
    businessName: fiscalFields.businessName.optional(),
    address: fiscalFields.address,
    postalCode: fiscalFields.postalCode,
    province: fiscalFields.province,
    city: fiscalFields.city,
    country: fiscalFields.country.optional(),
    vatNumber: fiscalFields.vatNumber,
    taxCode: fiscalFields.taxCode,
    sdiCode: fiscalFields.sdiCode,
    pec: fiscalFields.pec,
    email: fiscalFields.email,
    phone: fiscalFields.phone,
    notes: fiscalFields.notes,
    isActive: z.boolean().optional(),
  })
  .partial();

export const invoiceCustomerProfileSyncSchema = createInvoiceCustomerProfileSchema.and(
  z.object({
    id: z.string().uuid(),
    updatedAt: z.string().datetime().optional(),
  }),
);
