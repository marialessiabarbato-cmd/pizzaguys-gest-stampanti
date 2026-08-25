import { calculateLinePrice, isLinePriceValid } from "@pizzaguys/fiscal";
import { defaultCourseForCategory, defaultHoldForCourse, normalizeCourse } from "./course";
import type { CartLine, Category, MenuSnapshot, Product, VariantGroup, VariantOption, VariantSelection } from "./types";

export function localized(name: Record<string, string>) {
  return name.it ?? name.en ?? Object.values(name)[0] ?? "";
}

export function fuzzyMatch(text: string, query: string): boolean {
  const t = text.toLowerCase();
  const q = query.toLowerCase().trim();
  if (!q) return true;
  let ti = 0;
  for (const ch of q) {
    ti = t.indexOf(ch, ti);
    if (ti === -1) return false;
    ti++;
  }
  return true;
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

export function variantsForProduct(product: Product, groups: VariantGroup[]): VariantOption[] {
  const seen = new Set<string>();
  const items: VariantOption[] = [];
  for (const group of variantGroupsForProduct(product, groups)) {
    for (const variant of group.variants) {
      if (seen.has(variant.id)) continue;
      seen.add(variant.id);
      items.push(variant);
    }
  }
  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "REMOVE" ? -1 : 1;
    return localized(a.name).localeCompare(localized(b.name), "it");
  });
}

export function lineKey(
  productId: string,
  variants: VariantSelection[],
  course = 1,
  forTableId?: string,
): string {
  const sig = variants
    .map((v) => v.variantId)
    .sort()
    .join(",");
  return `${productId}:${normalizeCourse(course)}:${forTableId ?? ""}:${sig}`;
}

export function buildCartLine(
  product: Product,
  category: Category,
  channel: "TABLE" | "TAKEAWAY" | "DELIVERY",
  prices: MenuSnapshot["prices"],
  variants: VariantSelection[] = [],
  courseOverride?: number,
  forTable?: { id: string; label: string } | null,
): CartLine | { error: string } {
  const basePrice = resolvePrice(product, channel, prices);
  const unitPrice = calculateLinePrice(
    basePrice,
    variants.map((v) => ({ type: v.type, priceDelta: v.priceDelta })),
  );
  if (!isLinePriceValid(basePrice, variants.map((v) => ({ type: v.type, priceDelta: v.priceDelta })))) {
    return { error: "Prezzo riga non valido (vincolo fiscale)" };
  }
  const course = normalizeCourse(courseOverride ?? defaultCourseForCategory(category));
  return {
    lineId: crypto.randomUUID(),
    productId: product.id,
    name: localized(product.name),
    basePrice,
    unitPrice,
    quantity: 1,
    variants,
    course,
    hold: product.hold ?? defaultHoldForCourse(course, category),
    dessertDefer: product.dessert ?? category.dessert ?? false,
    allergenIds: product.allergenIds ?? [],
    ...(forTable
      ? { forTableId: forTable.id, forTableLabel: forTable.label }
      : {}),
  };
}

export function cartTotal(cart: CartLine[]): number {
  return cart.reduce((sum, l) => {
    const discount = l.discountPercent ? 1 - l.discountPercent / 100 : 1;
    return sum + l.unitPrice * l.quantity * discount;
  }, 0);
}

export function submittedTotal(lines: Array<{ quantity: number; unitPrice: number; voidedQuantity?: number }>): number {
  return lines.reduce((sum, l) => {
    const remaining = l.quantity - (l.voidedQuantity ?? 0);
    if (remaining <= 0) return sum;
    return sum + l.unitPrice * remaining;
  }, 0);
}

export function tableOrderTotal(
  cart: CartLine[],
  submitted: Array<{ quantity: number; unitPrice: number; voidedQuantity?: number }>,
): number {
  return Math.round((cartTotal(cart) + submittedTotal(submitted)) * 100) / 100;
}
