"use client";

import { Suspense, useEffect, useState, useCallback, useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, FilterBar, PageHeader, StatusDot, TabBar, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { ConfirmDialog, FormField, inputClass, selectClass, exportCsv } from "@/components/ui/forms";
import { ChartContainer } from "@/components/ui/chart-container";
import { stockStatus, cn, formatCurrency } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { useDebouncedValue } from "@/lib/use-debounce";
import { useApp } from "@/lib/context";
import { Plus, Save, Star } from "lucide-react";
import { format } from "date-fns";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";

interface StockRow { id: string; quantity: number; locationId: string; ingredient: { id: string; name: string; unit: string; threshold: number; category: string | null }; location: { id: string; name: string }; dailyUsage: number; daysToDepletion: number | null; }
interface Batch { id: string; number: string; ingredient: { name: string }; supplier: { name: string; fssaiLicense: string | null } | null; expiryDate: string | null; mfgDate: string | null; quantity: number; status: string; flag: string; }
interface Wastage { id: string; ingredient: { name: string }; quantity: number; reason: string; estCost: number; createdAt: string; }
interface Supplier { id: string; name: string; contact: string | null; phone: string | null; email: string | null; address: string | null; categories: string; paymentTerms: string | null; fssaiLicense: string | null; rating: number | null; leadTime: number | null; isActive: boolean; _count?: { purchaseOrders: number }; purchaseOrders?: { id: string; number: string; status: string; total: number; createdAt: string }[]; }
interface POLine { id: string; ingredient: { name: string; unit: string }; qtyOrdered: number; qtyReceived: number; unitPrice: number; }
interface PO { id: string; number: string; status: string; total: number; supplier: { name: string }; location?: { name: string }; lines: POLine[]; }
interface Transfer { id: string; fromName: string; toName: string; ingredientName: string; quantity: number; reason: string | null; status: string; createdAt: string; }
interface TrendIngredient { id: string; name: string; priceHistory: { unitPrice: number; recordedAt: string }[]; }
interface AlertIngredient { id: string; name: string; unit: string; threshold: number; alertChannels: string; totalStock: number; }
type Option = { id: string; name: string; unit?: string };

const WASTE_REASONS = ["Expired", "Spoiled", "Over-Prepared", "Dropped", "Other"];
const ADJUST_REASONS = ["Physical count", "Untracked usage", "Other"];
const CHANNELS = ["in_app", "whatsapp", "telegram"];
const parseJson = (s: string): string[] => { try { return JSON.parse(s); } catch { return []; } };

export default function InventoryPage() {
  return <Suspense fallback={<div className="animate-pulse h-32 bg-cream rounded-xl" />}><InventoryPageContent /></Suspense>;
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
  const [batches, setBatches] = useState<Batch[]>([]);
  const [wastage, setWastage] = useState<Wastage[]>([]);
  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [pos, setPos] = useState<PO[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [trendIngredients, setTrendIngredients] = useState<TrendIngredient[]>([]);
  const [alertIngredients, setAlertIngredients] = useState<AlertIngredient[]>([]);
  const [ingredients, setIngredients] = useState<Option[]>([]);
  const [poLocations, setPoLocations] = useState<Option[]>([]);

  // dialogs
  const [adjust, setAdjust] = useState<StockRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({ mode: "set" as "set" | "delta", value: 0, reason: ADJUST_REASONS[0], note: "" });
  const [showWastage, setShowWastage] = useState(false);
  const [wastageForm, setWastageForm] = useState({ stockId: "", quantity: 0, reason: "Expired" });
  const [supplierDetail, setSupplierDetail] = useState<Supplier | null>(null);
  const [creatingSupplier, setCreatingSupplier] = useState(false);
  const [showBatch, setShowBatch] = useState(false);
  const [batchForm, setBatchForm] = useState({ ingredientId: "", supplierId: "", mfgDate: "", expiryDate: "", quantity: 0 });
  const [showPo, setShowPo] = useState(false);
  const [poForm, setPoForm] = useState<{ supplierId: string; locationId: string; lines: { ingredientId: string; qtyOrdered: number; unitPrice: number }[] }>({ supplierId: "", locationId: "", lines: [] });
  const [poDetail, setPoDetail] = useState<PO | null>(null);
  const [receiveLines, setReceiveLines] = useState<Record<string, { receiveQty: number; actualUnitPrice: number }>>({});
  const [cancelPo, setCancelPo] = useState<string | null>(null);
  const [showTransfer, setShowTransfer] = useState(false);
  const [transferForm, setTransferForm] = useState({ fromLocationId: "", toLocationId: "", ingredientId: "", quantity: 0, reason: "" });
  const [trendIngId, setTrendIngId] = useState("");

  const load = useCallback(async () => {
    const params = new URLSearchParams({ tab });
    if (locationId) params.set("locationId", locationId);
    if (debouncedSearch && tab === "stock") params.set("search", debouncedSearch);
    const data = await apiFetch<Record<string, unknown>>(`/api/inventory?${params}`);
    if (tab === "stock") setStock((data.stock as StockRow[]) ?? []);
    if (tab === "batches") { setBatches((data.batches as Batch[]) ?? []); setIngredients((data.ingredients as Option[]) ?? []); setSuppliers((data.suppliers as Supplier[]) ?? []); }
    if (tab === "wastage") setWastage((data.wastage as Wastage[]) ?? []);
    if (tab === "suppliers") { setSuppliers((data.suppliers as Supplier[]) ?? []); setIngredients((data.ingredients as Option[]) ?? []); }
    if (tab === "pos") { setPos((data.purchaseOrders as PO[]) ?? []); setSuppliers((data.suppliers as Supplier[]) ?? []); setIngredients((data.ingredients as Option[]) ?? []); setPoLocations((data.locations as Option[]) ?? []); }
    if (tab === "transfers") { setTransfers((data.transfers as Transfer[]) ?? []); setPoLocations((data.locations as Option[]) ?? []); setIngredients((data.ingredients as Option[]) ?? []); }
    if (tab === "trends") setTrendIngredients((data.ingredients as TrendIngredient[]) ?? []);
    if (tab === "alerts") setAlertIngredients((data.ingredients as AlertIngredient[]) ?? []);
  }, [tab, locationId, debouncedSearch]);

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [load, toast]);
  useEffect(() => {
    const urlTab = searchParams.get("tab"); if (urlTab) setTab(urlTab);
    if (searchParams.get("filter") === "low") setLowStockOnly(true);
    const q = searchParams.get("search"); if (q) setSearch(q);
  }, [searchParams]);
  useEffect(() => { if (trendIngredients.length && !trendIngId) setTrendIngId(trendIngredients[0].id); }, [trendIngredients, trendIngId]);

  const visibleStock = useMemo(() => (lowStockOnly ? stock.filter((s) => s.quantity <= s.ingredient.threshold) : stock), [stock, lowStockOnly]);

  // ── actions ──
  const openAdjust = (row: StockRow) => { setAdjust(row); setAdjustForm({ mode: "set", value: row.quantity, reason: ADJUST_REASONS[0], note: "" }); };
  const saveAdjust = async () => {
    if (!adjust) return;
    try {
      const reason = adjustForm.reason === "Other" ? `Other: ${adjustForm.note}` : adjustForm.reason;
      const payload = adjustForm.mode === "set" ? { quantity: Number(adjustForm.value) } : { delta: Number(adjustForm.value) };
      await apiFetch("/api/inventory", { method: "PATCH", body: JSON.stringify({ type: "stock", id: adjust.id, ...payload, reason }) });
      toast("Stock updated"); setAdjust(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const submitWastage = async () => {
    try {
      const match = stock.find((s) => s.id === wastageForm.stockId) ?? (await apiFetch<{ stock: StockRow[] }>(`/api/inventory?tab=stock`)).stock.find((s) => s.id === wastageForm.stockId);
      if (!match) { toast("Select ingredient & location", "error"); return; }
      await apiFetch("/api/inventory", { method: "POST", body: JSON.stringify({ type: "wastage", ingredientId: match.ingredient.id, locationId: match.locationId, quantity: Number(wastageForm.quantity), reason: wastageForm.reason }) });
      toast("Wastage logged, stock reduced"); setShowWastage(false); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const saveSupplier = async () => {
    if (!supplierDetail) return;
    try {
      const data = { name: supplierDetail.name, contact: supplierDetail.contact, phone: supplierDetail.phone, email: supplierDetail.email, address: supplierDetail.address, paymentTerms: supplierDetail.paymentTerms, fssaiLicense: supplierDetail.fssaiLicense, rating: supplierDetail.rating != null ? Number(supplierDetail.rating) : null, leadTime: supplierDetail.leadTime != null ? Number(supplierDetail.leadTime) : null, isActive: supplierDetail.isActive };
      if (creatingSupplier) { await apiFetch("/api/inventory", { method: "POST", body: JSON.stringify({ type: "supplier", data }) }); toast("Supplier created"); }
      else { await apiFetch("/api/inventory", { method: "PATCH", body: JSON.stringify({ type: "supplier", id: supplierDetail.id, data }) }); toast("Supplier saved"); }
      setSupplierDetail(null); setCreatingSupplier(false); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const deactivateSupplier = async (id: string) => { try { await apiFetch(`/api/inventory?type=supplier&id=${id}`, { method: "DELETE" }); toast("Supplier deactivated"); setSupplierDetail(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const createBatch = async () => {
    try { await apiFetch("/api/inventory", { method: "POST", body: JSON.stringify({ type: "batch", ...batchForm, supplierId: batchForm.supplierId || null }) }); toast("Batch recorded"); setShowBatch(false); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const createPo = async () => {
    try {
      if (!poForm.supplierId || poForm.lines.length === 0) { toast("Pick a supplier and add at least one line", "error"); return; }
      await apiFetch("/api/inventory", { method: "POST", body: JSON.stringify({ type: "po", supplierId: poForm.supplierId, locationId: poForm.locationId || locationId || locations[0]?.id, lines: poForm.lines }) });
      toast("Purchase order submitted"); setShowPo(false); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const openPoDetail = (po: PO) => { setPoDetail(po); setReceiveLines(Object.fromEntries(po.lines.map((l) => [l.id, { receiveQty: l.qtyOrdered - l.qtyReceived, actualUnitPrice: l.unitPrice }]))); };
  const receivePo = async (full: boolean) => {
    if (!poDetail) return;
    try {
      const lines = full ? undefined : poDetail.lines.map((l) => ({ id: l.id, receiveQty: receiveLines[l.id]?.receiveQty ?? 0, actualUnitPrice: receiveLines[l.id]?.actualUnitPrice ?? l.unitPrice }));
      await apiFetch("/api/inventory", { method: "PATCH", body: JSON.stringify({ type: "receive_po", id: poDetail.id, lines }) });
      toast("Received — stock & recipe costs updated"); setPoDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const doCancelPo = async () => { if (!cancelPo) return; try { await apiFetch(`/api/inventory?type=po&id=${cancelPo}`, { method: "DELETE" }); toast("PO cancelled"); setCancelPo(null); setPoDetail(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const createTransfer = async () => {
    try {
      const ing = ingredients.find((i) => i.id === transferForm.ingredientId);
      const from = poLocations.find((l) => l.id === transferForm.fromLocationId); const to = poLocations.find((l) => l.id === transferForm.toLocationId);
      if (!from || !to || from.id === to.id || !ing) { toast("Pick distinct from/to locations and an ingredient", "error"); return; }
      await apiFetch("/api/inventory", { method: "POST", body: JSON.stringify({ type: "transfer", fromLocationId: from.id, fromName: from.name, toLocationId: to.id, toName: to.name, ingredientId: ing.id, ingredientName: ing.name, quantity: Number(transferForm.quantity), reason: transferForm.reason }) });
      toast("Transfer requested"); setShowTransfer(false); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const transferAction = async (id: string, action: string) => { try { await apiFetch("/api/inventory", { method: "PATCH", body: JSON.stringify({ type: "transfer", id, action }) }); toast(`Transfer ${action}d`); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const saveAlert = async (ing: AlertIngredient, threshold: number, channels: string[]) => { try { await apiFetch("/api/inventory", { method: "PATCH", body: JSON.stringify({ type: "ingredient", id: ing.id, threshold, alertChannels: channels }) }); toast("Alert config saved"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  const poTotal = poForm.lines.reduce((s, l) => s + Number(l.qtyOrdered) * Number(l.unitPrice), 0);

  const stockColumns: Column<StockRow>[] = [
    { key: "name", header: "Ingredient", render: (r) => r.ingredient.name },
    { key: "qty", header: "Qty", align: "right", render: (r) => `${r.quantity} ${r.ingredient.unit}` },
    { key: "status", header: "Status", render: (r) => { const s = stockStatus(r.quantity, r.ingredient.threshold); return <StatusDot status={s} label={s === "healthy" ? "Healthy" : s === "warning" ? "Low" : "Critical"} />; } },
    { key: "depletion", header: "Days left", align: "right", render: (r) => r.daysToDepletion == null ? <span className="text-muted">—</span> : <span className={cn("tabular-nums font-bold", r.daysToDepletion <= 3 && "text-red-600", r.daysToDepletion > 3 && r.daysToDepletion <= 7 && "text-amber-700")}>{r.daysToDepletion}d</span> },
    { key: "usage", header: "Usage/day", align: "right", render: (r) => <span className="tabular-nums text-muted">{r.dailyUsage || "—"}</span> },
    { key: "location", header: "Location", render: (r) => r.location.name },
  ];

  const FLAG_PILL: Record<string, string> = { expired: "bg-red-100 text-red-700", approaching: "bg-amber-100 text-amber-800", ok: "bg-green-100 text-green-700" };

  return (
    <div>
      <PageHeader title="Inventory" subtitle="Stock, depletion forecast, batches, wastage, suppliers, POs, transfers, cost trends, alerts"
        actions={<div className="flex gap-2">
          {tab === "suppliers" && <BtnSecondary onClick={() => { setCreatingSupplier(true); setSupplierDetail({ id: "", name: "", contact: "", phone: "", email: "", address: "", categories: "[]", paymentTerms: "", fssaiLicense: "", rating: null, leadTime: null, isActive: true }); }}><Plus size={18} /> Supplier</BtnSecondary>}
          {tab === "batches" && <BtnSecondary onClick={() => { setBatchForm({ ingredientId: ingredients[0]?.id ?? "", supplierId: "", mfgDate: "", expiryDate: "", quantity: 0 }); setShowBatch(true); }}><Plus size={18} /> Batch</BtnSecondary>}
          {tab === "pos" && <BtnSecondary onClick={() => { setPoForm({ supplierId: suppliers[0]?.id ?? "", locationId: locationId ?? poLocations[0]?.id ?? "", lines: [{ ingredientId: ingredients[0]?.id ?? "", qtyOrdered: 1, unitPrice: 0 }] }); setShowPo(true); }}><Plus size={18} /> PO</BtnSecondary>}
          {tab === "transfers" && <BtnSecondary onClick={() => { setTransferForm({ fromLocationId: poLocations[0]?.id ?? "", toLocationId: poLocations[1]?.id ?? "", ingredientId: ingredients[0]?.id ?? "", quantity: 0, reason: "" }); setShowTransfer(true); }}><Plus size={18} /> Transfer</BtnSecondary>}
          <BtnPrimary onClick={() => { setShowWastage(true); setWastageForm({ stockId: stock[0]?.id ?? "", quantity: 0, reason: "Expired" }); }}><Plus size={18} /> Log Wastage</BtnPrimary>
        </div>} />

      <TabBar tabs={[{ id: "stock", label: "Stock" }, { id: "alerts", label: "Alerts" }, { id: "batches", label: "Batches" }, { id: "wastage", label: "Wastage" }, { id: "suppliers", label: "Suppliers" }, { id: "pos", label: "Purchase Orders" }, { id: "transfers", label: "Transfers" }, { id: "trends", label: "Cost Trends" }]} active={tab} onChange={setTab} />

      {tab === "stock" && (
        <>
          <FilterBar search={search} onSearchChange={setSearch} />
          <div className="flex items-center gap-2 mb-4">
            <button type="button" onClick={() => setLowStockOnly((v) => !v)} className={cn("h-10 px-4 rounded-xl border-2 text-sm font-bold focus-ring", lowStockOnly ? "border-red-400 bg-red-50 text-red-800" : "border-border bg-white text-black hover:bg-cream")}>Low stock only {lowStockOnly ? `(${visibleStock.length})` : ""}</button>
          </div>
          <DenseGrid columns={stockColumns} data={visibleStock} selectable={false} onRowClick={openAdjust} />
        </>
      )}

      {tab === "alerts" && (
        <div className="space-y-3">
          <p className="text-sm font-medium text-muted">Set the reorder threshold and which channels fire when an ingredient breaches it. In-app alerts are always on.</p>
          {alertIngredients.map((ing) => <AlertRow key={ing.id} ing={ing} onSave={saveAlert} />)}
          {alertIngredients.length === 0 && <p className="text-muted text-center py-8 font-semibold">No ingredients</p>}
        </div>
      )}

      {tab === "batches" && (
        <DenseGrid columns={[
          { key: "number", header: "Batch #" },
          { key: "ingredient", header: "Ingredient", render: (r: Batch) => r.ingredient.name },
          { key: "supplier", header: "Supplier", render: (r: Batch) => r.supplier?.name ?? "—" },
          { key: "expiry", header: "Expiry", render: (r: Batch) => r.expiryDate ? format(new Date(r.expiryDate), "dd MMM yyyy") : "—" },
          { key: "flag", header: "Status", render: (r: Batch) => <span className={cn("px-2 py-0.5 rounded-lg text-xs font-bold capitalize", FLAG_PILL[r.flag])}>{r.flag === "ok" ? "Fresh" : r.flag}</span> },
          { key: "qty", header: "Qty", align: "right", render: (r: Batch) => r.quantity },
        ]} data={batches} selectable={false} onRowClick={() => {}} emptyMessage="No batches — record one to track expiry (FIFO)" />
      )}

      {tab === "wastage" && (
        <DenseGrid columns={[
          { key: "ingredient", header: "Ingredient", render: (r: Wastage) => r.ingredient.name },
          { key: "qty", header: "Qty", align: "right", render: (r: Wastage) => r.quantity },
          { key: "reason", header: "Reason" },
          { key: "cost", header: "Est. cost", align: "right", render: (r: Wastage) => formatCurrency(r.estCost) },
          { key: "date", header: "Date", render: (r: Wastage) => format(new Date(r.createdAt), "dd MMM HH:mm") },
        ]} data={wastage} selectable={false} onRowClick={() => {}} />
      )}

      {tab === "suppliers" && (
        <DenseGrid columns={[
          { key: "name", header: "Supplier" },
          { key: "phone", header: "Phone", render: (r: Supplier) => r.phone ?? "—" },
          { key: "lead", header: "Lead time", align: "right", render: (r: Supplier) => r.leadTime != null ? `${r.leadTime}d` : "—" },
          { key: "rating", header: "Rating", align: "right", render: (r: Supplier) => r.rating != null ? <span className="inline-flex items-center gap-1 font-bold"><Star size={12} className="text-amber-500 fill-amber-500" />{r.rating.toFixed(1)}</span> : "—" },
          { key: "pos", header: "POs", align: "right", render: (r: Supplier) => r._count?.purchaseOrders ?? 0 },
          { key: "active", header: "Status", render: (r: Supplier) => <StatusDot status={r.isActive ? "active" : "cancelled"} label={r.isActive ? "Active" : "Inactive"} /> },
        ]} data={suppliers} selectable={false} onRowClick={(s) => { setCreatingSupplier(false); setSupplierDetail(s); }} />
      )}

      {tab === "pos" && (
        <DenseGrid columns={[
          { key: "number", header: "PO #" },
          { key: "supplier", header: "Supplier", render: (r: PO) => r.supplier.name },
          { key: "lines", header: "Lines", align: "right", render: (r: PO) => r.lines.length },
          { key: "status", header: "Status", render: (r: PO) => <StatusDot status={r.status === "partially_received" ? "preparing" : r.status} label={r.status.replace(/_/g, " ")} /> },
          { key: "total", header: "Total", align: "right", render: (r: PO) => formatCurrency(r.total) },
        ]} data={pos} selectable={false} onRowClick={openPoDetail} emptyMessage="No purchase orders" />
      )}

      {tab === "transfers" && (
        <DenseGrid columns={[
          { key: "ing", header: "Ingredient", render: (r: Transfer) => r.ingredientName },
          { key: "route", header: "Route", render: (r: Transfer) => `${r.fromName} → ${r.toName}` },
          { key: "qty", header: "Qty", align: "right", render: (r: Transfer) => r.quantity },
          { key: "status", header: "Status", render: (r: Transfer) => <StatusDot status={r.status === "requested" ? "pending" : r.status === "approved" ? "confirmed" : r.status === "received" ? "completed" : "cancelled"} label={r.status} /> },
          { key: "action", header: "Action", render: (r: Transfer) => (
            <span className="flex gap-2" onClick={(e) => e.stopPropagation()}>
              {r.status === "requested" && <><button type="button" onClick={() => transferAction(r.id, "approve")} className="font-bold underline">Approve</button><button type="button" onClick={() => transferAction(r.id, "reject")} className="font-bold underline text-red-600">Reject</button></>}
              {r.status === "approved" && <button type="button" onClick={() => transferAction(r.id, "receive")} className="font-bold underline">Receive</button>}
              {(r.status === "received" || r.status === "rejected") && <span className="text-muted">—</span>}
            </span>
          ) },
        ]} data={transfers} selectable={false} onRowClick={() => {}} emptyMessage="No transfers" />
      )}

      {tab === "trends" && (
        <div className="space-y-4">
          <FormField label="Ingredient"><select className={selectClass + " max-w-xs"} value={trendIngId} onChange={(e) => setTrendIngId(e.target.value)}>{trendIngredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></FormField>
          <TrendChart ing={trendIngredients.find((i) => i.id === trendIngId)} />
        </div>
      )}

      {/* ── Adjust ── */}
      <Drawer open={!!adjust} onClose={() => setAdjust(null)} title={`Adjust: ${adjust?.ingredient.name ?? ""}`}>
        <div className="flex gap-2 mb-3">
          <button type="button" onClick={() => setAdjustForm({ ...adjustForm, mode: "set" })} className={cn("h-10 px-4 rounded-xl border-2 font-bold text-sm", adjustForm.mode === "set" ? "border-primary bg-primary/20" : "border-border")}>Set to</button>
          <button type="button" onClick={() => setAdjustForm({ ...adjustForm, mode: "delta" })} className={cn("h-10 px-4 rounded-xl border-2 font-bold text-sm", adjustForm.mode === "delta" ? "border-primary bg-primary/20" : "border-border")}>Adjust by +/−</button>
        </div>
        <FormField label={adjustForm.mode === "set" ? "New quantity" : "Change (+/−)"}><input type="number" step="0.1" className={inputClass} value={adjustForm.value} onChange={(e) => setAdjustForm({ ...adjustForm, value: Number(e.target.value) })} /></FormField>
        <FormField label="Reason" required><select className={selectClass} value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })}>{ADJUST_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></FormField>
        {adjustForm.reason === "Other" && <FormField label="Note"><input className={inputClass} value={adjustForm.note} onChange={(e) => setAdjustForm({ ...adjustForm, note: e.target.value })} /></FormField>}
        <p className="text-xs text-muted font-medium mb-3">Stock can&apos;t go below zero. Depleting an ingredient auto-86s its menu items.</p>
        <BtnPrimary onClick={saveAdjust}><Save size={18} /> Save Adjustment</BtnPrimary>
      </Drawer>

      {/* ── Wastage ── */}
      <Drawer open={showWastage} onClose={() => setShowWastage(false)} title="Log Wastage">
        <FormField label="Ingredient · Location"><select className={selectClass} value={wastageForm.stockId} onChange={(e) => setWastageForm({ ...wastageForm, stockId: e.target.value })}>{stock.map((s) => <option key={s.id} value={s.id}>{s.ingredient.name} — {s.location.name}</option>)}</select></FormField>
        <FormField label="Quantity"><input type="number" step="0.1" className={inputClass} value={wastageForm.quantity} onChange={(e) => setWastageForm({ ...wastageForm, quantity: Number(e.target.value) })} /></FormField>
        <FormField label="Reason"><select className={selectClass} value={wastageForm.reason} onChange={(e) => setWastageForm({ ...wastageForm, reason: e.target.value })}>{WASTE_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}</select></FormField>
        <BtnPrimary onClick={submitWastage} className="mt-4"><Save size={18} /> Log Wastage</BtnPrimary>
      </Drawer>

      {/* ── Supplier detail/create ── */}
      <Drawer open={!!supplierDetail} onClose={() => { setSupplierDetail(null); setCreatingSupplier(false); }} title={creatingSupplier ? "New Supplier" : supplierDetail?.name ?? ""} width="600px">
        {supplierDetail && (
          <div className="space-y-1">
            <div className="grid grid-cols-2 gap-3">
              <FormField label="Name" required><input className={inputClass} value={supplierDetail.name} onChange={(e) => setSupplierDetail({ ...supplierDetail, name: e.target.value })} /></FormField>
              <FormField label="Contact person"><input className={inputClass} value={supplierDetail.contact ?? ""} onChange={(e) => setSupplierDetail({ ...supplierDetail, contact: e.target.value })} /></FormField>
              <FormField label="Phone"><input className={inputClass} value={supplierDetail.phone ?? ""} onChange={(e) => setSupplierDetail({ ...supplierDetail, phone: e.target.value })} /></FormField>
              <FormField label="Email"><input className={inputClass} value={supplierDetail.email ?? ""} onChange={(e) => setSupplierDetail({ ...supplierDetail, email: e.target.value })} /></FormField>
              <FormField label="Payment terms"><input className={inputClass} placeholder="Net 30" value={supplierDetail.paymentTerms ?? ""} onChange={(e) => setSupplierDetail({ ...supplierDetail, paymentTerms: e.target.value })} /></FormField>
              <FormField label="FSSAI license"><input className={inputClass} value={supplierDetail.fssaiLicense ?? ""} onChange={(e) => setSupplierDetail({ ...supplierDetail, fssaiLicense: e.target.value })} /></FormField>
              <FormField label="Rating (0–5)"><input type="number" step="0.1" min="0" max="5" className={inputClass} value={supplierDetail.rating ?? ""} onChange={(e) => setSupplierDetail({ ...supplierDetail, rating: e.target.value === "" ? null : Number(e.target.value) })} /></FormField>
              <FormField label="Lead time (days)"><input type="number" className={inputClass} value={supplierDetail.leadTime ?? ""} onChange={(e) => setSupplierDetail({ ...supplierDetail, leadTime: e.target.value === "" ? null : Number(e.target.value) })} /></FormField>
            </div>
            <FormField label="Address"><textarea className={`${inputClass} min-h-16`} value={supplierDetail.address ?? ""} onChange={(e) => setSupplierDetail({ ...supplierDetail, address: e.target.value })} /></FormField>
            {!creatingSupplier && supplierDetail.purchaseOrders && supplierDetail.purchaseOrders.length > 0 && (
              <div className="mt-3"><h3 className="font-bold mb-2">PO history</h3>
                <ul className="space-y-1 text-sm">{supplierDetail.purchaseOrders.map((p) => <li key={p.id} className="flex justify-between p-2 bg-cream rounded-lg"><span>{p.number} · {p.status.replace(/_/g, " ")}</span><span className="font-bold">{formatCurrency(p.total)}</span></li>)}</ul>
              </div>
            )}
            <div className="flex gap-3 mt-4 pt-4 border-t border-border">
              <BtnPrimary onClick={saveSupplier}><Save size={18} /> {creatingSupplier ? "Create" : "Save"}</BtnPrimary>
              {!creatingSupplier && supplierDetail.isActive && <BtnSecondary onClick={() => deactivateSupplier(supplierDetail.id)}>Deactivate</BtnSecondary>}
            </div>
          </div>
        )}
      </Drawer>

      {/* ── Batch create ── */}
      <Drawer open={showBatch} onClose={() => setShowBatch(false)} title="Record Batch">
        <FormField label="Ingredient"><select className={selectClass} value={batchForm.ingredientId} onChange={(e) => setBatchForm({ ...batchForm, ingredientId: e.target.value })}>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></FormField>
        <FormField label="Supplier"><select className={selectClass} value={batchForm.supplierId} onChange={(e) => setBatchForm({ ...batchForm, supplierId: e.target.value })}><option value="">—</option>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Mfg date"><input type="date" className={inputClass} value={batchForm.mfgDate} onChange={(e) => setBatchForm({ ...batchForm, mfgDate: e.target.value })} /></FormField>
          <FormField label="Expiry date"><input type="date" className={inputClass} value={batchForm.expiryDate} onChange={(e) => setBatchForm({ ...batchForm, expiryDate: e.target.value })} /></FormField>
        </div>
        <FormField label="Quantity"><input type="number" className={inputClass} value={batchForm.quantity} onChange={(e) => setBatchForm({ ...batchForm, quantity: Number(e.target.value) })} /></FormField>
        <BtnPrimary onClick={createBatch} className="mt-2"><Save size={18} /> Save Batch</BtnPrimary>
      </Drawer>

      {/* ── PO create (multi-line) ── */}
      <Drawer open={showPo} onClose={() => setShowPo(false)} title="New Purchase Order" width="640px">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Supplier"><select className={selectClass} value={poForm.supplierId} onChange={(e) => setPoForm({ ...poForm, supplierId: e.target.value })}>{suppliers.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormField>
          <FormField label="Location"><select className={selectClass} value={poForm.locationId} onChange={(e) => setPoForm({ ...poForm, locationId: e.target.value })}>{poLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></FormField>
        </div>
        <div className="flex items-center justify-between mb-2"><h3 className="font-bold">Line items</h3><BtnSecondary onClick={() => setPoForm({ ...poForm, lines: [...poForm.lines, { ingredientId: ingredients[0]?.id ?? "", qtyOrdered: 1, unitPrice: 0 }] })}><Plus size={16} /> Add line</BtnSecondary></div>
        <div className="space-y-2">
          {poForm.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_80px_90px_40px] gap-2 items-center">
              <select className={selectClass} value={l.ingredientId} onChange={(e) => setPoForm({ ...poForm, lines: poForm.lines.map((x, idx) => idx === i ? { ...x, ingredientId: e.target.value } : x) })}>{ingredients.map((ing) => <option key={ing.id} value={ing.id}>{ing.name}</option>)}</select>
              <input type="number" className={inputClass} value={l.qtyOrdered} title="Qty" onChange={(e) => setPoForm({ ...poForm, lines: poForm.lines.map((x, idx) => idx === i ? { ...x, qtyOrdered: Number(e.target.value) } : x) })} />
              <input type="number" className={inputClass} value={l.unitPrice} title="Unit price" onChange={(e) => setPoForm({ ...poForm, lines: poForm.lines.map((x, idx) => idx === i ? { ...x, unitPrice: Number(e.target.value) } : x) })} />
              <button type="button" onClick={() => setPoForm({ ...poForm, lines: poForm.lines.filter((_, idx) => idx !== i) })} className="h-12 rounded-xl border-2 border-border text-red-600 font-bold">×</button>
            </div>
          ))}
        </div>
        <p className="font-bold text-right mt-3">Total: {formatCurrency(poTotal)}</p>
        <BtnPrimary onClick={createPo} className="mt-2"><Save size={18} /> Submit PO</BtnPrimary>
      </Drawer>

      {/* ── PO detail / receive ── */}
      <Drawer open={!!poDetail} onClose={() => setPoDetail(null)} title={poDetail?.number ?? ""} width="640px">
        {poDetail && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <StatusDot status={poDetail.status === "partially_received" ? "preparing" : poDetail.status} label={poDetail.status.replace(/_/g, " ")} />
              <BtnSecondary onClick={() => { exportCsv(`${poDetail.number}.csv`, ["Ingredient", "Ordered", "Received", "Unit Price"], poDetail.lines.map((l) => [l.ingredient.name, l.qtyOrdered, l.qtyReceived, l.unitPrice])); toast("PO exported"); }}>Export</BtnSecondary>
            </div>
            <div className="space-y-2">
              {poDetail.lines.map((l) => {
                const open = poDetail.status !== "received" && poDetail.status !== "cancelled";
                return (
                  <div key={l.id} className="p-3 bg-cream rounded-xl">
                    <div className="flex justify-between font-bold"><span>{l.ingredient.name}</span><span>{l.qtyReceived}/{l.qtyOrdered} {l.ingredient.unit}</span></div>
                    {open && (
                      <div className="grid grid-cols-2 gap-2 mt-2">
                        <label className="text-xs font-bold">Receive qty<input type="number" className={inputClass} value={receiveLines[l.id]?.receiveQty ?? 0} onChange={(e) => setReceiveLines({ ...receiveLines, [l.id]: { ...receiveLines[l.id], receiveQty: Number(e.target.value) } })} /></label>
                        <label className="text-xs font-bold">Actual unit price<input type="number" className={inputClass} value={receiveLines[l.id]?.actualUnitPrice ?? l.unitPrice} onChange={(e) => setReceiveLines({ ...receiveLines, [l.id]: { ...receiveLines[l.id], actualUnitPrice: Number(e.target.value) } })} /></label>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            {poDetail.status !== "received" && poDetail.status !== "cancelled" && (
              <div className="flex gap-3 pt-4 border-t border-border">
                <BtnPrimary onClick={() => receivePo(false)}><Save size={18} /> Receive entered</BtnPrimary>
                <BtnSecondary onClick={() => receivePo(true)}>Receive all</BtnSecondary>
                {poDetail.status !== "partially_received" && <BtnSecondary onClick={() => setCancelPo(poDetail.id)}>Cancel PO</BtnSecondary>}
              </div>
            )}
          </div>
        )}
      </Drawer>

      {/* ── Transfer create ── */}
      <Drawer open={showTransfer} onClose={() => setShowTransfer(false)} title="Inter-location Transfer">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="From"><select className={selectClass} value={transferForm.fromLocationId} onChange={(e) => setTransferForm({ ...transferForm, fromLocationId: e.target.value })}>{poLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></FormField>
          <FormField label="To"><select className={selectClass} value={transferForm.toLocationId} onChange={(e) => setTransferForm({ ...transferForm, toLocationId: e.target.value })}>{poLocations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></FormField>
        </div>
        <FormField label="Ingredient"><select className={selectClass} value={transferForm.ingredientId} onChange={(e) => setTransferForm({ ...transferForm, ingredientId: e.target.value })}>{ingredients.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></FormField>
        <FormField label="Quantity"><input type="number" className={inputClass} value={transferForm.quantity} onChange={(e) => setTransferForm({ ...transferForm, quantity: Number(e.target.value) })} /></FormField>
        <FormField label="Reason"><input className={inputClass} value={transferForm.reason} onChange={(e) => setTransferForm({ ...transferForm, reason: e.target.value })} /></FormField>
        <BtnPrimary onClick={createTransfer} className="mt-2"><Save size={18} /> Request Transfer</BtnPrimary>
      </Drawer>

      <ConfirmDialog open={!!cancelPo} title="Cancel purchase order?" message="Only non-received POs can be cancelled." confirmLabel="Cancel PO" destructive onConfirm={doCancelPo} onCancel={() => setCancelPo(null)} />
    </div>
  );
}

function AlertRow({ ing, onSave }: { ing: AlertIngredient; onSave: (ing: AlertIngredient, threshold: number, channels: string[]) => void }) {
  const [threshold, setThreshold] = useState(ing.threshold);
  const [channels, setChannels] = useState<string[]>(parseJson(ing.alertChannels));
  const breached = ing.totalStock <= threshold;
  return (
    <div className={cn("flex flex-wrap items-center gap-3 p-3 rounded-xl border-2", breached ? "border-red-300 bg-red-50" : "border-border bg-white")}>
      <span className="font-bold min-w-[140px]">{ing.name}</span>
      <span className="text-sm text-muted">In stock: <b className="tabular-nums">{ing.totalStock} {ing.unit}</b></span>
      <label className="text-sm font-bold flex items-center gap-2">Threshold<input type="number" className="w-24 h-9 px-2 border-2 border-border rounded-lg" value={threshold} onChange={(e) => setThreshold(Number(e.target.value))} /></label>
      <div className="flex gap-1.5">{CHANNELS.map((c) => (
        <button key={c} type="button" onClick={() => setChannels(channels.includes(c) ? channels.filter((x) => x !== c) : [...channels, c])}
          className={cn("px-2.5 py-1 rounded-lg text-xs font-bold border-2 capitalize", channels.includes(c) ? "bg-primary border-primary" : "border-border bg-white text-muted")}>{c.replace("_", "-")}</button>
      ))}</div>
      <BtnSecondary onClick={() => onSave(ing, threshold, channels)} className="ml-auto"><Save size={14} /> Save</BtnSecondary>
    </div>
  );
}

function TrendChart({ ing }: { ing?: TrendIngredient }) {
  if (!ing || ing.priceHistory.length === 0) return <p className="text-muted font-medium p-8 text-center page-surface">No price history yet. Receive a PO to start tracking unit-price trends.</p>;
  const data = ing.priceHistory.map((p) => ({ date: format(new Date(p.recordedAt), "dd MMM"), price: p.unitPrice }));
  const first = ing.priceHistory[0].unitPrice; const last = ing.priceHistory[ing.priceHistory.length - 1].unitPrice;
  const change = first > 0 ? ((last - first) / first) * 100 : 0;
  return (
    <div className="page-surface p-5">
      <div className="flex items-center justify-between mb-3">
        <h3 className="font-bold">{ing.name} — unit price</h3>
        <span className={cn("text-sm font-bold", Math.abs(change) > 10 ? "text-red-600" : "text-muted")}>{change >= 0 ? "▲" : "▼"} {Math.abs(change).toFixed(1)}% {Math.abs(change) > 10 && "⚠ spike"}</span>
      </div>
      <ChartContainer height={240}>
        <LineChart data={data}><CartesianGrid strokeDasharray="3 3" /><XAxis dataKey="date" /><YAxis /><Tooltip formatter={(v) => formatCurrency(Number(v))} /><Line type="monotone" dataKey="price" stroke="#F4B315" strokeWidth={3} dot /></LineChart>
      </ChartContainer>
    </div>
  );
}
