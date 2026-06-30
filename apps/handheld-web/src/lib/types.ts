export interface Operator {
  id: string;
  firstName: string;
  lastName: string;
  role: string;
}

export interface LiveTable {
  id: string;
  label: string;
  x: number;
  y: number;
  width: number;
  height: number;
  defaultGuests: number;
  isVirtual: boolean;
  virtualType: string | null;
  status: import("@pizzaguys/types").TableStatus;
  lockedBy?: string;
  lockedByName?: string;
  guests?: number;
}

export interface VariantOption {
  id: string;
  groupId: string;
  name: Record<string, string>;
  type: "ADD" | "REMOVE";
  priceDelta: string;
}

export interface VariantGroup {
  id: string;
  name: Record<string, string>;
  categoryIds: string[];
  variants: VariantOption[];
}

export interface Product {
  id: string;
  categoryId: string;
  name: Record<string, string>;
  basePrice: string;
  hold?: boolean;
  dessert?: boolean;
  allergenIds?: string[];
}

export interface Category {
  id: string;
  name: Record<string, string>;
  colorHex: string;
  sortOrder: number;
  hold?: boolean;
  dessert?: boolean;
}

export interface ProductPrice {
  productId: string;
  channel: "TABLE" | "TAKEAWAY" | "DELIVERY";
  price: string | null;
}

export interface MenuSettings {
  maxDiscountPercent: number;
  tableLockTimeoutMinutes: number;
}

export interface MenuSnapshot {
  categories: Category[];
  products: Product[];
  variantGroups: VariantGroup[];
  prices: ProductPrice[];
  settings: MenuSettings;
}

export interface VariantSelection {
  variantId: string;
  name: string;
  type: "ADD" | "REMOVE";
  priceDelta: number;
}

export interface CartLine {
  lineId: string;
  productId: string;
  name: string;
  basePrice: number;
  unitPrice: number;
  quantity: number;
  variants: VariantSelection[];
  course: number;
  hold: boolean;
  dessertDefer: boolean;
  notes?: string;
  discountPercent?: number;
  discountToken?: string;
  allergenIds: string[];
}

export interface SubmittedLine {
  orderId: string;
  lineId: string;
  name: string;
  quantity: number;
  voidedQuantity?: number;
}

export type Screen = "pin" | "map" | "table";
export type WorkspaceTab = "comanda" | "menu";
