import { calculateLinePrice, isLinePriceValid } from "@pizzaguys/fiscal";
import { isHeldCourse, randomId } from "@pizzaguys/types";
import { defaultCourseForCategory, normalizeCourse } from "./course";
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

/**
 * Voci variante del prodotto, senza doppioni: se più gruppi assegnati alla stessa
 * categoria hanno la stessa voce (stesso nome e tipo, es. due "Personalizza" con
 * "NO Basilico"), se ne mostra una sola. Tiene la prima trovata, salvo che un'altra
 * copia sia già tra `selectedIds` (riga salvata prima): così resta selezionabile.
 */
export function variantsForProduct(
  product: Product,
  groups: VariantGroup[],
  selectedIds: string[] = [],
): VariantOption[] {
  const seenIds = new Set<string>();
  const byName = new Map<string, number>();
  const items: VariantOption[] = [];
  for (const group of variantGroupsForProduct(product, groups)) {
    for (const variant of group.variants) {
      if (seenIds.has(variant.id)) continue;
      seenIds.add(variant.id);
      const key = `${variant.type}:${localized(variant.name).trim().toLocaleLowerCase("it-IT")}`;
      const at = byName.get(key);
      if (at == null) {
        byName.set(key, items.length);
        items.push(variant);
      } else if (selectedIds.includes(variant.id) && !selectedIds.includes(items[at]!.id)) {
        items[at] = variant;
      }
    }
  }
  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === "REMOVE" ? -1 : 1;
    return localized(a.name).localeCompare(localized(b.name), "it");
  });
}

/** Nota riga come va salvata: spazi compattati, vuota se c'è solo spazio. */
export function normalizeLineNote(note: string | undefined): string {
  return (note ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Chiave per unire righe uguali in bozza (stesso piatto, varianti, portata, tavolo e nota):
 * una riga con nota non si fonde con una senza nota o con nota diversa.
 */
export function lineKey(
  productId: string,
  variants: VariantSelection[],
  course = 1,
  forTableId?: string,
  notes?: string,
): string {
  const sig = variants
    .map((v) => v.variantId)
    .sort()
    .join(",");
  const note = normalizeLineNote(notes).toLocaleLowerCase("it-IT");
  return `${productId}:${normalizeCourse(course)}:${forTableId ?? ""}:${sig}:${note}`;
}

/** Chiave di unione di una riga già in bozza. */
export function cartLineKey(line: Pick<CartLine, "productId" | "variants" | "course" | "forTableId" | "notes">) {
  return lineKey(line.productId, line.variants, line.course, line.forTableId, line.notes);
}

/** Aggiunge la riga alla bozza, o incrementa la quantità di una riga uguale. */
export function mergeIntoCart(cart: CartLine[], line: CartLine): { cart: CartLine[]; lineId: string } {
  const key = cartLineKey(line);
  const existing = cart.find((l) => cartLineKey(l) === key);
  if (!existing) return { cart: [...cart, line], lineId: line.lineId };
  return {
    cart: cart.map((l) => (l.lineId === existing.lineId ? { ...l, quantity: l.quantity + 1 } : l)),
    lineId: existing.lineId,
  };
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
    lineId: randomId(),
    productId: product.id,
    name: localized(product.name),
    basePrice,
    unitPrice,
    quantity: 1,
    variants,
    course,
    hold: isHeldCourse(course),
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
