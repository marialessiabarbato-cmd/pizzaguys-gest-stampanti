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

/** Metodi di pagamento */
export type PaymentMethod =
  | "CASH"
  | "POS"
  | "MEAL_VOUCHER"
  | "SATISPAY"
  | "OTHER";

/** Flag hardware predefiniti su articolo/categoria */
export interface HardwareFlags {
  hold: boolean;
  dessert: boolean;
}
