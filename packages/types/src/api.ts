import type { SalesChannel, VatRate } from "./domain.js";

/** POST /api/v2/prov/handshake */
export interface ProvHandshakeRequest {
  apiToken: string;
  edgeDeviceId: string;
}

export interface ProvHandshakeResponse {
  locationId: string;
  locationName: string;
  schemaVersion: number;
  snapshot: MenuSnapshot;
}

export interface MenuSnapshot {
  schemaVersion: number;
  categories: SnapshotCategory[];
  products: SnapshotProduct[];
  variantGroups: SnapshotVariantGroup[];
  prices: SnapshotPrice[];
  settings: Record<string, unknown>;
  invoiceCustomers?: import("./domain.js").InvoiceCustomerProfile[];
  discountPresets?: import("./domain.js").LocationDiscountPreset[];
  mealVoucherPresets?: import("./domain.js").LocationMealVoucherPreset[];
  /** Operatori sede (USER_ADMIN / CASHIER / WAITER) → staff edge */
  staff?: SnapshotStaff[];
}

export interface SnapshotStaff {
  id: string;
  firstName: string;
  lastName: string;
  role: "USER_ADMIN" | "CASHIER" | "WAITER";
  pinHash: string;
  isActive: boolean;
}

export interface SnapshotCategory {
  id: string;
  name: Record<string, string>;
  sortOrder: number;
  colorHex: string;
  defaultVatRate: VatRate;
  hardwareFlags: { hold: boolean; dessert: boolean };
}

export interface SnapshotProduct {
  id: string;
  categoryId: string;
  name: Record<string, string>;
  description?: Record<string, string>;
  basePrice: number;
  hardwareFlags: { hold: boolean; dessert: boolean };
  allergenIds: string[];
}

export interface SnapshotVariantGroup {
  id: string;
  name: Record<string, string>;
  categoryIds: string[];
  variants: SnapshotVariant[];
}

export interface SnapshotVariant {
  id: string;
  name: Record<string, string>;
  type: "ADD" | "REMOVE";
  priceDelta: number;
}

export interface SnapshotPrice {
  productId: string;
  channel: SalesChannel;
  price: number | null;
}

/** POST /api/v2/sync/daily-closure */
export interface DailyClosureSyncRequest {
  locationId: string;
  closureDate: string;
  fiscalZNumber?: number;
  totals: {
    gross: number;
    byChannel: Record<SalesChannel, number>;
    byPaymentMethod: Record<string, number>;
  };
  reconciliation: {
    cashDeclared: number;
    posDeclared: number;
    discrepancy: number;
  };
  receipts: unknown[];
}

export interface ApiErrorResponse {
  error: string;
  code: string;
  details?: unknown;
}
