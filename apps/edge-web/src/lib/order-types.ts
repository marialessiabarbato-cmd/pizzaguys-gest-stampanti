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

export interface MenuSnapshot {
  categories: Category[];
  products: Product[];
  variantGroups: VariantGroup[];
  prices: ProductPrice[];
  settings?: {
    maxDiscountPercent?: number;
    pinDiscountThresholdPercent?: number;
    tableLockTimeoutMinutes?: number;
  };
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
  discountPercent?: number;
  discountToken?: string;
  allergenIds: string[];
}
