"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, FilterBar, PageHeader, StatusDot, TabBar, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { FormField, inputClass, selectClass } from "@/components/ui/forms";
import { stockStatus, cn } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { useDebouncedValue } from "@/lib/use-debounce";
import { useApp } from "@/lib/context";
import { Plus, Save } from "lucide-react";
import { format } from "date-fns";

interface StockRow {
  id: string;
  quantity: number;
  locationId: string;
  ingredient: { id: string; name: string; unit: string; threshold: number; category: string | null };
  location: { id: string; name: string };
}

export default function InventoryPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-32 bg-cream rounded-xl" />}>
      <InventoryPageContent />
    </Suspense>
  );
}

function InventoryPageContent() {
  const { toast } = useToast();
  const { locationId, locations } = useApp();
  const searchParams = useSearchParams();
  const [tab, setTab] = useState("stock");
  const [search, setSearch] = useState("");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const debouncedSearch = useDebouncedValue(search, 300);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [batches, setBatches] = useState<{ id: string; number: string; ingredient: { name: string }; expiryDate: string | null; quantity: number }[]>([]);
  const [wastage, setWastage] = useState<{ id: string; ingredient: { name: string }; quantity: number; reason: string; createdAt: string }[]>([]);
  const [suppliers, setSuppliers] = useState<{ id: string; name: string; phone: string | null; rating: number | null; isActive: boolean }[]>([]);
  const [pos, setPos] = useState<{ id: string; number: string; status: string; total: number; supplier: { name: string } }[]>([]);
  const [ingredients, setIngredients] = useState<{ id: string; name: string; unit: string }[]>([]);
  const [detail, setDetail] = useState<StockRow | null>(null);
  const [adjustQty, setAdjustQty] = useState(0);
  const [wastageForm, setWastageForm] = useState({ stockId: "", quantity: 0, reason: "Expired" });
  const [showWastage, setShowWastage] = useState(false);
  const [showSupplier, setShowSupplier] = useState(false);
  const [showPo, setShowPo] = useState(false);
  const [supplierForm, setSupplierForm] = useState({ name: "", contact: "", phone: "", email: "" });
  const [poForm, setPoForm] = useState({ supplierId: "", locationId: "", ingredientId: "", qtyOrdered: 1, unitPrice: 0 });

  const load = useCallback(async () => {
    const params = new URLSearchParams({ tab });
    if (locationId) params.set("locationId", locationId);
    if (debouncedSearch && tab === "stock") params.set("search", debouncedSearch);
    const data = await apiFetch<Record<string, unknown>>(`/api/inventory?${params}`);
    if (tab === "stock") setStock((data.stock as StockRow[]) ?? []);
    if (tab === "batches") setBatches((data.batches as typeof batches) ?? []);
    if (tab === "wastage") setWastage((data.wastage as typeof wastage) ?? []);
    if (tab === "suppliers") setSuppliers((data.suppliers as typeof suppliers) ?? []);
    if (tab === "pos") setPos((data.purchaseOrders as typeof pos) ?? []);
    if (data.suppliers) setSuppliers((data.suppliers as typeof suppliers) ?? []);
    if (data.ingredients) setIngredients((data.ingredients as typeof ingredients) ?? []);
  }, [tab, locationId, debouncedSearch]);

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [load, toast]);

  useEffect(() => {
    const urlTab = searchParams.get("tab");
    if (urlTab) setTab(urlTab);
    if (searchParams.get("filter") === "low") setLowStockOnly(true);
    const q = searchParams.get("search");
    if (q) setSearch(q);
  }, [searchParams]);

  const visibleStock = useMemo(
    () => (lowStockOnly ? stock.filter((s) => s.quantity <= s.ingredient.threshold) : stock),
    [stock, lowStockOnly]
  );

  const saveAdjust = async () => {
    if (!detail) return;
    try {
      await apiFetch("/api/inventory", { method: "PATCH", body: JSON.stringify({ type: "stock", id: detail.id, quantity: adjustQty, reason: "Manual adjust" }) });
      toast("Stock updated"); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const submitWastage = async () => {
    try {
      const match = stock.find((s) => s.id === wastageForm.stockId);
      if (!match) { toast("Select ingredient & location", "error"); return; }
      await apiFetch("/api/inventory", { method: "POST", body: JSON.stringify({
        type: "wastage",
        ingredientId: match.ingredient.id,
        locationId: match.locationId,
        quantity: Number(wastageForm.quantity),
        reason: wastageForm.reason,
      }) });
      toast("Wastage logged"); setShowWastage(false); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const createSupplier = async () => {
    try {
      await apiFetch("/api/inventory", { method: "POST", body: JSON.stringify({ type: "supplier", data: supplierForm }) });
      toast("Supplier created");
      setShowSupplier(false);
      setSupplierForm({ name: "", contact: "", phone: "", email: "" });
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const createPo = async () => {
    try {
      const total = Number(poForm.qtyOrdered) * Number(poForm.unitPrice);
      await apiFetch("/api/inventory", {
        method: "POST",
        body: JSON.stringify({
          type: "po",
          supplierId: poForm.supplierId,
          locationId: poForm.locationId || locationId || locations[0]?.id,
          total,
          lines: [{ ingredientId: poForm.ingredientId, qtyOrdered: Number(poForm.qtyOrdered), unitPrice: Number(poForm.unitPrice) }],
        }),
      });
      toast("Purchase order created");
      setShowPo(false);
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const receivePo = async (id: string) => {
    try {
      await apiFetch("/api/inventory", { method: "PATCH", body: JSON.stringify({ type: "receive_po", id }) });
      toast("Purchase order received and stock updated");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const stockColumns: Column<StockRow>[] = [
    { key: "name", header: "Ingredient", render: (r) => r.ingredient.name },
    { key: "qty", header: "Qty", align: "right", render: (r) => `${r.quantity} ${r.ingredient.unit}` },
    { key: "status", header: "Status", render: (r) => { const s = stockStatus(r.quantity, r.ingredient.threshold); return <StatusDot status={s} label={s === "healthy" ? "Healthy" : s === "warning" ? "Low" : "Critical"} />; } },
    { key: "location", header: "Location", render: (r) => r.location.name },
  ];

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Stock, batches, wastage, suppliers, POs"
        actions={
          <div className="flex gap-2">
            {tab === "suppliers" && <BtnSecondary onClick={() => setShowSupplier(true)}><Plus size={18} /> Supplier</BtnSecondary>}
            {tab === "pos" && <BtnSecondary onClick={() => {
              setPoForm({ supplierId: suppliers[0]?.id ?? "", locationId: locationId ?? locations[0]?.id ?? "", ingredientId: ingredients[0]?.id ?? "", qtyOrdered: 1, unitPrice: 0 });
              setShowPo(true);
            }}><Plus size={18} /> PO</BtnSecondary>}
            <BtnPrimary onClick={() => { setShowWastage(true); setWastageForm({ stockId: stock[0]?.id ?? "", quantity: 0, reason: "Expired" }); }}><Plus size={18} /> Log Wastage</BtnPrimary>
          </div>
        } />

      <TabBar tabs={[{ id: "stock", label: "Stock" }, { id: "batches", label: "Batches" }, { id: "wastage", label: "Wastage" }, { id: "suppliers", label: "Suppliers" }, { id: "pos", label: "Purchase Orders" }]} active={tab} onChange={setTab} />

      {tab === "stock" && (
        <>
          <FilterBar search={search} onSearchChange={setSearch} />
          <div className="flex items-center gap-2 mb-4">
            <button
              type="button"
              onClick={() => setLowStockOnly((v) => !v)}
              className={cn(
                "h-10 px-4 rounded-xl border-2 text-sm font-bold focus-ring",
                lowStockOnly ? "border-red-400 bg-red-50 text-red-800" : "border-border bg-white text-black hover:bg-cream"
              )}
            >
              Low stock only {lowStockOnly ? `(${visibleStock.length})` : ""}
            </button>
          </div>
          <DenseGrid columns={stockColumns} data={visibleStock} selectable={false} onRowClick={(r) => { setDetail(r); setAdjustQty(r.quantity); }} />
        </>
      )}
      {tab === "batches" && <DenseGrid columns={[
        { key: "number", header: "Batch #" }, { key: "ingredient", header: "Ingredient", render: (r) => r.ingredient.name },
        { key: "expiry", header: "Expiry", render: (r) => r.expiryDate ? format(new Date(r.expiryDate), "dd MMM yyyy") : "—" },
        { key: "qty", header: "Qty", align: "right", render: (r) => r.quantity },
      ]} data={batches} selectable={false} onRowClick={() => {}} />}
      {tab === "wastage" && <DenseGrid columns={[
        { key: "ingredient", header: "Ingredient", render: (r) => r.ingredient.name },
        { key: "qty", header: "Qty", align: "right", render: (r) => r.quantity },
        { key: "reason", header: "Reason" },
        { key: "date", header: "Date", render: (r) => format(new Date(r.createdAt), "dd MMM HH:mm") },
      ]} data={wastage} selectable={false} onRowClick={() => {}} />}
      {tab === "suppliers" && <DenseGrid columns={[
        { key: "name", header: "Supplier" }, { key: "phone", header: "Phone", render: (r) => r.phone ?? "—" },
        { key: "rating", header: "Rating", align: "right", render: (r) => r.rating?.toFixed(1) ?? "—" },
        { key: "active", header: "Status", render: (r) => <StatusDot status={r.isActive ? "active" : "cancelled"} label={r.isActive ? "Active" : "Inactive"} /> },
      ]} data={suppliers} selectable={false} onRowClick={() => {}} />}
      {tab === "pos" && <DenseGrid columns={[
        { key: "number", header: "PO #" }, { key: "supplier", header: "Supplier", render: (r) => r.supplier.name },
        { key: "status", header: "Status", render: (r) => <StatusDot status={r.status} /> },
        { key: "total", header: "Total", align: "right", render: (r) => `₹${r.total}` },
        { key: "receive", header: "Receive", render: (r) => r.status === "received" ? "Done" : <button type="button" onClick={(e) => { e.stopPropagation(); receivePo(r.id); }} className="font-bold text-black underline">Receive</button> },
      ]} data={pos} selectable={false} onRowClick={() => {}} />}

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={`Adjust: ${detail?.ingredient.name}`}>
        <FormField label="New Quantity"><input type="number" step="0.1" className={inputClass} value={adjustQty} onChange={(e) => setAdjustQty(Number(e.target.value))} /></FormField>
        <BtnPrimary onClick={saveAdjust}><Save size={18} /> Save Adjustment</BtnPrimary>
      </Drawer>

      <Drawer open={showWastage} onClose={() => setShowWastage(false)} title="Log Wastage">
        <FormField label="Ingredient · Location"><select className={selectClass} value={wastageForm.stockId} onChange={(e) => setWastageForm({ ...wastageForm, stockId: e.target.value })}>
          {stock.map((s) => <option key={s.id} value={s.id}>{s.ingredient.name} — {s.location.name}</option>)}
        </select></FormField>
        <FormField label="Quantity"><input type="number" step="0.1" className={inputClass} value={wastageForm.quantity} onChange={(e) => setWastageForm({ ...wastageForm, quantity: Number(e.target.value) })} /></FormField>
        <FormField label="Reason"><select className={selectClass} value={wastageForm.reason} onChange={(e) => setWastageForm({ ...wastageForm, reason: e.target.value })}>
          {["Expired", "Spoiled", "Over-Prepared", "Dropped", "Other"].map((r) => <option key={r} value={r}>{r}</option>)}
        </select></FormField>
        <BtnPrimary onClick={submitWastage} className="mt-4"><Save size={18} /> Log Wastage</BtnPrimary>
      </Drawer>

      <Drawer open={showSupplier} onClose={() => setShowSupplier(false)} title="New Supplier">
        <FormField label="Name"><input className={inputClass} value={supplierForm.name} onChange={(e) => setSupplierForm({ ...supplierForm, name: e.target.value })} /></FormField>
        <FormField label="Contact"><input className={inputClass} value={supplierForm.contact} onChange={(e) => setSupplierForm({ ...supplierForm, contact: e.target.value })} /></FormField>
        <FormField label="Phone"><input className={inputClass} value={supplierForm.phone} onChange={(e) => setSupplierForm({ ...supplierForm, phone: e.target.value })} /></FormField>
        <FormField label="Email"><input className={inputClass} value={supplierForm.email} onChange={(e) => setSupplierForm({ ...supplierForm, email: e.target.value })} /></FormField>
        <BtnPrimary onClick={createSupplier} className="mt-4"><Save size={18} /> Create Supplier</BtnPrimary>
      </Drawer>

      <Drawer open={showPo} onClose={() => setShowPo(false)} title="New Purchase Order">
        <FormField label="Supplier"><select className={selectClass} value={poForm.supplierId} onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}>
          {suppliers.map((supplier) => <option key={supplier.id} value={supplier.id}>{supplier.name}</option>)}
        </select></FormField>
        <FormField label="Location"><select className={selectClass} value={poForm.locationId} onChange={(e) => setPoForm({ ...poForm, locationId: e.target.value })}>
          {locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}
        </select></FormField>
        <FormField label="Ingredient"><select className={selectClass} value={poForm.ingredientId} onChange={(e) => setPoForm({ ...poForm, ingredientId: e.target.value })}>
          {ingredients.map((ingredient) => <option key={ingredient.id} value={ingredient.id}>{ingredient.name} ({ingredient.unit})</option>)}
        </select></FormField>
        <FormField label="Quantity"><input type="number" className={inputClass} value={poForm.qtyOrdered} onChange={(e) => setPoForm({ ...poForm, qtyOrdered: Number(e.target.value) })} /></FormField>
        <FormField label="Unit Price"><input type="number" className={inputClass} value={poForm.unitPrice} onChange={(e) => setPoForm({ ...poForm, unitPrice: Number(e.target.value) })} /></FormField>
        <BtnPrimary onClick={createPo} className="mt-4"><Save size={18} /> Create PO</BtnPrimary>
      </Drawer>
    </div>
  );
}
