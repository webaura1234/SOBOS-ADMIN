"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, FilterBar, BulkActionBar, PageHeader, StatusDot, TabBar, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { ConfirmDialog, FormField, inputClass, selectClass, exportCsv } from "@/components/ui/forms";
import { formatCurrency } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { useDebouncedValue } from "@/lib/use-debounce";
import { Plus, Download, Trash2, Save } from "lucide-react";

interface MenuItem {
  id: string;
  name: string;
  description?: string | null;
  categoryId?: string | null;
  category: { id: string; name: string } | null;
  basePrice: number;
  recipeCost: number;
  grossMargin: number;
  availability: string;
  unitsSold: number;
  prepTime: number | null;
}

interface Category {
  id: string;
  name: string;
  displayOrder: number;
  itemCount?: number;
}

const emptyItem = { name: "", basePrice: 0, recipeCost: 0, categoryId: "", prepTime: 0, availability: "available" };

export default function MenuPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-32 bg-cream rounded-xl" />}>
      <MenuPageContent />
    </Suspense>
  );
}

function MenuPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [items, setItems] = useState<MenuItem[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [tab, setTab] = useState("items");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detail, setDetail] = useState<MenuItem | null>(null);
  const [drawerTab, setDrawerTab] = useState("details");
  const [form, setForm] = useState(emptyItem);
  const [creating, setCreating] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string[] | null>(null);
  const [sortKey, setSortKey] = useState("name");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");
  const [newCategory, setNewCategory] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (debouncedSearch) params.set("search", debouncedSearch);
    const data = await apiFetch<{ items: MenuItem[]; categories: Category[] }>(`/api/menu?${params}`);
    setItems(data.items ?? []);
    setCategories(data.categories ?? []);
  }, [debouncedSearch]);

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [load, toast]);

  const openCreate = () => {
    setCreating(true);
    setDetail(null);
    setForm(emptyItem);
    setDrawerTab("details");
  };

  const openEdit = (item: MenuItem) => {
    setCreating(false);
    setDetail(item);
    setForm({
      name: item.name,
      basePrice: item.basePrice,
      recipeCost: item.recipeCost,
      categoryId: item.categoryId ?? "",
      prepTime: item.prepTime ?? 0,
      availability: item.availability,
    });
    setDrawerTab("details");
  };

  useEffect(() => {
    if (searchParams.get("action") === "create") openCreate();
    const openId = searchParams.get("open");
    if (openId && items.length > 0) {
      const item = items.find((i) => i.id === openId);
      if (item) openEdit(item);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams, items.length]);

  const saveItem = async () => {
    try {
      if (!form.name.trim()) { toast("Name is required", "error"); return; }
      const payload = {
        ...form,
        categoryId: form.categoryId || null,
        basePrice: Number(form.basePrice),
        recipeCost: Number(form.recipeCost),
        prepTime: Number(form.prepTime) || null,
      };
      if (creating) {
        await apiFetch("/api/menu", { method: "POST", body: JSON.stringify(payload) });
        toast("Menu item created");
      } else if (detail) {
        await apiFetch("/api/menu", { method: "PATCH", body: JSON.stringify({ id: detail.id, ...payload }) });
        toast("Menu item updated");
      }
      setCreating(false);
      setDetail(null);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Save failed", "error"); }
  };

  const deleteItems = async (ids: string[]) => {
    try {
      await apiFetch(`/api/menu?ids=${ids.join(",")}`, { method: "DELETE" });
      toast(`Deleted ${ids.length} item(s)`);
      setSelected(new Set());
      setDetail(null);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Delete failed", "error"); }
  };

  const bulkStatus = async (status: string) => {
    try {
      await apiFetch("/api/menu", { method: "PATCH", body: JSON.stringify({ ids: [...selected], bulkAvailability: status }) });
      toast(`Updated ${selected.size} items`);
      setSelected(new Set());
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Update failed", "error"); }
  };

  const addCategory = async () => {
    if (!newCategory.trim()) return;
    try {
      await apiFetch("/api/menu/categories", { method: "POST", body: JSON.stringify({ name: newCategory }) });
      toast("Category created");
      setNewCategory("");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const deleteCategory = async (id: string) => {
    try {
      await apiFetch(`/api/menu/categories?id=${id}`, { method: "DELETE" });
      toast("Category deleted");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const exportItems = () => {
    exportCsv("menu-items.csv", ["Name", "Category", "Price", "Cost", "Margin", "Status", "Sold"],
      items.map((i) => [i.name, i.category?.name ?? "", i.basePrice, i.recipeCost, i.grossMargin, i.availability, i.unitsSold]));
    toast("Exported to CSV");
  };

  const sorted = [...items].sort((a, b) => {
    const av = (a as unknown as Record<string, unknown>)[sortKey];
    const bv = (b as unknown as Record<string, unknown>)[sortKey];
    const cmp = typeof av === "number" && typeof bv === "number" ? av - bv : String(av).localeCompare(String(bv));
    return sortDir === "asc" ? cmp : -cmp;
  });

  const columns: Column<MenuItem>[] = [
    { key: "name", header: "Name", sortable: true },
    { key: "category", header: "Category", render: (r) => r.category?.name ?? "—" },
    { key: "basePrice", header: "Price", align: "right", sortable: true, render: (r) => formatCurrency(r.basePrice) },
    { key: "recipeCost", header: "Cost", align: "right", render: (r) => formatCurrency(r.recipeCost) },
    { key: "grossMargin", header: "Margin %", align: "right", sortable: true,
      render: (r) => <span className={r.grossMargin < 50 ? "text-red-600 tabular-nums font-bold" : "tabular-nums"}>{r.grossMargin.toFixed(1)}%</span> },
    { key: "availability", header: "Status", render: (r) => <StatusDot status={r.availability} /> },
    { key: "unitsSold", header: "Sold", align: "right", sortable: true },
  ];

  const availabilityItems = items.filter((i) => i.availability !== "available");

  return (
    <div>
      <PageHeader
        title="Menu & Recipe"
        subtitle="Categories, items, recipes, cost/margin, availability"
        actions={<><BtnSecondary onClick={exportItems}><Download size={18} /> Export</BtnSecondary><BtnPrimary onClick={openCreate}><Plus size={18} /> New Item</BtnPrimary></>}
      />

      <TabBar tabs={[
        { id: "items", label: "Items" }, { id: "categories", label: "Categories" },
        { id: "availability", label: "Availability Board" }, { id: "seasonal", label: "Seasonal" },
      ]} active={tab} onChange={setTab} />

      {tab === "items" && (
        <>
          <FilterBar search={search} onSearchChange={setSearch} />
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
            emptyMessage="No menu items yet — Add your first item" />
        </>
      )}

      {tab === "categories" && (
        <div className="space-y-4">
          <div className="flex gap-3">
            <input className={inputClass + " flex-1"} placeholder="New category name" value={newCategory} onChange={(e) => setNewCategory(e.target.value)} />
            <BtnPrimary onClick={addCategory}><Plus size={18} /> Add</BtnPrimary>
          </div>
          <div className="grid gap-3">
            {categories.map((c) => (
              <div key={c.id} className="flex items-center justify-between p-4 bg-white border-2 border-border rounded-xl">
                <span className="font-bold text-black">{c.name}</span>
                <button type="button" onClick={() => deleteCategory(c.id)} className="p-2 text-red-600 hover:bg-red-50 rounded-lg focus-ring" aria-label="Delete category"><Trash2 size={18} /></button>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "availability" && (
        <DenseGrid columns={columns} data={availabilityItems.length ? availabilityItems : items} selectable={false}
          onRowClick={openEdit} emptyMessage="All items available" />
      )}

      {tab === "seasonal" && (
        <div className="p-8 text-center bg-cream rounded-xl border-2 border-border">
          <p className="font-bold text-black text-lg">Seasonal Menu Manager</p>
          <p className="text-muted mt-2">Schedule date-range menus from the item detail drawer.</p>
        </div>
      )}

      <Drawer open={creating || !!detail} onClose={() => { setCreating(false); setDetail(null); }} title={creating ? "New Menu Item" : detail?.name ?? ""}>
        <TabBar tabs={[
          { id: "details", label: "Details" }, { id: "cost", label: "Cost & Margin" }, { id: "availability", label: "Availability" },
        ]} active={drawerTab} onChange={setDrawerTab} />

        {drawerTab === "details" && (
          <div className="space-y-1">
            <FormField label="Name" required><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
            <FormField label="Category"><select className={selectClass} value={form.categoryId} onChange={(e) => setForm({ ...form, categoryId: e.target.value })}>
              <option value="">— Select —</option>
              {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select></FormField>
            <FormField label="Base Price (₹)"><input type="number" className={inputClass} value={form.basePrice} onChange={(e) => setForm({ ...form, basePrice: Number(e.target.value) })} /></FormField>
            <FormField label="Prep Time (min)"><input type="number" className={inputClass} value={form.prepTime} onChange={(e) => setForm({ ...form, prepTime: Number(e.target.value) })} /></FormField>
          </div>
        )}

        {drawerTab === "cost" && (
          <div className="space-y-1">
            <FormField label="Recipe Cost (₹)"><input type="number" className={inputClass} value={form.recipeCost} onChange={(e) => setForm({ ...form, recipeCost: Number(e.target.value) })} /></FormField>
            <div className="p-4 bg-cream rounded-xl mt-4">
              <p className="font-bold">Gross Margin: {form.basePrice > 0 ? (((form.basePrice - form.recipeCost) / form.basePrice) * 100).toFixed(1) : 0}%</p>
              <p className="text-muted text-sm mt-1">Profit per item: {formatCurrency(form.basePrice - form.recipeCost)}</p>
            </div>
          </div>
        )}

        {drawerTab === "availability" && (
          <FormField label="Availability">
            <select className={selectClass} value={form.availability} onChange={(e) => setForm({ ...form, availability: e.target.value })}>
              <option value="available">Available</option>
              <option value="out_of_stock">Out of Stock</option>
              <option value="unavailable_delivery">Unavailable for Delivery</option>
            </select>
          </FormField>
        )}

        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <BtnPrimary onClick={saveItem}><Save size={18} /> {creating ? "Create" : "Save"}</BtnPrimary>
          {!creating && detail && (
            <BtnSecondary onClick={() => setConfirmDelete([detail.id])}><Trash2 size={18} /> Delete</BtnSecondary>
          )}
        </div>
      </Drawer>

      <ConfirmDialog open={!!confirmDelete} title="Delete items?" message={`Delete ${confirmDelete?.length} menu item(s)? This cannot be undone.`}
        confirmLabel="Delete" destructive onConfirm={() => confirmDelete && deleteItems(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
