"use client";

import {
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Button, Card, CardContent, CardHeader, CardTitle } from "@pizzaguys/ui";
import { useCallback, useEffect, useState } from "react";
import { EU_ALLERGENS, SALES_CHANNELS, VAT_RATES, localizedName } from "@/lib/constants";
import { api } from "@/lib/api";

function priceFieldKey(productId: string, channel: string) {
  return `${productId}:${channel}`;
}

function formatEuroField(price: number | null | undefined): string {
  if (price == null) return "";
  return price.toFixed(2).replace(".", ",");
}

function parseEuroField(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const normalized = trimmed.replace(/\s/g, "").replace(",", ".");
  const n = Number.parseFloat(normalized);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

interface Category {
  id: string;
  name: Record<string, string>;
  colorHex: string;
  defaultVatRate: number;
  hold: boolean;
  dessert: boolean;
  sortOrder: number;
}

interface Product {
  id: string;
  categoryId: string;
  name: Record<string, string>;
  basePrice: string;
  hold: boolean;
  dessert: boolean;
  allergenIds: string[];
}

interface VariantGroup {
  id: string;
  name: Record<string, string>;
  categoryIds: string[];
  variants: Variant[];
}

interface Variant {
  id: string;
  groupId: string;
  name: Record<string, string>;
  type: "ADD" | "REMOVE";
  priceDelta: string;
}

interface Location {
  id: string;
  name: string;
}

interface ProductPrice {
  id: string;
  productId: string;
  locationId: string;
  channel: string;
  price: string | null;
}

type Tab = "catalogo" | "varianti" | "prezzi";

function SortableCategory({
  cat,
  selected,
  onSelect,
}: {
  cat: Category;
  selected: boolean;
  onSelect: () => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: cat.id });
  const style = { transform: CSS.Transform.toString(transform), transition };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${
        selected ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-muted))]" : "border-[hsl(var(--pg-border))]"
      }`}
    >
      <button type="button" className="cursor-grab text-xs opacity-50" {...attributes} {...listeners}>
        ⋮⋮
      </button>
      <button
        type="button"
        className="flex flex-1 items-center gap-2 text-left"
        onClick={onSelect}
      >
        <span
          className="h-3 w-3 rounded-full"
          style={{ backgroundColor: cat.colorHex }}
        />
        {localizedName(cat.name)}
      </button>
    </div>
  );
}

export default function MenuPage() {
  const [tab, setTab] = useState<Tab>("catalogo");
  const [categories, setCategories] = useState<Category[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [variantGroups, setVariantGroups] = useState<VariantGroup[]>([]);
  const [locations, setLocations] = useState<Location[]>([]);
  const [prices, setPrices] = useState<ProductPrice[]>([]);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, string>>({});
  const [selectedCatId, setSelectedCatId] = useState<string | null>(null);
  const [priceLocationId, setPriceLocationId] = useState("");
  const [bulkPercent, setBulkPercent] = useState("0");

  const [catForm, setCatForm] = useState({
    name: "",
    colorHex: "#E63946",
    defaultVatRate: 10,
    hold: false,
    dessert: false,
  });
  const [prodForm, setProdForm] = useState({
    name: "",
    basePrice: "",
    allergenIds: [] as string[],
  });
  const [groupForm, setGroupForm] = useState({ name: "", categoryIds: [] as string[] });
  const [variantForm, setVariantForm] = useState({
    groupId: "",
    name: "",
    type: "ADD" as "ADD" | "REMOVE",
    priceDelta: "0",
  });

  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const load = useCallback(async () => {
    const [cats, prods, groups, locs] = await Promise.all([
      api<Category[]>("/api/v2/categories"),
      api<Product[]>("/api/v2/products"),
      api<VariantGroup[]>("/api/v2/variant-groups"),
      api<Location[]>("/api/v2/locations"),
    ]);
    setCategories(cats);
    setProducts(prods);
    setVariantGroups(groups);
    setLocations(locs);
    if (!selectedCatId && cats[0]) setSelectedCatId(cats[0].id);
    if (!priceLocationId && locs[0]) setPriceLocationId(locs[0].id);
  }, [selectedCatId, priceLocationId]);

  const loadPrices = useCallback(async () => {
    if (!priceLocationId) return;
    const rows = await api<ProductPrice[]>(`/api/v2/product-prices?locationId=${priceLocationId}`);
    setPrices(rows);
  }, [priceLocationId]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (tab === "prezzi") void loadPrices();
  }, [tab, loadPrices]);

  useEffect(() => {
    setPriceDrafts({});
  }, [priceLocationId]);

  const onDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);
    await api("/api/v2/categories/reorder", {
      method: "POST",
      body: JSON.stringify({ ids: reordered.map((c) => c.id) }),
    });
  };

  const createCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    await api("/api/v2/categories", {
      method: "POST",
      body: JSON.stringify({
        name: { it: catForm.name },
        colorHex: catForm.colorHex,
        defaultVatRate: catForm.defaultVatRate,
        hold: catForm.hold,
        dessert: catForm.dessert,
        sortOrder: categories.length,
      }),
    });
    setCatForm({ name: "", colorHex: "#E63946", defaultVatRate: 10, hold: false, dessert: false });
    void load();
  };

  const createProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCatId) return;
    await api("/api/v2/products", {
      method: "POST",
      body: JSON.stringify({
        categoryId: selectedCatId,
        name: { it: prodForm.name },
        basePrice: Number(prodForm.basePrice),
        allergenIds: prodForm.allergenIds,
      }),
    });
    setProdForm({ name: "", basePrice: "", allergenIds: [] });
    void load();
  };

  const deleteCategory = async (id: string) => {
    if (!confirm("Eliminare la categoria e i prodotti collegati?")) return;
    await api(`/api/v2/categories/${id}`, { method: "DELETE" });
    void load();
  };

  const deleteProduct = async (id: string) => {
    if (!confirm("Eliminare il prodotto?")) return;
    await api(`/api/v2/products/${id}`, { method: "DELETE" });
    void load();
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    await api("/api/v2/variant-groups", {
      method: "POST",
      body: JSON.stringify({ name: { it: groupForm.name }, categoryIds: groupForm.categoryIds }),
    });
    setGroupForm({ name: "", categoryIds: [] });
    void load();
  };

  const createVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    await api("/api/v2/variants", {
      method: "POST",
      body: JSON.stringify({
        groupId: variantForm.groupId,
        name: { it: variantForm.name },
        type: variantForm.type,
        priceDelta: Number(variantForm.priceDelta),
      }),
    });
    setVariantForm({ groupId: "", name: "", type: "ADD", priceDelta: "0" });
    void load();
  };

  const getPrice = (productId: string, channel: string) => {
    const row = prices.find((p) => p.productId === productId && p.channel === channel);
    return row?.price != null ? Number(row.price) : null;
  };

  const getPriceFieldValue = (productId: string, channel: string) => {
    const key = priceFieldKey(productId, channel);
    if (key in priceDrafts) return priceDrafts[key] ?? "";
    return formatEuroField(getPrice(productId, channel));
  };

  const setPriceDraft = (productId: string, channel: string, value: string) => {
    const key = priceFieldKey(productId, channel);
    setPriceDrafts((prev) => ({ ...prev, [key]: value }));
  };

  const commitPrice = async (productId: string, channel: string) => {
    const key = priceFieldKey(productId, channel);
    const raw = priceDrafts[key];
    if (raw === undefined) return;

    const price = parseEuroField(raw);
    if (raw.trim() !== "" && price === null) return;

    await api("/api/v2/product-prices", {
      method: "PUT",
      body: JSON.stringify({ productId, locationId: priceLocationId, channel, price }),
    });
    setPriceDrafts((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
    void loadPrices();
  };

  const applyBulkPercent = async () => {
    await api("/api/v2/product-prices/bulk-percent", {
      method: "POST",
      body: JSON.stringify({
        locationId: priceLocationId,
        percentChange: Number(bulkPercent),
      }),
    });
    void loadPrices();
  };

  const filteredProducts = products.filter((p) => p.categoryId === selectedCatId);

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Master Menu Builder</h1>

      <div className="flex gap-2">
        {(["catalogo", "varianti", "prezzi"] as Tab[]).map((t) => (
          <Button
            key={t}
            variant={tab === t ? "default" : "outline"}
            onClick={() => setTab(t)}
          >
            {t === "catalogo" ? "Catalogo" : t === "varianti" ? "Varianti" : "Prezzi"}
          </Button>
        ))}
      </div>

      {tab === "catalogo" && (
        <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Categorie</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                  <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                    {categories.map((cat) => (
                      <SortableCategory
                        key={cat.id}
                        cat={cat}
                        selected={cat.id === selectedCatId}
                        onSelect={() => setSelectedCatId(cat.id)}
                      />
                    ))}
                  </SortableContext>
                </DndContext>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Nuova categoria</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={createCategory} className="space-y-2">
                  <input
                    className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
                    placeholder="Nome"
                    value={catForm.name}
                    onChange={(e) => setCatForm({ ...catForm, name: e.target.value })}
                    required
                  />
                  <div className="flex gap-2">
                    <input
                      type="color"
                      value={catForm.colorHex}
                      onChange={(e) => setCatForm({ ...catForm, colorHex: e.target.value })}
                      className="h-10 w-14"
                    />
                    <select
                      className="flex-1 rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 text-sm"
                      value={catForm.defaultVatRate}
                      onChange={(e) => setCatForm({ ...catForm, defaultVatRate: Number(e.target.value) })}
                    >
                      {VAT_RATES.map((v) => (
                        <option key={v} value={v}>IVA {v}%</option>
                      ))}
                    </select>
                  </div>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={catForm.hold} onChange={(e) => setCatForm({ ...catForm, hold: e.target.checked })} />
                    HOLD
                  </label>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={catForm.dessert} onChange={(e) => setCatForm({ ...catForm, dessert: e.target.checked })} />
                    X DOLCE
                  </label>
                  <Button type="submit" className="w-full">Aggiungi</Button>
                </form>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-4">
            {selectedCatId && (
              <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                  <CardTitle className="text-base">Prodotti</CardTitle>
                  <Button variant="outline" onClick={() => deleteCategory(selectedCatId)}>
                    Elimina categoria
                  </Button>
                </CardHeader>
                <CardContent className="space-y-3">
                  {filteredProducts.map((p) => (
                    <div key={p.id} className="flex items-center justify-between rounded border border-[hsl(var(--pg-border))] px-3 py-2">
                      <div>
                        <p className="font-medium">{localizedName(p.name)}</p>
                        <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                          € {Number(p.basePrice).toFixed(2)}
                          {p.allergenIds.length > 0 && ` · ${p.allergenIds.length} allergeni`}
                        </p>
                      </div>
                      <Button variant="ghost" onClick={() => deleteProduct(p.id)}>Elimina</Button>
                    </div>
                  ))}
                  {filteredProducts.length === 0 && (
                    <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">Nessun prodotto in questa categoria.</p>
                  )}
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Nuovo prodotto</CardTitle>
              </CardHeader>
              <CardContent>
                <form onSubmit={createProduct} className="space-y-3">
                  <input
                    className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
                    placeholder="Nome prodotto"
                    value={prodForm.name}
                    onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                    required
                  />
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
                    placeholder="Prezzo base €"
                    value={prodForm.basePrice}
                    onChange={(e) => setProdForm({ ...prodForm, basePrice: e.target.value })}
                    required
                  />
                  <div className="flex flex-wrap gap-2">
                    {EU_ALLERGENS.map((a) => (
                      <label key={a.id} className="flex items-center gap-1 text-xs">
                        <input
                          type="checkbox"
                          checked={prodForm.allergenIds.includes(a.id)}
                          onChange={(e) => {
                            const ids = e.target.checked
                              ? [...prodForm.allergenIds, a.id]
                              : prodForm.allergenIds.filter((id) => id !== a.id);
                            setProdForm({ ...prodForm, allergenIds: ids });
                          }}
                        />
                        {a.label}
                      </label>
                    ))}
                  </div>
                  <Button type="submit" disabled={!selectedCatId}>Aggiungi prodotto</Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      )}

      {tab === "varianti" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card>
            <CardHeader>
              <CardTitle>Gruppi varianti</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {variantGroups.map((g) => (
                <div key={g.id} className="rounded border border-[hsl(var(--pg-border))] p-3">
                  <p className="font-medium">{localizedName(g.name)}</p>
                  <ul className="mt-2 space-y-1 text-sm">
                    {g.variants.map((v) => (
                      <li key={v.id} className="flex justify-between">
                        <span>{localizedName(v.name)} ({v.type})</span>
                        <span>+€ {Number(v.priceDelta).toFixed(2)}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <form onSubmit={createGroup} className="space-y-2 border-t pt-4">
                <input
                  className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
                  placeholder="Nome gruppo"
                  value={groupForm.name}
                  onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                  required
                />
                <select
                  multiple
                  className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 py-2 text-sm"
                  value={groupForm.categoryIds}
                  onChange={(e) =>
                    setGroupForm({
                      ...groupForm,
                      categoryIds: Array.from(e.target.selectedOptions, (o) => o.value),
                    })
                  }
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{localizedName(c.name)}</option>
                  ))}
                </select>
                <Button type="submit">Crea gruppo</Button>
              </form>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nuova variante</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={createVariant} className="space-y-2">
                <select
                  className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 py-2 text-sm"
                  value={variantForm.groupId}
                  onChange={(e) => setVariantForm({ ...variantForm, groupId: e.target.value })}
                  required
                >
                  <option value="">Seleziona gruppo</option>
                  {variantGroups.map((g) => (
                    <option key={g.id} value={g.id}>{localizedName(g.name)}</option>
                  ))}
                </select>
                <input
                  className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
                  placeholder="Nome variante"
                  value={variantForm.name}
                  onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
                  required
                />
                <select
                  className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-2 py-2 text-sm"
                  value={variantForm.type}
                  onChange={(e) => setVariantForm({ ...variantForm, type: e.target.value as "ADD" | "REMOVE" })}
                >
                  <option value="ADD">Aggiunta</option>
                  <option value="REMOVE">Rimozione</option>
                </select>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  className="w-full rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
                  placeholder="Delta prezzo €"
                  value={variantForm.priceDelta}
                  onChange={(e) => setVariantForm({ ...variantForm, priceDelta: e.target.value })}
                />
                <Button type="submit">Aggiungi variante</Button>
              </form>
            </CardContent>
          </Card>
        </div>
      )}

      {tab === "prezzi" && (
        <Card>
          <CardHeader>
            <CardTitle>Matrice prezzi Sede × Canale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-end gap-3">
              <div>
                <label className="mb-1 block text-xs">Sede</label>
                <select
                  className="rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
                  value={priceLocationId}
                  onChange={(e) => setPriceLocationId(e.target.value)}
                >
                  {locations.map((l) => (
                    <option key={l.id} value={l.id}>{l.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-xs">Bulk %</label>
                <input
                  type="number"
                  className="w-24 rounded-md border border-[hsl(var(--pg-border))] bg-transparent px-3 py-2 text-sm"
                  value={bulkPercent}
                  onChange={(e) => setBulkPercent(e.target.value)}
                />
              </div>
              <Button onClick={applyBulkPercent}>Applica % a tutti</Button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[hsl(var(--pg-border))] text-left">
                    <th className="py-2 pr-4">Prodotto</th>
                    <th className="py-2 pr-4">Base</th>
                    {SALES_CHANNELS.map((ch) => (
                      <th key={ch.id} className="py-2 pr-4">{ch.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-[hsl(var(--pg-border))]">
                      <td className="py-2 pr-4">{localizedName(p.name)}</td>
                      <td className="py-2 pr-4">€ {Number(p.basePrice).toFixed(2)}</td>
                      {SALES_CHANNELS.map((ch) => (
                          <td key={ch.id} className="py-2 pr-4">
                            <input
                              type="text"
                              inputMode="decimal"
                              className="w-24 rounded border border-[hsl(var(--pg-border))] bg-transparent px-2 py-1 text-xs"
                              placeholder={formatEuroField(Number(p.basePrice))}
                              value={getPriceFieldValue(p.id, ch.id)}
                              onChange={(e) => setPriceDraft(p.id, ch.id, e.target.value)}
                              onBlur={() => void commitPrice(p.id, ch.id)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur();
                              }}
                            />
                          </td>
                        ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
