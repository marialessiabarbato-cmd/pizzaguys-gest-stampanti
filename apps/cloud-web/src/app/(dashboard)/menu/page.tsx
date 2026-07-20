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
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ConfirmModal } from "@/components/confirm-modal";
import { TableFilters, matchesSearch } from "@/components/TableFilters";
import { EU_ALLERGENS, SALES_CHANNELS, VAT_RATES, localizedName } from "@/lib/constants";
import { api } from "@/lib/api";
import {
  btnSize,
  formRowEndClass,
  formRowEndGap3Class,
  inputClass,
  inputCompactClass,
  inputFullClass,
  listRowClass,
  pageHeaderRowClass,
  inlineLinkClass,
  selectClass,
} from "@/lib/cloud-admin-ui";

function euro(value: number | string) {
  return `€ ${Number(value).toFixed(2).replace(".", ",")}`;
}

function variantTypeLabel(type: "ADD" | "REMOVE") {
  return type === "ADD" ? "Aggiunta" : "Rimozione";
}

function variantPriceLabel(type: "ADD" | "REMOVE", price: string | number) {
  const amount = Number(price);
  if (type === "REMOVE") return "Senza supplemento";
  return amount > 0 ? `+${euro(amount)}` : euro(0);
}

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
      className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm transition-colors ${
        selected
          ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10 ring-1 ring-[hsl(var(--pg-primary))]/40"
          : "border-[hsl(var(--pg-border))] hover:bg-[hsl(var(--pg-muted))]/40"
      }`}
    >
      <button
        type="button"
        className="cursor-grab text-xs opacity-50"
        aria-label="Trascina per riordinare"
        {...attributes}
        {...listeners}
      >
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

function CategoryCheckboxPicker({
  categories,
  selectedIds,
  onChange,
}: {
  categories: Category[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string, checked: boolean) => {
    onChange(checked ? [...selectedIds, id] : selectedIds.filter((x) => x !== id));
  };

  return (
    <div>
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-[hsl(var(--pg-muted-foreground))]">
          Categorie in cui appare in cassa
        </p>
        <div className="flex shrink-0 gap-2 text-xs">
          <button
            type="button"
            className={inlineLinkClass}
            onClick={() => onChange(categories.map((c) => c.id))}
          >
            Tutte
          </button>
          <button type="button" className={inlineLinkClass} onClick={() => onChange([])}>
            Nessuna
          </button>
        </div>
      </div>
      <div className="max-h-44 space-y-0.5 overflow-y-auto rounded-md border border-[hsl(var(--pg-border))] bg-[hsl(var(--pg-muted))]/20 p-2">
        {categories.map((c) => (
          <label
            key={c.id}
            className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1.5 text-sm hover:bg-[hsl(var(--pg-muted))]/50"
          >
            <input
              type="checkbox"
              checked={selectedIds.includes(c.id)}
              onChange={(e) => toggle(c.id, e.target.checked)}
            />
            <span
              className="h-2.5 w-2.5 shrink-0 rounded-full"
              style={{ backgroundColor: c.colorHex }}
              aria-hidden
            />
            <span className="min-w-0 truncate">{localizedName(c.name)}</span>
          </label>
        ))}
      </div>
      <p className="mt-1.5 text-xs text-[hsl(var(--pg-muted-foreground))]">
        {selectedIds.length === 0
          ? "Seleziona almeno una categoria, altrimenti il gruppo non comparirà in cassa."
          : `${selectedIds.length} ${selectedIds.length === 1 ? "categoria selezionata" : "categorie selezionate"}`}
      </p>
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
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [priceLocationId, setPriceLocationId] = useState("");
  const [bulkPercent, setBulkPercent] = useState("0");
  const [productSearch, setProductSearch] = useState("");
  const [productHoldFilter, setProductHoldFilter] = useState("");
  const [variantGroupSearch, setVariantGroupSearch] = useState("");
  const [variantOptionSearch, setVariantOptionSearch] = useState("");
  const [variantTypeFilter, setVariantTypeFilter] = useState("");
  const [priceSearch, setPriceSearch] = useState("");
  const [priceCategoryFilter, setPriceCategoryFilter] = useState("");
  const [importingVariants, setImportingVariants] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const variantImportRef = useRef<HTMLInputElement>(null);
  const [showCatForm, setShowCatForm] = useState(false);
  const [showProdForm, setShowProdForm] = useState(false);
  const [editingProductId, setEditingProductId] = useState<string | null>(null);
  const [editProdForm, setEditProdForm] = useState({
    name: "",
    basePrice: "",
    allergenIds: [] as string[],
  });
  const [showGroupForm, setShowGroupForm] = useState(false);
  const [showVariantForm, setShowVariantForm] = useState(false);
  const [editingGroupId, setEditingGroupId] = useState<string | null>(null);
  const [editGroupForm, setEditGroupForm] = useState({ name: "", categoryIds: [] as string[] });
  const [editingVariantId, setEditingVariantId] = useState<string | null>(null);
  const [editVariantForm, setEditVariantForm] = useState({
    name: "",
    type: "ADD" as "ADD" | "REMOVE",
    priceDelta: "0",
  });
  const [deleteTarget, setDeleteTarget] = useState<
    | { kind: "category"; id: string; name: string }
    | { kind: "product"; id: string; name: string }
    | { kind: "variant"; id: string; name: string }
    | { kind: "variant_group"; id: string; name: string }
    | null
  >(null);

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
    if (!selectedGroupId && groups[0]) setSelectedGroupId(groups[0].id);
    if (!priceLocationId && locs[0]) setPriceLocationId(locs[0].id);
  }, [selectedCatId, selectedGroupId, priceLocationId]);

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
    setShowCatForm(false);
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
    setShowProdForm(false);
    void load();
  };

  const startEditProduct = (product: Product) => {
    setShowProdForm(false);
    setEditingProductId(product.id);
    setEditProdForm({
      name: localizedName(product.name),
      basePrice: String(Number(product.basePrice)),
      allergenIds: [...product.allergenIds],
    });
  };

  const cancelEditProduct = () => {
    setEditingProductId(null);
    setEditProdForm({ name: "", basePrice: "", allergenIds: [] });
  };

  const saveEditProduct = async (productId: string) => {
    const price = Math.round(Number(editProdForm.basePrice) * 100) / 100;
    if (!editProdForm.name.trim() || !Number.isFinite(price) || price <= 0) return;

    await api(`/api/v2/products/${productId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: { it: editProdForm.name.trim() },
        basePrice: price,
        allergenIds: editProdForm.allergenIds,
      }),
    });
    cancelEditProduct();
    void load();
  };

  const deleteCategory = (id: string, name: string) => {
    setDeleteTarget({ kind: "category", id, name });
  };

  const deleteProduct = (id: string, name: string) => {
    setDeleteTarget({ kind: "product", id, name });
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    if (deleteTarget.kind === "category") {
      await api(`/api/v2/categories/${deleteTarget.id}`, { method: "DELETE" });
      setShowProdForm(false);
    } else if (deleteTarget.kind === "product") {
      await api(`/api/v2/products/${deleteTarget.id}`, { method: "DELETE" });
      if (editingProductId === deleteTarget.id) cancelEditProduct();
    } else if (deleteTarget.kind === "variant_group") {
      await api(`/api/v2/variant-groups/${deleteTarget.id}`, { method: "DELETE" });
      setShowVariantForm(false);
      if (editingGroupId === deleteTarget.id) cancelEditGroup();
      if (selectedGroupId === deleteTarget.id) setSelectedGroupId(null);
    } else {
      await api(`/api/v2/variants/${deleteTarget.id}`, { method: "DELETE" });
      if (editingVariantId === deleteTarget.id) cancelEditVariant();
    }
    setDeleteTarget(null);
    void load();
  };

  const createGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    await api("/api/v2/variant-groups", {
      method: "POST",
      body: JSON.stringify({ name: { it: groupForm.name }, categoryIds: groupForm.categoryIds }),
    });
    setGroupForm({ name: "", categoryIds: [] });
    setShowGroupForm(false);
    void load();
  };

  const startEditGroup = (group: VariantGroup) => {
    setShowGroupForm(false);
    setEditingGroupId(group.id);
    setEditGroupForm({
      name: localizedName(group.name),
      categoryIds: [...group.categoryIds],
    });
  };

  const cancelEditGroup = () => {
    setEditingGroupId(null);
    setEditGroupForm({ name: "", categoryIds: [] });
  };

  const saveEditGroup = async (groupId: string) => {
    if (!editGroupForm.name.trim()) return;
    await api(`/api/v2/variant-groups/${groupId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: { it: editGroupForm.name.trim() },
        categoryIds: editGroupForm.categoryIds,
      }),
    });
    cancelEditGroup();
    void load();
  };

  const createVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    const groupId = variantForm.groupId || selectedGroupId;
    if (!groupId) return;
    await api("/api/v2/variants", {
      method: "POST",
      body: JSON.stringify({
        groupId,
        name: { it: variantForm.name },
        type: variantForm.type,
        priceDelta: Math.round(Number(variantForm.priceDelta) * 100) / 100,
      }),
    });
    setVariantForm({ groupId: "", name: "", type: "ADD", priceDelta: "0" });
    setShowVariantForm(false);
    void load();
  };

  const startEditVariant = (variant: Variant) => {
    setShowVariantForm(false);
    setEditingVariantId(variant.id);
    setEditVariantForm({
      name: localizedName(variant.name),
      type: variant.type,
      priceDelta: String(Number(variant.priceDelta)),
    });
  };

  const cancelEditVariant = () => {
    setEditingVariantId(null);
    setEditVariantForm({ name: "", type: "ADD", priceDelta: "0" });
  };

  const saveEditVariant = async (variantId: string) => {
    const priceDelta = Math.round(Number(editVariantForm.priceDelta) * 100) / 100;
    if (!editVariantForm.name.trim() || !Number.isFinite(priceDelta) || priceDelta < 0) return;

    await api(`/api/v2/variants/${variantId}`, {
      method: "PATCH",
      body: JSON.stringify({
        name: { it: editVariantForm.name.trim() },
        type: editVariantForm.type,
        priceDelta,
      }),
    });
    cancelEditVariant();
    void load();
  };

  const deleteVariantGroup = (id: string, name: string) => {
    setDeleteTarget({ kind: "variant_group", id, name });
  };

  const deleteVariant = (id: string, name: string) => {
    setDeleteTarget({ kind: "variant", id, name });
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

  const selectedCategory = categories.find((c) => c.id === selectedCatId) ?? null;
  const selectedGroup = variantGroups.find((g) => g.id === selectedGroupId) ?? null;
  const groupVariants = selectedGroup?.variants ?? [];

  const filteredProducts = useMemo(() => {
    const inCategory = products.filter((p) => p.categoryId === selectedCatId);
    return inCategory.filter((p) => {
      if (!matchesSearch(localizedName(p.name), productSearch)) return false;
      if (productHoldFilter === "hold" && !p.hold) return false;
      if (productHoldFilter === "normal" && p.hold) return false;
      return true;
    });
  }, [products, selectedCatId, productSearch, productHoldFilter]);

  const filteredVariantGroups = useMemo(() => {
    return variantGroups.filter((g) =>
      matchesSearch(localizedName(g.name), variantGroupSearch),
    );
  }, [variantGroups, variantGroupSearch]);

  const filteredGroupVariants = useMemo(() => {
    return groupVariants.filter((v) => {
      if (!matchesSearch(localizedName(v.name), variantOptionSearch)) return false;
      if (variantTypeFilter && v.type !== variantTypeFilter) return false;
      return true;
    });
  }, [groupVariants, variantOptionSearch, variantTypeFilter]);

  const filteredPriceProducts = useMemo(() => {
    return products.filter((p) => {
      if (priceCategoryFilter && p.categoryId !== priceCategoryFilter) return false;
      if (!matchesSearch(localizedName(p.name), priceSearch)) return false;
      return true;
    });
  }, [products, priceSearch, priceCategoryFilter]);

  const importVariantsCsv = async (file: File) => {
    setImportingVariants(true);
    setImportMessage("");
    try {
      const csv = await file.text();
      const result = await api<{
        createdGroups: number;
        createdOptions: number;
        errors: string[];
      }>("/api/v2/variants/import", {
        method: "POST",
        body: JSON.stringify({ csv }),
      });
      setImportMessage(
        `Importati ${result.createdOptions} opzioni` +
          (result.createdGroups ? ` · ${result.createdGroups} gruppi nuovi` : "") +
          (result.errors.length ? ` · ${result.errors.length} errori` : ""),
      );
      await load();
    } catch (err) {
      setImportMessage(err instanceof Error ? err.message : "Import fallito");
    } finally {
      setImportingVariants(false);
      if (variantImportRef.current) variantImportRef.current.value = "";
    }
  };

  return (
    <div className="space-y-6">
      <div className={pageHeaderRowClass}>
        <div>
          <h1 className="text-2xl font-bold">Menu</h1>
          <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
            Categorie, prodotti, varianti e prezzi per sede. Il menu master si sincronizza verso le casse.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["catalogo", "varianti", "prezzi"] as Tab[]).map((t) => (
          <Button
            key={t}
            size={btnSize.inline}
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
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <div>
                  <CardTitle className="text-base">Categorie</CardTitle>
                  <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    {categories.length} {categories.length === 1 ? "categoria" : "categorie"}
                  </p>
                </div>
                <Button
                  size={btnSize.inline}
                  variant="outline"
                  onClick={() => setShowCatForm((open) => !open)}
                >
                  {showCatForm ? "Chiudi" : "+ Nuova"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {categories.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                    Nessuna categoria. Creane una per iniziare.
                  </p>
                ) : (
                  <>
                    <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                      Trascina per cambiare l&apos;ordine in cassa
                    </p>
                    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={onDragEnd}>
                      <SortableContext items={categories.map((c) => c.id)} strategy={verticalListSortingStrategy}>
                        {categories.map((cat) => (
                          <SortableCategory
                            key={cat.id}
                            cat={cat}
                            selected={cat.id === selectedCatId}
                            onSelect={() => {
                              setSelectedCatId(cat.id);
                              setProductSearch("");
                              cancelEditProduct();
                            }}
                          />
                        ))}
                      </SortableContext>
                    </DndContext>
                  </>
                )}
              </CardContent>
            </Card>

            {showCatForm && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Nuova categoria</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createCategory} className="space-y-2">
                    <input
                      className={inputFullClass}
                      placeholder="Nome categoria"
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
                        aria-label="Colore categoria"
                      />
                      <select
                        className={`flex-1 ${inputCompactClass}`}
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
                      Mantiene in cucina (HOLD)
                    </label>
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={catForm.dessert} onChange={(e) => setCatForm({ ...catForm, dessert: e.target.checked })} />
                      Dessert
                    </label>
                    <Button type="submit" size={btnSize.inline} className="w-full">
                      Aggiungi categoria
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {selectedCategory ? (
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base">
                      {localizedName(selectedCategory.name)}
                    </CardTitle>
                    <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                      {filteredProducts.length} di{" "}
                      {products.filter((p) => p.categoryId === selectedCatId).length}{" "}
                      {products.filter((p) => p.categoryId === selectedCatId).length === 1
                        ? "prodotto"
                        : "prodotti"}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size={btnSize.inline}
                      onClick={() => {
                        cancelEditProduct();
                        setShowProdForm((open) => !open);
                      }}
                    >
                      {showProdForm ? "Chiudi form" : "+ Prodotto"}
                    </Button>
                    <Button
                      size={btnSize.inline}
                      variant="outline"
                      className="text-red-600"
                      onClick={() =>
                        deleteCategory(selectedCatId!, localizedName(selectedCategory.name))
                      }
                    >
                      Elimina categoria
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <TableFilters
                    search={productSearch}
                    onSearchChange={setProductSearch}
                    searchPlaceholder="Cerca prodotto…"
                    filters={[
                      {
                        id: "hold",
                        label: "Tipo",
                        value: productHoldFilter,
                        onChange: setProductHoldFilter,
                        allLabel: "Tutti",
                        options: [
                          { value: "normal", label: "Normali" },
                          { value: "hold", label: "In hold" },
                        ],
                      },
                    ]}
                  />
                  {filteredProducts.map((p) => (
                    <div
                      key={p.id}
                      className={`${listRowClass(editingProductId === p.id)} rounded-md border border-[hsl(var(--pg-border))] px-3 py-2`}
                    >
                      {editingProductId === p.id ? (
                        <div className="w-full space-y-2">
                          <div className={formRowEndClass}>
                            <input
                              className={`min-w-[140px] flex-1 ${inputCompactClass}`}
                              placeholder="Nome prodotto"
                              value={editProdForm.name}
                              onChange={(e) =>
                                setEditProdForm((f) => ({ ...f, name: e.target.value }))
                              }
                            />
                            <input
                              type="number"
                              step="0.01"
                              min="0.01"
                              className={`w-24 ${inputCompactClass}`}
                              placeholder="Prezzo"
                              value={editProdForm.basePrice}
                              onChange={(e) =>
                                setEditProdForm((f) => ({ ...f, basePrice: e.target.value }))
                              }
                            />
                            <Button
                              type="button"
                              size={btnSize.list}
                              variant="outline"
                              onClick={() => void saveEditProduct(p.id)}
                            >
                              Salva
                            </Button>
                            <Button
                              type="button"
                              size={btnSize.list}
                              variant="outline"
                              onClick={cancelEditProduct}
                            >
                              Annulla
                            </Button>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {EU_ALLERGENS.map((a) => (
                              <label key={a.id} className="flex items-center gap-1 text-xs">
                                <input
                                  type="checkbox"
                                  checked={editProdForm.allergenIds.includes(a.id)}
                                  onChange={(e) => {
                                    const ids = e.target.checked
                                      ? [...editProdForm.allergenIds, a.id]
                                      : editProdForm.allergenIds.filter((id) => id !== a.id);
                                    setEditProdForm((f) => ({ ...f, allergenIds: ids }));
                                  }}
                                />
                                {a.label}
                              </label>
                            ))}
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <p className="font-medium">{localizedName(p.name)}</p>
                            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                              {euro(p.basePrice)}
                              {p.allergenIds.length > 0 &&
                                ` · ${p.allergenIds.length} ${p.allergenIds.length === 1 ? "allergene" : "allergeni"}`}
                            </p>
                          </div>
                          <span className="flex shrink-0 gap-1">
                            <Button
                              size={btnSize.list}
                              variant="outline"
                              onClick={() => startEditProduct(p)}
                            >
                              Modifica
                            </Button>
                            <Button
                              size={btnSize.list}
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => deleteProduct(p.id, localizedName(p.name))}
                            >
                              Elimina
                            </Button>
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                  {products.filter((p) => p.categoryId === selectedCatId).length === 0 && (
                    <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                      Nessun prodotto in questa categoria. Usa &quot;+ Prodotto&quot; per aggiungerne uno.
                    </p>
                  )}
                  {products.filter((p) => p.categoryId === selectedCatId).length > 0 &&
                    filteredProducts.length === 0 && (
                      <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                        Nessun prodotto corrisponde alla ricerca.
                      </p>
                    )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
                  Seleziona una categoria a sinistra per vedere i prodotti.
                </CardContent>
              </Card>
            )}

            {showProdForm && selectedCatId && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Nuovo prodotto in {selectedCategory ? localizedName(selectedCategory.name) : "categoria"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createProduct} className="space-y-3">
                    <input
                      className={inputFullClass}
                      placeholder="Nome prodotto"
                      value={prodForm.name}
                      onChange={(e) => setProdForm({ ...prodForm, name: e.target.value })}
                      required
                    />
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      className={inputFullClass}
                      placeholder="Prezzo base (€)"
                      value={prodForm.basePrice}
                      onChange={(e) => setProdForm({ ...prodForm, basePrice: e.target.value })}
                      required
                    />
                    <div>
                      <p className="mb-2 text-xs font-medium text-[hsl(var(--pg-muted-foreground))]">
                        Allergeni (opzionale)
                      </p>
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
                    </div>
                    <Button type="submit" size={btnSize.inline} disabled={!selectedCatId}>
                      Aggiungi prodotto
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      )}

      {tab === "varianti" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <TableFilters
              search={variantGroupSearch}
              onSearchChange={setVariantGroupSearch}
              searchPlaceholder="Cerca gruppo varianti…"
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                ref={variantImportRef}
                type="file"
                accept=".csv,text/csv,.xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void importVariantsCsv(file);
                }}
              />
              <Button
                size={btnSize.inline}
                variant="outline"
                disabled={importingVariants}
                onClick={() => variantImportRef.current?.click()}
              >
                {importingVariants ? "Import…" : "Importa Excel"}
              </Button>
            </div>
          </div>
          {importMessage && (
            <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">{importMessage}</p>
          )}
          <div className="grid gap-6 lg:grid-cols-[280px_1fr]">
          <div className="space-y-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between gap-2 pb-3">
                <div>
                  <CardTitle className="text-base">Gruppi</CardTitle>
                  <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                    {filteredVariantGroups.length} di {variantGroups.length}{" "}
                    {variantGroups.length === 1 ? "gruppo" : "gruppi"}
                  </p>
                </div>
                <Button
                  size={btnSize.inline}
                  variant="outline"
                  onClick={() => {
                    cancelEditGroup();
                    setShowGroupForm((open) => !open);
                  }}
                >
                  {showGroupForm ? "Chiudi" : "+ Nuovo"}
                </Button>
              </CardHeader>
              <CardContent className="space-y-2">
                {variantGroups.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                    Nessun gruppo varianti. Creane uno per iniziare.
                  </p>
                ) : filteredVariantGroups.length === 0 ? (
                  <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                    Nessun gruppo corrisponde alla ricerca.
                  </p>
                ) : (
                  filteredVariantGroups.map((g) => (
                    <div
                      key={g.id}
                      className={`rounded-md border px-3 py-2 text-sm ${
                        g.id === selectedGroupId && editingGroupId !== g.id
                          ? "border-[hsl(var(--pg-primary))] bg-[hsl(var(--pg-primary))]/10 ring-1 ring-[hsl(var(--pg-primary))]/40"
                          : "border-[hsl(var(--pg-border))]"
                      }`}
                    >
                      {editingGroupId === g.id ? (
                        <div className="w-full space-y-3">
                          <div>
                            <label className="mb-1 block text-xs text-[hsl(var(--pg-muted-foreground))]">
                              Nome gruppo
                            </label>
                            <input
                              className={`w-full ${inputCompactClass}`}
                              placeholder="es. Personalizza"
                              value={editGroupForm.name}
                              onChange={(e) =>
                                setEditGroupForm((f) => ({ ...f, name: e.target.value }))
                              }
                            />
                          </div>
                          <CategoryCheckboxPicker
                            categories={categories}
                            selectedIds={editGroupForm.categoryIds}
                            onChange={(categoryIds) =>
                              setEditGroupForm((f) => ({ ...f, categoryIds }))
                            }
                          />
                          <div className="flex justify-end gap-1">
                            <Button
                              type="button"
                              size={btnSize.list}
                              variant="outline"
                              onClick={() => void saveEditGroup(g.id)}
                            >
                              Salva
                            </Button>
                            <Button
                              type="button"
                              size={btnSize.list}
                              variant="outline"
                              onClick={cancelEditGroup}
                            >
                              Annulla
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          <button
                            type="button"
                            className="w-full text-left"
                            onClick={() => {
                              setSelectedGroupId(g.id);
                              cancelEditVariant();
                            }}
                          >
                            <p className="font-medium">{localizedName(g.name)}</p>
                            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                              {g.variants.length}{" "}
                              {g.variants.length === 1 ? "opzione" : "opzioni"} · attivo su{" "}
                              {g.categoryIds.length}{" "}
                              {g.categoryIds.length === 1 ? "categoria" : "categorie"}
                            </p>
                          </button>
                          <div className="flex justify-end gap-1">
                            <Button
                              size={btnSize.list}
                              variant="outline"
                              onClick={() => startEditGroup(g)}
                            >
                              Modifica
                            </Button>
                            <Button
                              size={btnSize.list}
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => deleteVariantGroup(g.id, localizedName(g.name))}
                            >
                              Elimina
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  ))
                )}
              </CardContent>
            </Card>

            {showGroupForm && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Nuovo gruppo</CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createGroup} className="space-y-3">
                    <input
                      className={inputFullClass}
                      placeholder="Nome gruppo (es. Personalizza)"
                      value={groupForm.name}
                      onChange={(e) => setGroupForm({ ...groupForm, name: e.target.value })}
                      required
                    />
                    <CategoryCheckboxPicker
                      categories={categories}
                      selectedIds={groupForm.categoryIds}
                      onChange={(categoryIds) => setGroupForm({ ...groupForm, categoryIds })}
                    />
                    <Button type="submit" size={btnSize.inline} className="w-full">
                      Crea gruppo
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>

          <div className="space-y-4">
            {selectedGroup ? (
              <Card>
                <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                  <div>
                    <CardTitle className="text-base">{localizedName(selectedGroup.name)}</CardTitle>
                    <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                      {groupVariants.length}{" "}
                      {groupVariants.length === 1 ? "variante" : "varianti"}
                    </p>
                  </div>
                  <Button
                    size={btnSize.inline}
                    onClick={() => {
                      cancelEditVariant();
                      setVariantForm((f) => ({ ...f, groupId: selectedGroup.id }));
                      setShowVariantForm((open) => !open);
                    }}
                  >
                    {showVariantForm ? "Chiudi form" : "+ Variante"}
                  </Button>
                </CardHeader>
                <CardContent className="space-y-2">
                  <TableFilters
                    search={variantOptionSearch}
                    onSearchChange={setVariantOptionSearch}
                    searchPlaceholder="Cerca opzione…"
                    filters={[
                      {
                        id: "type",
                        label: "Tipo",
                        value: variantTypeFilter,
                        onChange: setVariantTypeFilter,
                        options: [
                          { value: "ADD", label: "Aggiunta" },
                          { value: "REMOVE", label: "Rimozione" },
                        ],
                      },
                    ]}
                  />
                  {filteredGroupVariants.map((v) => (
                    <div
                      key={v.id}
                      className={`${listRowClass(editingVariantId === v.id)} rounded-md border border-[hsl(var(--pg-border))] px-3 py-2`}
                    >
                      {editingVariantId === v.id ? (
                        <div className="w-full space-y-2">
                          <div className={formRowEndClass}>
                            <input
                              className={`min-w-[120px] flex-1 ${inputCompactClass}`}
                              placeholder="Nome variante"
                              value={editVariantForm.name}
                              onChange={(e) =>
                                setEditVariantForm((f) => ({ ...f, name: e.target.value }))
                              }
                            />
                            <select
                              className={`w-28 ${inputCompactClass}`}
                              value={editVariantForm.type}
                              onChange={(e) =>
                                setEditVariantForm((f) => ({
                                  ...f,
                                  type: e.target.value as "ADD" | "REMOVE",
                                }))
                              }
                            >
                              <option value="ADD">Aggiunta</option>
                              <option value="REMOVE">Rimozione</option>
                            </select>
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              className={`w-24 ${inputCompactClass}`}
                              placeholder="€"
                              value={editVariantForm.priceDelta}
                              disabled={editVariantForm.type === "REMOVE"}
                              onChange={(e) =>
                                setEditVariantForm((f) => ({ ...f, priceDelta: e.target.value }))
                              }
                            />
                            <Button
                              type="button"
                              size={btnSize.list}
                              variant="outline"
                              onClick={() => void saveEditVariant(v.id)}
                            >
                              Salva
                            </Button>
                            <Button
                              type="button"
                              size={btnSize.list}
                              variant="outline"
                              onClick={cancelEditVariant}
                            >
                              Annulla
                            </Button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0">
                            <p className="font-medium">{localizedName(v.name)}</p>
                            <p className="text-xs text-[hsl(var(--pg-muted-foreground))]">
                              {variantTypeLabel(v.type)} · {variantPriceLabel(v.type, v.priceDelta)}
                            </p>
                          </div>
                          <span className="flex shrink-0 gap-1">
                            <Button
                              size={btnSize.list}
                              variant="outline"
                              onClick={() => startEditVariant(v)}
                            >
                              Modifica
                            </Button>
                            <Button
                              size={btnSize.list}
                              variant="ghost"
                              className="text-red-600"
                              onClick={() => deleteVariant(v.id, localizedName(v.name))}
                            >
                              Elimina
                            </Button>
                          </span>
                        </>
                      )}
                    </div>
                  ))}
                  {groupVariants.length === 0 && (
                    <p className="text-sm text-[hsl(var(--pg-muted-foreground))]">
                      Nessuna variante in questo gruppo. Usa &quot;+ Variante&quot; per aggiungerne una.
                    </p>
                  )}
                </CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="py-8 text-center text-sm text-[hsl(var(--pg-muted-foreground))]">
                  Seleziona un gruppo a sinistra per gestire le varianti.
                </CardContent>
              </Card>
            )}

            {showVariantForm && selectedGroupId && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">
                    Nuova variante in {selectedGroup ? localizedName(selectedGroup.name) : "gruppo"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form onSubmit={createVariant} className="space-y-2">
                    <select
                      className={`w-full ${inputCompactClass}`}
                      value={variantForm.groupId || selectedGroupId}
                      onChange={(e) => setVariantForm({ ...variantForm, groupId: e.target.value })}
                      required
                    >
                      {variantGroups.map((g) => (
                        <option key={g.id} value={g.id}>
                          {localizedName(g.name)}
                        </option>
                      ))}
                    </select>
                    <input
                      className={inputFullClass}
                      placeholder="Nome variante"
                      value={variantForm.name}
                      onChange={(e) => setVariantForm({ ...variantForm, name: e.target.value })}
                      required
                    />
                    <select
                      className={`w-full ${inputCompactClass}`}
                      value={variantForm.type}
                      onChange={(e) =>
                        setVariantForm({
                          ...variantForm,
                          type: e.target.value as "ADD" | "REMOVE",
                        })
                      }
                    >
                      <option value="ADD">Aggiunta</option>
                      <option value="REMOVE">Rimozione</option>
                    </select>
                    <input
                      type="number"
                      step="0.01"
                      min="0"
                      className={inputFullClass}
                      placeholder="Supplemento prezzo (€)"
                      value={variantForm.priceDelta}
                      disabled={variantForm.type === "REMOVE"}
                      onChange={(e) =>
                        setVariantForm({ ...variantForm, priceDelta: e.target.value })
                      }
                    />
                    <Button type="submit" size={btnSize.inline}>
                      Aggiungi variante
                    </Button>
                  </form>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
        </div>
      )}

      {tab === "prezzi" && (
        <Card>
          <CardHeader>
            <CardTitle>Matrice prezzi Sede × Canale</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <TableFilters
              search={priceSearch}
              onSearchChange={setPriceSearch}
              searchPlaceholder="Cerca prodotto…"
              filters={[
                {
                  id: "category",
                  label: "Categoria",
                  value: priceCategoryFilter,
                  onChange: setPriceCategoryFilter,
                  options: categories.map((c) => ({
                    value: c.id,
                    label: localizedName(c.name),
                  })),
                },
              ]}
            />
            <div className={formRowEndGap3Class}>
              <div>
                <label className="mb-1 block text-xs">Sede</label>
                <select
                  className={selectClass}
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
                  className={`w-24 ${inputClass}`}
                  value={bulkPercent}
                  onChange={(e) => setBulkPercent(e.target.value)}
                />
              </div>
              <Button size={btnSize.inline} onClick={applyBulkPercent}>Applica % a tutti</Button>
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
                  {filteredPriceProducts.map((p) => (
                    <tr key={p.id} className="border-b border-[hsl(var(--pg-border))]">
                      <td className="py-2 pr-4">{localizedName(p.name)}</td>
                      <td className="py-2 pr-4">€ {Number(p.basePrice).toFixed(2)}</td>
                      {SALES_CHANNELS.map((ch) => (
                          <td key={ch.id} className="py-2 pr-4">
                            <input
                              type="text"
                              inputMode="decimal"
                              className={`w-24 ${inputCompactClass} text-xs`}
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
                  {filteredPriceProducts.length === 0 && (
                    <tr>
                      <td
                        colSpan={2 + SALES_CHANNELS.length}
                        className="py-6 text-center text-[hsl(var(--pg-muted-foreground))]"
                      >
                        Nessun prodotto corrisponde ai filtri
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {deleteTarget && (
        <ConfirmModal
          title={
            deleteTarget.kind === "category"
              ? "Eliminare la categoria?"
              : deleteTarget.kind === "product"
                ? "Eliminare il prodotto?"
                : deleteTarget.kind === "variant_group"
                  ? "Eliminare il gruppo varianti?"
                  : "Eliminare la variante?"
          }
          message={
            deleteTarget.kind === "category"
              ? `Stai per eliminare "${deleteTarget.name}" e tutti i prodotti collegati. L'operazione non è reversibile.`
              : deleteTarget.kind === "product"
                ? `Stai per eliminare "${deleteTarget.name}". L'operazione non è reversibile.`
                : deleteTarget.kind === "variant_group"
                  ? `Stai per eliminare "${deleteTarget.name}" e tutte le varianti collegate. L'operazione non è reversibile.`
                  : `Stai per eliminare "${deleteTarget.name}". L'operazione non è reversibile.`
          }
          confirmLabel="Elimina"
          variant="danger"
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      )}
    </div>
  );
}
