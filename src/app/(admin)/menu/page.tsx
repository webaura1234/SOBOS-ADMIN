"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, FilterBar, BulkActionBar, PageHeader, StatusDot, TabBar, ChipFilter, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { ConfirmDialog, FormField, inputClass, selectClass, exportCsv } from "@/components/ui/forms";
import { formatCurrency, cn } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { useDebouncedValue } from "@/lib/use-debounce";
import { useApp } from "@/lib/context";
import { format } from "date-fns";
import { Plus, Download, Trash2, Save, ChevronUp, ChevronDown, AlertTriangle, History } from "lucide-react";

const DIETARY_FLAGS = ["veg", "non-veg", "vegan", "jain", "gluten-free", "contains-egg"];
const ALLERGENS = ["nuts", "dairy", "gluten", "soy", "shellfish", "egg", "mustard"];
const TAX_CATEGORIES = ["GST_5", "GST_12", "GST_18", "GST_28"];

interface RecipeLine { id?: string; ingredientId: string; quantity: number; unit: string; ingredient?: { id: string; name: string; unit: string }; }
interface Variant { id?: string; label: string; price: number; recipeNote?: string | null; }
interface ModifierOption { id?: string; label: string; priceDelta: number; }
interface ModifierGroup { id?: string; name: string; required: boolean; minSelect: number; maxSelect: number; options: ModifierOption[]; }
interface Substitution { id?: string; primaryIngredientId: string; primaryName: string; substituteIngredientId: string; substituteName: string; ratio: number; requiresApproval: boolean; }
interface Snapshot { id: string; version: number; recipeCost: number; ingredientsJson: string; createdAt: string; }
interface MenuItem {
  id: string; name: string; description?: string | null; categoryId?: string | null; category: { id: string; name: string } | null;
  basePrice: number; locationPrice: number | null; recipeCost: number; grossMargin: number; marginAlertThreshold: number | null;
  availability: string; autoOutOfStock: boolean; unitsSold: number; prepTime: number | null; taxCategory: string;
  dietaryFlags: string; allergenTags: string; photos: string;
  variants: Variant[]; modifierGroups: ModifierGroup[]; substitutions: Substitution[];
  recipe?: { id: string; version: number; ingredients: RecipeLine[]; snapshots: Snapshot[] } | null;
}
interface IngredientOption { id: string; name: string; unit: string; }
interface Category { id: string; name: string; parentId: string | null; displayOrder: number; dietaryTag: string | null; icon: string | null; hiddenLocations: string; _count?: { items: number }; }
interface Seasonal { id: string; name: string; itemId: string | null; categoryId: string | null; startDate: string; endDate: string; recurring: boolean; active: boolean; }

const parseJson = (s: string | null | undefined): string[] => { try { return s ? JSON.parse(s) : []; } catch { return []; } };

const emptyForm = {
  name: "", description: "", categoryId: "", basePrice: 0, locationPrice: "" as number | "", recipeCost: 0,
  marginAlertThreshold: "" as number | "", prepTime: 0, taxCategory: "GST_5", availability: "available",
  dietaryFlags: [] as string[], allergenTags: [] as string[], photos: [] as string[],
};

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-32 bg-cream rounded-xl" />}>
      <MenuPageContent />
    </Suspense>
  );
}

function MultiToggle({ options, selected, onToggle }: { options: string[]; selected: string[]; onToggle: (v: string) => void }) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((o) => (
        <button key={o} type="button" onClick={() => onToggle(o)}
          className={cn("px-3 py-1.5 rounded-lg text-sm font-bold border-2 focus-ring capitalize",
            selected.includes(o) ? "bg-primary border-primary text-black" : "border-border bg-white text-muted hover:bg-cream")}>
          {o}
        </button>
      ))}
    </div>
  );
}

