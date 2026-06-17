import { calculateLinePrice, isLinePriceValid } from "@pizzaguys/fiscal";
import type { CartLine, MenuSnapshot, Product, VariantGroup, VariantSelection } from "./order-types";

export function localized(name: Record<string, string>) {
  return name.it ?? name.en ?? Object.values(name)[0] ?? "";
}

export function resolvePrice(
  product: Product,
  channel: "TABLE" | "TAKEAWAY" | "DELIVERY",
  prices: MenuSnapshot["prices"],
): number {
  const override = prices.find((p) => p.productId === product.id && p.channel === channel);
  if (override?.price != null) return Number(override.price);
  return Number(product.basePrice);
}

export function variantGroupsForProduct(
  product: Product,
  groups: VariantGroup[],
): VariantGroup[] {
  return groups.filter(
    (g) => g.categoryIds.length === 0 || g.categoryIds.includes(product.categoryId),
  );
}

export function lineKey(productId: string, variants: VariantSelection[]): string {
  const sig = variants
    .map((v) => v.variantId)
    .sort()
    .join(",");
  return `${productId}:${sig}`;
}

export function buildCartLine(
  product: Product,
  category: { hold?: boolean; dessert?: boolean },
  channel: "TABLE" | "TAKEAWAY" | "DELIVERY",
  prices: MenuSnapshot["prices"],
  variants: VariantSelection[] = [],
  course = 1,
): CartLine | { error: string } {
  const basePrice = resolvePrice(product, channel, prices);
  const unitPrice = calculateLinePrice(
    basePrice,
    variants.map((v) => ({ type: v.type, priceDelta: v.priceDelta })),
  );
  if (!isLinePriceValid(basePrice, variants.map((v) => ({ type: v.type, priceDelta: v.priceDelta })))) {
    return { error: "Prezzo riga non valido (vincolo fiscale)" };
  }
  return {
    lineId: crypto.randomUUID(),
    productId: product.id,
    name: localized(product.name),
    basePrice,
    unitPrice,
    quantity: 1,
    variants,
    course,
    hold: product.hold ?? category.hold ?? false,
    dessertDefer: product.dessert ?? category.dessert ?? false,
    allergenIds: product.allergenIds ?? [],
  };
}

export function cartTotal(cart: CartLine[]): number {
  return cart.reduce((sum, l) => {
    const discount = l.discountPercent ? 1 - l.discountPercent / 100 : 1;
    return sum + l.unitPrice * l.quantity * discount;
  }, 0);
}
