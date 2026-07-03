/** Ruoli utente nel sistema */
export type UserRole = "SUPER_ADMIN" | "USER_ADMIN" | "CASHIER" | "WAITER" | "KITCHEN";

/** Canali di vendita commerciali */
export type SalesChannel = "TABLE" | "TAKEAWAY" | "DELIVERY";

/** Stati logici del tavolo */
export type TableStatus =
  | "FREE"
  | "OCCUPIED"
  | "LOCKED"
  | "BILL_REQUESTED"
  | "SPLIT_IN_PROGRESS";

/** Stato provisioning Main Station */
export type EdgeProvisioningStatus = "UNPROVISIONED" | "ACTIVE" | "CLOSING" | "SHIFT_CLOSED";

/** Badge connettività sede */
export type LocationHealthStatus = "ONLINE" | "OFFLINE" | "DESYNC";

/** Aliquote IVA supportate */
export type VatRate = 4 | 10 | 22;

/** Tipo documento fiscale emesso */
export type FiscalDocumentType = "RECEIPT" | "INVOICE" | "TRAINING";

/** Stato invio fattura elettronica verso SDI (mock in MVP) */
export type ElectronicInvoiceStatus = "PENDING_SEND" | "SENT_TO_SDI" | "REJECTED";

/** Dati fiscali cliente per fattura elettronica */
export interface InvoiceCustomer {
  businessName: string;
  vatNumber?: string;
  taxCode?: string;
  sdiCode?: string;
  pec?: string;
}

/** Anagrafica cliente fiscale (rubrica) */
export interface InvoiceCustomerProfile extends InvoiceCustomer {
  id: string;
  address?: string;
  postalCode?: string;
  province?: string;
  city?: string;
  country: string;
  phone?: string;
  email?: string;
  notes?: string;
  isActive?: boolean;
  source?: "CLOUD" | "LOCAL";
  createdAt?: string;
  updatedAt?: string;
}

/** Sconto rapido configurato per sede (visibile in cassa) */
export interface LocationDiscountPreset {
  id: string;
  label: string;
  percent: number;
  sortOrder: number;
  isActive: boolean;
}

/** Importo buono pasto configurato per sede (visibile in cassa) */
export interface LocationMealVoucherPreset {
  id: string;
  label: string;
  amount: number;
  sortOrder: number;
  isActive: boolean;
}

/** Metodi di pagamento */
export type PaymentMethod =
  | "CASH"
  | "POS"
  | "MEAL_VOUCHER"
  | "SATISPAY"
  | "OTHER";

/** Riga di pagamento misto (es. buono + contanti) */
export interface PaymentSplit {
  paymentMethod: PaymentMethod;
  amount: number;
  amountReceived?: number;
}

/** Flag hardware predefiniti su articolo/categoria */
export interface HardwareFlags {
  hold: boolean;
  dessert: boolean;
}