function MenuPageContent() {
  const { toast } = useToast();
  const { locations } = useApp();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [ingredients, setIngredients] = useState<IngredientOption[]>([]);
  const [seasonal, setSeasonal] = useState<Seasonal[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [tab, setTab] = useState("items");
  const [dietaryFilter, setDietaryFilter] = useState("");
  const [availFilter, setAvailFilter] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<MenuItem | null>(null);
  const [drawerTab, setDrawerTab] = useState("details");
  const [form, setForm] = useState(emptyForm);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [recipeLines, setRecipeLines] = useState<RecipeLine[]>([]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [modifierGroups, setModifierGroups] = useState<ModifierGroup[]>([]);
  const [substitutions, setSubstitutions] = useState<Substitution[]>([]);
  const [showVersions, setShowVersions] = useState(false);

  // Category editor state
  const [catDraft, setCatDraft] = useState({ name: "", parentId: "", dietaryTag: "", icon: "" });
  const [editingCat, setEditingCat] = useState<Category | null>(null);
  const [catReassign, setCatReassign] = useState<Category | null>(null);
  const [reassignTo, setReassignTo] = useState("uncategorized");

  // Seasonal editor state
  const [seasonalForm, setSeasonalForm] = useState({ name: "", itemId: "", categoryId: "", startDate: "", endDate: "", recurring: false });
  const [previewDate, setPreviewDate] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    if (dietaryFilter) params.set("dietary", dietaryFilter);
    if (availFilter) params.set("availability", availFilter);
    const data = await apiFetch<{ items: MenuItem[]; categories: Category[]; ingredients: IngredientOption[]; seasonal: Seasonal[] }>(`/api/menu?${params}`);
    setItems(data.items ?? []);
    setCategories(data.categories ?? []);
    setIngredients(data.ingredients ?? []);
    setSeasonal(data.seasonal ?? []);
  }, [debouncedSearch, dietaryFilter, availFilter]);

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [load, toast]);

  const openCreate = useCallback(() => {
    setCreating(true); setDetail(null); setForm(emptyForm);
    setRecipeLines([]); setVariants([]); setModifierGroups([]); setSubstitutions([]); setDrawerTab("details");
  }, []);

  const openEdit = useCallback((item: MenuItem) => {
    setCreating(false); setDetail(item);
    setForm({
      name: item.name, description: item.description ?? "", categoryId: item.categoryId ?? "",
      basePrice: item.basePrice, locationPrice: item.locationPrice ?? "", recipeCost: item.recipeCost,
      marginAlertThreshold: item.marginAlertThreshold ?? "", prepTime: item.prepTime ?? 0,
      taxCategory: item.taxCategory, availability: item.availability,
      dietaryFlags: parseJson(item.dietaryFlags), allergenTags: parseJson(item.allergenTags), photos: parseJson(item.photos),
    });
    setRecipeLines(
      (Array.isArray(item.recipe?.ingredients) ? item.recipe.ingredients : []).map((l) => ({
        id: l.id,
        ingredientId: l.ingredientId,
        quantity: l.quantity,
        unit: l.unit || l.ingredient?.unit || "",
        ingredient: l.ingredient,
      })),
    );
    setVariants((item.variants ?? []).map((v) => ({ ...v })));
    setModifierGroups(
      (item.modifierGroups ?? []).map((g) => ({
        ...g,
        options: (g.options ?? []).map((o) => ({ ...o })),
      })),
    );
    setSubstitutions((item.substitutions ?? []).map((s) => ({ ...s })));
    setDrawerTab("details");
  }, []);

  useEffect(() => {
    if (searchParams.get("action") === "create") openCreate();
    const openId = searchParams.get("open");
    if (openId && items.length > 0) { const item = items.find((i) => i.id === openId); if (item) openEdit(item); }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, items.length]);

  const saveItem = async () => {
    try {
      if (!form.name.trim()) { toast("Name is required", "error"); return; }
      if (Number(form.basePrice) === 0 && !confirm("Base price is ₹0. Save anyway?")) return;
      const payload = {
        ...form,
        categoryId: form.categoryId || null,
        basePrice: Number(form.basePrice),
        locationPrice: form.locationPrice === "" ? null : Number(form.locationPrice),
        recipeCost: Number(form.recipeCost),
        marginAlertThreshold: form.marginAlertThreshold === "" ? null : Number(form.marginAlertThreshold),
        prepTime: Number(form.prepTime) || null,
        recipeIngredients: recipeLines.filter((l) => l.ingredientId && Number(l.quantity) > 0).map((l) => ({ ingredientId: l.ingredientId, quantity: Number(l.quantity), unit: l.unit })),
        variants, modifierGroups, substitutions,
      };
      if (creating) { await apiFetch("/api/menu", { method: "POST", body: JSON.stringify(payload) }); toast("Menu item created"); }
      else if (detail) { await apiFetch("/api/menu", { method: "PATCH", body: JSON.stringify({ id: detail.id, ...payload }) }); toast("Menu item updated"); }
      setCreating(false); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Save failed", "error"); }
  };

  const deleteItems = async (ids: string[], reason?: string) => {
    try {
      await apiFetch(`/api/menu?ids=${ids.join(",")}&reason=${encodeURIComponent(reason ?? "No reason provided")}`, { method: "DELETE" });
      toast(`Deleted ${ids.length} item(s)`); setSelected(new Set()); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Delete failed", "error"); }
  };

  const bulkStatus = async (status: string) => {
    try {
      await apiFetch("/api/menu", { method: "PATCH", body: JSON.stringify({ ids: [...selected], bulkAvailability: status }) });
      toast(`Updated ${selected.size} items`); setSelected(new Set()); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Update failed", "error"); }
  };

  // ── Categories ──
  const addCategory = async () => {
    if (!catDraft.name.trim()) return;
    try {
      await apiFetch("/api/menu/categories", { method: "POST", body: JSON.stringify({ name: catDraft.name, parentId: catDraft.parentId || null, dietaryTag: catDraft.dietaryTag || null, icon: catDraft.icon || null }) });
      toast("Category created"); setCatDraft({ name: "", parentId: "", dietaryTag: "", icon: "" }); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const saveCategory = async () => {
    if (!editingCat) return;
    try {
      await apiFetch("/api/menu/categories", { method: "PATCH", body: JSON.stringify({ id: editingCat.id, name: editingCat.name, parentId: editingCat.parentId || null, dietaryTag: editingCat.dietaryTag || null, icon: editingCat.icon || null }) });
      toast("Category saved"); setEditingCat(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const moveCategory = async (cat: Category, dir: -1 | 1) => {
    const siblings = categories.filter((c) => c.parentId === cat.parentId).sort((a, b) => a.displayOrder - b.displayOrder);
    const idx = siblings.findIndex((c) => c.id === cat.id);
    const swap = siblings[idx + dir];
    if (!swap) return;
    try {
      await apiFetch("/api/menu/categories", { method: "PATCH", body: JSON.stringify({ order: [{ id: cat.id, displayOrder: swap.displayOrder, parentId: cat.parentId }, { id: swap.id, displayOrder: cat.displayOrder, parentId: cat.parentId }] }) });
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const deleteCategory = async () => {
    if (!catReassign) return;
    try {
      await apiFetch(`/api/menu/categories?id=${catReassign.id}&reassignTo=${reassignTo}`, { method: "DELETE" });
      toast("Category deleted, items reassigned"); setCatReassign(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  // ── Seasonal ──
  const addSeasonal = async () => {
    if (!seasonalForm.name.trim() || !seasonalForm.startDate || !seasonalForm.endDate) { toast("Name, start and end dates required", "error"); return; }
    try {
      await apiFetch("/api/menu", { method: "POST", body: JSON.stringify({ type: "seasonal", ...seasonalForm, itemId: seasonalForm.itemId || null, categoryId: seasonalForm.categoryId || null }) });
      toast("Seasonal schedule added"); setSeasonalForm({ name: "", itemId: "", categoryId: "", startDate: "", endDate: "", recurring: false }); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const deleteSeasonal = async (id: string) => {
    try { await apiFetch(`/api/menu?seasonalId=${id}`, { method: "DELETE" }); toast("Schedule removed"); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const exportItems = () => {
    exportCsv("menu-items.csv", ["Name", "Category", "Price", "Cost", "Margin", "Status", "Sold"],
      items.map((i) => [i.name, i.category?.name ?? "", i.basePrice, i.recipeCost, i.grossMargin, i.availability, i.unitsSold]));
    toast("Exported to CSV");
  };

  const addRecipeLine = () => { const f = ingredients[0]; setRecipeLines([...recipeLines, { ingredientId: f?.id ?? "", quantity: 1, unit: f?.unit ?? "" }]); };
  const updateRecipeLine = (i: number, patch: Partial<RecipeLine>) => setRecipeLines(recipeLines.map((l, idx) => {
    if (idx !== i) return l; const next = { ...l, ...patch };
    if (patch.ingredientId) next.unit = ingredients.find((x) => x.id === patch.ingredientId)?.unit ?? next.unit;
    return next;
  }));

  const liveMargin = form.basePrice > 0 ? ((form.basePrice - form.recipeCost) / form.basePrice) * 100 : 0;
  const marginBelow = form.marginAlertThreshold !== "" && liveMargin < Number(form.marginAlertThreshold);

  const sorted = [...items].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[sortKey]; const bv = (b as unknown as Record<string, unknown>)[sortKey];
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const columns: Column<MenuItem>[] = [
    { key: "name", header: "Name", sortable: true, render: (r) => (
      <span className="inline-flex items-center gap-2">{r.name}
        {parseJson(r.dietaryFlags).slice(0, 2).map((d) => <span key={d} className="text-[10px] px-1.5 py-0.5 rounded bg-cream border border-border font-bold capitalize">{d}</span>)}
      </span>
    ) },
    { key: "category", header: "Category", render: (r) => r.category?.name ?? "—" },
    { key: "basePrice", header: "Price", align: "right", sortable: true, render: (r) => (
      <span>{formatCurrency(r.basePrice)}{r.locationPrice != null && <span className="ml-1 text-[10px] text-amber-700 font-bold" title="Location override">▲{formatCurrency(r.locationPrice)}</span>}</span>
    ) },
    { key: "recipeCost", header: "Cost", align: "right", render: (r) => formatCurrency(r.recipeCost) },
    { key: "grossMargin", header: "Margin %", align: "right", sortable: true, render: (r) => {
      const below = r.marginAlertThreshold != null && r.grossMargin < r.marginAlertThreshold;
      return <span className={cn("tabular-nums", (r.grossMargin < 50 || below) && "text-red-600 font-bold")}>{r.grossMargin.toFixed(1)}%{below && " ⚠"}</span>;
    } },
    { key: "availability", header: "Status", render: (r) => (
      <span className="inline-flex items-center gap-1.5">
        <StatusDot status={r.availability} />
        {r.autoOutOfStock && <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">Auto</span>}
      </span>
    ) },
    { key: "unitsSold", header: "Sold", align: "right", sortable: true },
  ];

  const availabilityItems = items.filter((i) => i.availability !== "available");
  const rootCategories = categories.filter((c) => !c.parentId).sort((a, b) => a.displayOrder - b.displayOrder);
  const childrenOf = (id: string) => categories.filter((c) => c.parentId === id).sort((a, b) => a.displayOrder - b.displayOrder);

  const renderCatRow = (cat: Category, depth: number): React.ReactNode => (
    <div key={cat.id}>
      <div className="flex items-center justify-between p-3 bg-white border-2 border-border rounded-xl mb-2" style={{ marginLeft: depth * 24 }}>
        <div className="flex items-center gap-2 min-w-0">
          {cat.icon && <span>{cat.icon}</span>}
          <span className="font-bold text-black truncate">{cat.name}</span>
          {cat.dietaryTag && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cream border border-border font-bold capitalize">{cat.dietaryTag}</span>}
          <span className="text-xs text-muted font-semibold">{cat._count?.items ?? 0} items</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          <button type="button" onClick={() => moveCategory(cat, -1)} className="p-1.5 rounded-lg hover:bg-cream focus-ring" aria-label="Move up"><ChevronUp size={16} /></button>
          <button type="button" onClick={() => moveCategory(cat, 1)} className="p-1.5 rounded-lg hover:bg-cream focus-ring" aria-label="Move down"><ChevronDown size={16} /></button>
          <button type="button" onClick={() => setEditingCat({ ...cat })} className="px-2 py-1 text-sm font-bold underline focus-ring">Edit</button>
          <button type="button" onClick={() => { setCatReassign(cat); setReassignTo(cat.parentId ?? "uncategorized"); }} className="p-1.5 text-red-600 hover:bg-red-50 rounded-lg focus-ring" aria-label="Delete"><Trash2 size={16} /></button>
        </div>
      </div>
      {childrenOf(cat.id).map((child) => renderCatRow(child, depth + 1))}
    </div>
  );

  const activeOnDate = useMemo(() => {
    if (!previewDate) return null;
    const d = new Date(previewDate).getTime();
    return seasonal.filter((s) => s.active && new Date(s.startDate).getTime() <= d && new Date(s.endDate).getTime() >= d);
  }, [previewDate, seasonal]);

  return (
    <div>
      <PageHeader title="Menu & Recipe" subtitle="Categories, items, recipes, cost/margin, availability, seasonal, substitution"
        actions={<><BtnSecondary onClick={exportItems}><Download size={18} /> Export</BtnSecondary><BtnPrimary onClick={openCreate}><Plus size={18} /> New Item</BtnPrimary></>} />

      <TabBar tabs={[
        { id: "items", label: "Items" }, { id: "categories", label: "Categories" },
        { id: "availability", label: "Availability Board" }, { id: "seasonal", label: "Seasonal" },
      ]} active={tab} onChange={setTab} />

      {tab === "items" && (
        <>
          <FilterBar search={search} onSearchChange={setSearch} />
          <div className="flex flex-wrap gap-4 mb-4">
            <ChipFilter value={dietaryFilter} onChange={setDietaryFilter} options={[{ value: "", label: "All diets" }, ...DIETARY_FLAGS.map((d) => ({ value: d, label: d }))]} />
            <ChipFilter value={availFilter} onChange={setAvailFilter} options={[
              { value: "", label: "Any status" }, { value: "available", label: "Available" },
              { value: "out_of_stock", label: "Out of stock" }, { value: "unavailable_delivery", label: "Dine-in only" },
            ]} />
          </div>
          <BulkActionBar count={selected.size} actions={[
            { label: "Mark Available", onClick: () => bulkStatus("available") },
            { label: "Mark Out of Stock", onClick: () => bulkStatus("out_of_stock") },
            { label: "Delete", onClick: () => setConfirmDelete([...selected]), destructive: true },
          ]} onClear={() => setSelected(new Set())} />
          <DenseGrid columns={columns} data={sorted} selectedIds={selected}
            onSelect={(id) => { const n = new Set(selected); n.has(id) ? n.delete(id) : n.add(id); setSelected(n); }}
            onSelectAll={() => setSelected(selected.size === items.length ? new Set() : new Set(items.map((i) => i.id)))}
            onRowClick={openEdit} sortKey={sortKey} sortDir={sortDir}
            onSort={(key) => { if (sortKey === key) setSortDir(sortDir === "asc" ? "desc" : "asc"); else { setSortKey(key); setSortDir("asc"); } }}
            emptyMessage="No menu items match your filters" />
        </>
      )}

      {tab === "categories" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_180px_140px_80px_auto] gap-3 p-4 bg-cream/60 rounded-2xl border border-border items-end">
            <FormField label="New category"><input className={inputClass} placeholder="e.g. Starters" value={catDraft.name} onChange={(e) => setCatDraft({ ...catDraft, name: e.target.value })} /></FormField>
            <FormField label="Parent"><select className={selectClass} value={catDraft.parentId} onChange={(e) => setCatDraft({ ...catDraft, parentId: e.target.value })}><option value="">Top level</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
            <FormField label="Dietary tag"><input className={inputClass} placeholder="veg" value={catDraft.dietaryTag} onChange={(e) => setCatDraft({ ...catDraft, dietaryTag: e.target.value })} /></FormField>
            <FormField label="Icon"><input className={inputClass} placeholder="🍲" value={catDraft.icon} onChange={(e) => setCatDraft({ ...catDraft, icon: e.target.value })} /></FormField>
            <BtnPrimary onClick={addCategory} className="mb-5"><Plus size={18} /> Add</BtnPrimary>
          </div>
          <div>{rootCategories.map((c) => renderCatRow(c, 0))}{categories.length === 0 && <p className="text-muted font-semibold text-center py-8">No categories yet</p>}</div>
        </div>
      )}

      {tab === "availability" && (
        <DenseGrid columns={columns} data={availabilityItems.length ? availabilityItems : items} selectable={false} onRowClick={openEdit} emptyMessage="All items available" />
      )}

      {tab === "seasonal" && (
        <div className="space-y-5">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="page-surface p-5 space-y-1">
              <h3 className="font-bold text-black mb-2">Schedule a seasonal menu</h3>
              <FormField label="Name" required><input className={inputClass} value={seasonalForm.name} onChange={(e) => setSeasonalForm({ ...seasonalForm, name: e.target.value })} placeholder="Summer Specials" /></FormField>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Applies to item"><select className={selectClass} value={seasonalForm.itemId} onChange={(e) => setSeasonalForm({ ...seasonalForm, itemId: e.target.value, categoryId: "" })}><option value="">— any —</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></FormField>
                <FormField label="…or category"><select className={selectClass} value={seasonalForm.categoryId} onChange={(e) => setSeasonalForm({ ...seasonalForm, categoryId: e.target.value, itemId: "" })}><option value="">— any —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Start" required><input type="date" className={inputClass} value={seasonalForm.startDate} onChange={(e) => setSeasonalForm({ ...seasonalForm, startDate: e.target.value })} /></FormField>
                <FormField label="End" required><input type="date" className={inputClass} value={seasonalForm.endDate} onChange={(e) => setSeasonalForm({ ...seasonalForm, endDate: e.target.value })} /></FormField>
              </div>
              <label className="flex justify-between font-bold mb-4"><span>Recurring annually</span><input type="checkbox" checked={seasonalForm.recurring} onChange={(e) => setSeasonalForm({ ...seasonalForm, recurring: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
              <BtnPrimary onClick={addSeasonal}><Plus size={18} /> Add Schedule</BtnPrimary>
            </div>
            <div className="page-surface p-5">
              <h3 className="font-bold text-black mb-2">Menu as of date</h3>
              <FormField label="Preview date"><input type="date" className={inputClass} value={previewDate} onChange={(e) => setPreviewDate(e.target.value)} /></FormField>
              {activeOnDate === null ? <p className="text-muted font-medium">Pick a date to preview active seasonal schedules.</p>
                : activeOnDate.length === 0 ? <p className="text-muted font-medium">No seasonal schedules active on {previewDate}.</p>
                : <ul className="space-y-2">{activeOnDate.map((s) => <li key={s.id} className="p-3 bg-cream rounded-lg font-semibold">{s.name}</li>)}</ul>}
            </div>
          </div>
          <DenseGrid columns={[
            { key: "name", header: "Schedule" },
            { key: "target", header: "Applies to", render: (r: Seasonal) => r.itemId ? (items.find((i) => i.id === r.itemId)?.name ?? "item") : r.categoryId ? (categories.find((c) => c.id === r.categoryId)?.name ?? "category") : "All" },
            { key: "window", header: "Window", render: (r: Seasonal) => `${format(new Date(r.startDate), "dd MMM")} → ${format(new Date(r.endDate), "dd MMM yyyy")}` },
            { key: "recurring", header: "Recurring", render: (r: Seasonal) => r.recurring ? "Yes" : "—" },
            { key: "del", header: "", render: (r: Seasonal) => <button type="button" onClick={() => deleteSeasonal(r.id)} className="text-red-600 font-bold underline">Remove</button> },
          ]} data={seasonal.map((s) => ({ ...s }))} selectable={false} onRowClick={() => {}} emptyMessage="No seasonal schedules" />
        </div>
      )}

      {/* ── Item drawer ── */}
      <Drawer open={creating || !!detail} onClose={() => { setCreating(false); setDetail(null); }} title={creating ? "New Menu Item" : detail?.name ?? ""} width="640px">
        <TabBar tabs={[
          { id: "details", label: "Details" }, { id: "variants", label: "Variants & Modifiers" },
          { id: "recipe", label: "Recipe" }, { id: "cost", label: "Cost & Margin" }, { id: "availability", label: "Availability" },
        ]} active={drawerTab} onChange={setDrawerTab} />

        {drawerTab === "details" && (
          <div className="space-y-1">
            <FormField label="Name" required><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
            <FormField label="Description"><textarea className={`${inputClass} min-h-20`} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></FormField>
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Category"><select className={selectClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}><option value="">— Select —</option>{categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
              <FormField label="Tax Category"><select className={selectClass} value={form.taxCategory} onChange={(e) => setForm({ ...form, taxCategory: e.target.value })}>{TAX_CATEGORIES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}</select></FormField>
              <FormField label="Base Price (₹)"><input type="number" className={inputClass} value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })} /></FormField>
              <FormField label="Prep Time (min)"><input type="number" className={inputClass} value={form.prepTime} onChange={(e) => setForm({ ...form, prepTime: Number(e.target.value) })} /></FormField>
            </div>
            <FormField label="Location price override (₹)" hint={`Owner-only. Overrides base price at ${locations[0]?.name ?? "this location"}.`}>
              <input type="number" className={inputClass} value={form.locationPrice} onChange={(e) => setForm({ ...form, locationPrice: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="— none —" />
            </FormField>
            <FormField label="Dietary flags"><MultiToggle options={DIETARY_FLAGS} selected={form.dietaryFlags} onToggle={(v) => setForm({ ...form, dietaryFlags: form.dietaryFlags.includes(v) ? form.dietaryFlags.filter((x) => x !== v) : [...form.dietaryFlags, v] })} /></FormField>
            <FormField label="Allergen tags"><MultiToggle options={ALLERGENS} selected={form.allergenTags} onToggle={(v) => setForm({ ...form, allergenTags: form.allergenTags.includes(v) ? form.allergenTags.filter((x) => x !== v) : [...form.allergenTags, v] })} /></FormField>
            <FormField label="Photos (URLs, ≤3)" hint="Paste image URLs, one per line.">
              <textarea className={`${inputClass} min-h-16`} value={form.photos.join("\n")} onChange={(e) => setForm({ ...form, photos: e.target.value.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 3) })} />
            </FormField>
          </div>
        )}

        {drawerTab === "variants" && (
          <div className="space-y-6">
            <section>
              <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-black">Size Variants</h3>
                <BtnSecondary onClick={() => setVariants([...variants, { label: "", price: form.basePrice, recipeNote: "" }])}><Plus size={16} /> Add Variant</BtnSecondary></div>
              <div className="space-y-2">
                {variants.map((v, i) => (
                  <div key={i} className="grid grid-cols-[1fr_100px_1fr_40px] gap-2 items-center">
                    <input className={inputClass} placeholder="Label (e.g. Large)" value={v.label} onChange={(e) => setVariants(variants.map((x, idx) => idx === i ? { ...x, label: e.target.value } : x))} />
                    <input type="number" className={inputClass} value={v.price} onChange={(e) => setVariants(variants.map((x, idx) => idx === i ? { ...x, price: Number(e.target.value) } : x))} />
                    <input className={inputClass} placeholder="Recipe note" value={v.recipeNote ?? ""} onChange={(e) => setVariants(variants.map((x, idx) => idx === i ? { ...x, recipeNote: e.target.value } : x))} />
                    <button type="button" onClick={() => setVariants(variants.filter((_, idx) => idx !== i))} className="h-12 rounded-xl border-2 border-border text-red-600 font-bold focus-ring">×</button>
                  </div>
                ))}
                {variants.length === 0 && <p className="text-sm font-semibold text-muted bg-cream border-2 border-border rounded-xl p-3">No variants. Default base price applies.</p>}
              </div>
            </section>
            <section>
              <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-black">Modifier Groups</h3>
                <BtnSecondary onClick={() => setModifierGroups([...modifierGroups, { name: "", required: false, minSelect: 0, maxSelect: 1, options: [] }])}><Plus size={16} /> Add Group</BtnSecondary></div>
              <div className="space-y-3">
                {modifierGroups.map((g, gi) => (
                  <div key={gi} className="p-3 border-2 border-border rounded-xl bg-cream/40 space-y-2">
                    <div className="grid grid-cols-[1fr_auto_40px] gap-2 items-center">
                      <input className={inputClass} placeholder="Group name (e.g. Spice Level)" value={g.name} onChange={(e) => setModifierGroups(modifierGroups.map((x, i) => i === gi ? { ...x, name: e.target.value } : x))} />
                      <label className="flex items-center gap-1.5 text-sm font-bold whitespace-nowrap"><input type="checkbox" checked={g.required} onChange={(e) => setModifierGroups(modifierGroups.map((x, i) => i === gi ? { ...x, required: e.target.checked } : x))} className="w-4 h-4 accent-[#F4B315]" /> Required</label>
                      <button type="button" onClick={() => setModifierGroups(modifierGroups.filter((_, i) => i !== gi))} className="h-12 rounded-xl border-2 border-border text-red-600 font-bold focus-ring">×</button>
                    </div>
                    {g.options.map((o, oi) => (
                      <div key={oi} className="grid grid-cols-[1fr_110px_40px] gap-2 items-center pl-4">
                        <input className={inputClass} placeholder="Option (e.g. Extra Hot)" value={o.label} onChange={(e) => setModifierGroups(modifierGroups.map((x, i) => i === gi ? { ...x, options: x.options.map((y, j) => j === oi ? { ...y, label: e.target.value } : y) } : x))} />
                        <input type="number" className={inputClass} placeholder="+₹" value={o.priceDelta} onChange={(e) => setModifierGroups(modifierGroups.map((x, i) => i === gi ? { ...x, options: x.options.map((y, j) => j === oi ? { ...y, priceDelta: Number(e.target.value) } : y) } : x))} />
                        <button type="button" onClick={() => setModifierGroups(modifierGroups.map((x, i) => i === gi ? { ...x, options: x.options.filter((_, j) => j !== oi) } : x))} className="h-12 rounded-xl border-2 border-border text-red-600 font-bold focus-ring">×</button>
                      </div>
                    ))}
                    <button type="button" onClick={() => setModifierGroups(modifierGroups.map((x, i) => i === gi ? { ...x, options: [...x.options, { label: "", priceDelta: 0 }] } : x))} className="text-sm font-bold underline pl-4">+ Add option</button>
                  </div>
                ))}
                {modifierGroups.length === 0 && <p className="text-sm font-semibold text-muted bg-cream border-2 border-border rounded-xl p-3">No modifier groups.</p>}
              </div>
            </section>
          </div>
        )}

        {drawerTab === "recipe" && (
          <div className="space-y-6">
            <section>
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-bold text-black">Recipe Ingredients {detail?.recipe && <span className="text-xs text-muted">v{detail.recipe.version}</span>}</h3>
                <div className="flex gap-2">
                  {detail?.recipe?.snapshots && detail.recipe.snapshots.length > 0 && <BtnSecondary onClick={() => setShowVersions((v) => !v)}><History size={16} /> History</BtnSecondary>}
                  <BtnSecondary onClick={addRecipeLine}><Plus size={16} /> Add Ingredient</BtnSecondary>
                </div>
              </div>
              <div className="space-y-2">
                {recipeLines.map((line, i) => (
                  <div key={`${line.ingredientId}-${i}`} className="grid grid-cols-[1fr_90px_80px_40px] gap-2 items-center">
                    <select className={selectClass} value={line.ingredientId} onChange={(e) => updateRecipeLine(i, { ingredientId: e.target.value })}><option value="">Ingredient</option>{ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}</select>
                    <input type="number" className={inputClass} value={line.quantity} onChange={(e) => updateRecipeLine(i, { quantity: Number(e.target.value) })} />
                    <input className={inputClass} value={line.unit} onChange={(e) => updateRecipeLine(i, { unit: e.target.value })} />
                    <button type="button" onClick={() => setRecipeLines(recipeLines.filter((_, idx) => idx !== i))} className="h-12 rounded-xl border-2 border-border text-red-600 font-bold focus-ring">×</button>
                  </div>
                ))}
                {recipeLines.length === 0 && <p className="text-sm font-semibold text-muted bg-cream border-2 border-border rounded-xl p-3">No recipe ingredients yet.</p>}
              </div>
              {showVersions && detail?.recipe?.snapshots && (
                <div className="mt-3 p-3 bg-cream rounded-xl border-2 border-border">
                  <p className="font-bold text-sm mb-2">Version history</p>
                  <ul className="space-y-1 text-sm">{detail.recipe.snapshots.map((s) => (
                    <li key={s.id} className="flex justify-between"><span>v{s.version} · {format(new Date(s.createdAt), "dd MMM HH:mm")}</span><span className="text-muted">{JSON.parse(s.ingredientsJson).length} ingredients</span></li>
                  ))}</ul>
                </div>
              )}
            </section>
            <section>
              <div className="flex items-center justify-between mb-3"><h3 className="font-bold text-black">Substitution Rules</h3>
                <BtnSecondary onClick={() => setSubstitutions([...substitutions, { primaryIngredientId: ingredients[0]?.id ?? "", primaryName: ingredients[0]?.name ?? "", substituteIngredientId: ingredients[0]?.id ?? "", substituteName: ingredients[0]?.name ?? "", ratio: 1, requiresApproval: false }])}><Plus size={16} /> Add Rule</BtnSecondary></div>
              <div className="space-y-2">
                {substitutions.map((s, i) => (
                  <div key={i} className="grid grid-cols-[1fr_1fr_70px_auto_40px] gap-2 items-center">
                    <select className={selectClass} value={s.primaryIngredientId} onChange={(e) => { const ing = ingredients.find((x) => x.id === e.target.value); setSubstitutions(substitutions.map((x, idx) => idx === i ? { ...x, primaryIngredientId: e.target.value, primaryName: ing?.name ?? "" } : x)); }}>{ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}</select>
                    <select className={selectClass} value={s.substituteIngredientId} onChange={(e) => { const ing = ingredients.find((x) => x.id === e.target.value); setSubstitutions(substitutions.map((x, idx) => idx === i ? { ...x, substituteIngredientId: e.target.value, substituteName: ing?.name ?? "" } : x)); }}>{ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}</select>
                    <input type="number" step="0.1" className={inputClass} value={s.ratio} title="Ratio" onChange={(e) => setSubstitutions(substitutions.map((x, idx) => idx === i ? { ...x, ratio: Number(e.target.value) } : x))} />
                    <label className="flex items-center gap-1.5 text-xs font-bold whitespace-nowrap"><input type="checkbox" checked={s.requiresApproval} onChange={(e) => setSubstitutions(substitutions.map((x, idx) => idx === i ? { ...x, requiresApproval: e.target.checked } : x))} className="w-4 h-4 accent-[#F4B315]" /> Approve</label>
                    <button type="button" onClick={() => setSubstitutions(substitutions.filter((_, idx) => idx !== i))} className="h-12 rounded-xl border-2 border-border text-red-600 font-bold focus-ring">×</button>
                  </div>
                ))}
                {substitutions.length === 0 && <p className="text-sm font-semibold text-muted bg-cream border-2 border-border rounded-xl p-3">No substitution rules. e.g. 1 Paneer = 1.2 Tofu.</p>}
              </div>
            </section>
          </div>
        )}

        {drawerTab === "cost" && (
          <div className="space-y-1">
            <FormField label="Recipe Cost (₹)"><input type="number" className={inputClass} value={form.recipeCost} onChange={(e) => setForm({ ...form, recipeCost: Number(e.target.value) })} /></FormField>
            <FormField label="Margin-alert threshold (%)" hint="Highlight this item when its margin drops below this."><input type="number" className={inputClass} value={form.marginAlertThreshold} onChange={(e) => setForm({ ...form, marginAlertThreshold: e.target.value === "" ? "" : Number(e.target.value) })} placeholder="— none —" /></FormField>
            <div className={cn("p-4 rounded-xl mt-4", marginBelow ? "bg-red-50 border-2 border-red-200" : "bg-cream")}>
              <p className="font-bold flex items-center gap-2">{marginBelow && <AlertTriangle size={16} className="text-red-600" />}Gross Margin: {liveMargin.toFixed(1)}%</p>
              <p className="text-muted text-sm mt-1">Profit per item: {formatCurrency(form.basePrice - form.recipeCost)}</p>
              {marginBelow && <p className="text-red-700 text-sm font-bold mt-1">Below your {Number(form.marginAlertThreshold)}% alert threshold.</p>}
            </div>
          </div>
        )}

        {drawerTab === "availability" && (
          <div className="space-y-1">
            <FormField label="Availability">
              <select className={selectClass} value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })}>
                <option value="available">Available</option>
                <option value="out_of_stock">Out of Stock (hidden all channels)</option>
                <option value="unavailable_delivery">Unavailable for Delivery (dine-in only)</option>
              </select>
            </FormField>
            {detail?.autoOutOfStock && <p className="text-sm font-bold text-red-700 bg-red-50 border-2 border-red-200 rounded-xl p-3">Auto: Out of Stock — an ingredient is depleted. Saving as Available overrides this.</p>}
          </div>
        )}

        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <BtnPrimary onClick={saveItem}><Save size={18} /> {creating ? "Create" : "Save"}</BtnPrimary>
          {!creating && detail && <BtnSecondary onClick={() => setConfirmDelete([detail.id])}><Trash2 size={18} /> Delete</BtnSecondary>}
        </div>
      </Drawer>

      {/* ── Category edit drawer ── */}
      <Drawer open={!!editingCat} onClose={() => setEditingCat(null)} title={`Edit ${editingCat?.name ?? ""}`}>
        {editingCat && (
          <div className="space-y-1">
            <FormField label="Name"><input className={inputClass} value={editingCat.name} onChange={(e) => setEditingCat({ ...editingCat, name: e.target.value })} /></FormField>
            <FormField label="Parent category"><select className={selectClass} value={editingCat.parentId ?? ""} onChange={(e) => setEditingCat({ ...editingCat, parentId: e.target.value || null })}><option value="">Top level</option>{categories.filter((c) => c.id !== editingCat.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></FormField>
            <FormField label="Dietary tag"><input className={inputClass} value={editingCat.dietaryTag ?? ""} onChange={(e) => setEditingCat({ ...editingCat, dietaryTag: e.target.value })} /></FormField>
            <FormField label="Icon"><input className={inputClass} value={editingCat.icon ?? ""} onChange={(e) => setEditingCat({ ...editingCat, icon: e.target.value })} /></FormField>
            <BtnPrimary onClick={saveCategory} className="mt-4"><Save size={18} /> Save Category</BtnPrimary>
          </div>
        )}
      </Drawer>

      <ConfirmDialog open={!!confirmDelete} title="Delete items?" message={`Delete ${confirmDelete?.length} menu item(s)? Soft-delete preserves order history.`}
        confirmLabel="Delete" destructive requireReason onConfirm={(reason) => confirmDelete && deleteItems(confirmDelete, reason)} onCancel={() => setConfirmDelete(null)} />

      <ConfirmDialog open={!!catReassign} title={`Delete "${catReassign?.name}"?`}
        message={`${catReassign?._count?.items ?? 0} item(s) will be reassigned. Choose where, then confirm.`}
        confirmLabel="Delete & Reassign" destructive
        onConfirm={deleteCategory} onCancel={() => setCatReassign(null)} />
      {catReassign && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[200] bg-white border-2 border-primary rounded-xl p-3 shadow-xl flex items-center gap-2">
          <span className="text-sm font-bold">Reassign items to:</span>
          <select className="h-10 px-3 border-2 border-border rounded-lg font-bold" value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}>
            <option value="uncategorized">Uncategorized</option>
            {categories.filter((c) => c.id !== catReassign.id).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </div>
      )}
    </div>
  );
}
