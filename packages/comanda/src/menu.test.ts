import { describe, expect, it } from "vitest";
import { cartLineKey, lineKey, mergeIntoCart, normalizeLineNote, variantsForProduct } from "./menu";
import type { CartLine, Product, VariantGroup, VariantOption, VariantSelection } from "./types";

const noBasilico: VariantSelection = { variantId: "v-bas", name: "Basilico", type: "REMOVE", priceDelta: 0 };

function line(partial: Partial<CartLine> = {}): CartLine {
  return {
    lineId: partial.lineId ?? "l1",
    productId: "arancino",
    name: "Arancino al Telefono",
    basePrice: 4,
    unitPrice: 4,
    quantity: 1,
    variants: [],
    course: 1,
    hold: false,
    dessertDefer: false,
    allergenIds: [],
    ...partial,
  };
}

describe("lineKey", () => {
  it("righe uguali senza nota hanno la stessa chiave", () => {
    expect(lineKey("p", [noBasilico], 1)).toBe(lineKey("p", [noBasilico], 1, undefined, ""));
  });

  it("la nota distingue le righe, ignorando spazi e maiuscole", () => {
    expect(lineKey("p", [], 1, undefined, "ben cotta")).not.toBe(lineKey("p", [], 1));
    expect(lineKey("p", [], 1, undefined, "ben cotta")).not.toBe(lineKey("p", [], 1, undefined, "tagliata"));
    expect(lineKey("p", [], 1, undefined, "  Ben   cotta ")).toBe(lineKey("p", [], 1, undefined, "ben cotta"));
  });
});

describe("mergeIntoCart", () => {
  it("incrementa la quantità di una riga uguale", () => {
    const { cart, lineId } = mergeIntoCart([line()], line({ lineId: "l2" }));
    expect(cart).toHaveLength(1);
    expect(cart[0]!.quantity).toBe(2);
    expect(lineId).toBe("l1");
  });

  it("non fonde una riga con nota con una senza nota", () => {
    const { cart, lineId } = mergeIntoCart([line()], line({ lineId: "l2", notes: "ALLERGIA GLUTINE" }));
    expect(cart.map((l) => l.quantity)).toEqual([1, 1]);
    expect(lineId).toBe("l2");
  });

  it("non fonde una riga senza nota con una che ha già la nota (aggiungi → Nota → aggiungi)", () => {
    const { cart } = mergeIntoCart([line({ notes: "ben cotta" })], line({ lineId: "l2" }));
    expect(cart).toHaveLength(2);
  });

  it("non fonde note diverse, fonde note uguali", () => {
    const cart = [line({ notes: "ben cotta", variants: [noBasilico] })];
    expect(mergeIntoCart(cart, line({ lineId: "l2", notes: "tagliata", variants: [noBasilico] })).cart).toHaveLength(2);
    const same = mergeIntoCart(cart, line({ lineId: "l3", notes: "ben cotta", variants: [noBasilico] }));
    expect(same.cart).toHaveLength(1);
    expect(same.cart[0]!.quantity).toBe(2);
  });

  it("cartLineKey usa la nota della riga", () => {
    expect(cartLineKey(line({ notes: "x" }))).not.toBe(cartLineKey(line()));
  });
});

describe("normalizeLineNote", () => {
  it("compatta gli spazi", () => {
    expect(normalizeLineNote("  ben \n cotta ")).toBe("ben cotta");
    expect(normalizeLineNote(undefined)).toBe("");
  });
});

describe("variantsForProduct", () => {
  const product = { id: "arancino", categoryId: "tapas" } as Product;
  const v = (id: string, groupId: string, name: string, type: VariantOption["type"] = "REMOVE"): VariantOption => ({
    id,
    groupId,
    name: { it: name },
    type,
    priceDelta: type === "ADD" ? "1.00" : "0",
  });
  const groups: VariantGroup[] = [
    { id: "g1", name: { it: "Personalizza" }, categoryIds: ["tapas"], variants: [v("a1", "g1", "Basilico"), v("a2", "g1", "Mozzarella", "ADD")] },
    { id: "g2", name: { it: "Personalizza" }, categoryIds: ["tapas"], variants: [v("b1", "g2", "basilico"), v("b2", "g2", "Basilico", "ADD")] },
    { id: "g3", name: { it: "Pizze" }, categoryIds: ["pizze"], variants: [v("c1", "g3", "Origano")] },
  ];

  it("toglie le voci doppie (stesso nome e tipo) tra gruppi della stessa categoria", () => {
    const ids = variantsForProduct(product, groups).map((x) => x.id);
    expect(ids).toEqual(["a1", "b2", "a2"]);
  });

  it("tiene la copia già selezionata su una riga salvata", () => {
    const ids = variantsForProduct(product, groups, ["b1"]).map((x) => x.id);
    expect(ids).toContain("b1");
    expect(ids).not.toContain("a1");
  });
});
