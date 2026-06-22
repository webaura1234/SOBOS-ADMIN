"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, FilterBar, PageHeader, StatusDot, SourceBadge, TabBar, BtnPrimary, LabeledFilterSelect, StatCards } from "@/components/ui/shared";
import { FormField, inputClass, selectClass } from "@/components/ui/forms";
import { formatCurrency, cn } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { useDebouncedValue } from "@/lib/use-debounce";
import { useInterval } from "@/lib/use-interval";
import { useApp } from "@/lib/context";
import { SavedViewsBar } from "@/components/ui/saved-views";
import { format } from "date-fns";
import { Save, X, Radio } from "lucide-react";

const DEFAULT_PERIOD = "week";

interface OrderRow {
  id: string; number: string; source: string; status: string; total: number;
  tableLabel: string | null; createdAt: string;
  items?: { id: string; name: string; quantity: number; price: number; status: string }[];
  _count: { items: number };
}

const STATUS_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "confirmed", label: "Confirmed" },
  { value: "preparing", label: "Preparing" },
  { value: "ready", label: "Ready" },
  { value: "served", label: "Served" },
  { value: "cancelled", label: "Cancelled" },
];

const SOURCE_OPTIONS = [
  { value: "", label: "All" },
  { value: "dine_in", label: "Dine-In" },
  { value: "takeaway", label: "Takeaway" },
  { value: "swiggy", label: "Swiggy" },
  { value: "zomato", label: "Zomato" },
  { value: "qr", label: "QR" },
];

const PERIOD_OPTIONS = [
  { value: "today", label: "Today" },
  { value: "week", label: "Last 7 days" },
  { value: "", label: "All time" },
];

const TABLE_OPTIONS = [
  { value: "", label: "All" },
  { value: "with_table", label: "Table only" },
  { value: "no_table", label: "No table" },
];

interface OrderConfig {
  dineIn: boolean;
  takeaway: boolean;
  counter: boolean;
  qr: boolean;
  requireCancelReason: boolean;
}

interface KdsConfig {
  enabled: boolean;
  blueOrange: number;
  orangeRed: number;
  audioOnRed: boolean;
}

interface ReceiptConfig {
  footerText: string;
  autoPrint: boolean;
  showGstin: boolean;
}

const DEFAULT_ORDER_CONFIG: OrderConfig = { dineIn: true, takeaway: true, counter: true, qr: true, requireCancelReason: true };
const DEFAULT_KDS_CONFIG: KdsConfig = { enabled: false, blueOrange: 15, orangeRed: 20, audioOnRed: true };
const DEFAULT_RECEIPT_CONFIG: ReceiptConfig = { footerText: "Thank you for dining with us!", autoPrint: true, showGstin: true };

export default function OrdersPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-32 bg-cream rounded-xl" />}>
      <OrdersPageContent />
    </Suspense>
  );
}

function OrdersPageContent() {
  const { toast } = useToast();
  const { locationId } = useApp();
  const searchParams = useSearchParams();
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [liveMode, setLiveMode] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search, 300);
  const [statusFilter, setStatusFilter] = useState("");
  const [sourceFilter, setSourceFilter] = useState("");
  const [periodFilter, setPeriodFilter] = useState(DEFAULT_PERIOD);
  const [tableFilter, setTableFilter] = useState("");
  const [tab, setTab] = useState("list");
  const [detail, setDetail] = useState<OrderRow | null>(null);
  const [newStatus, setNewStatus] = useState("");
  const [cancelReason, setCancelReason] = useState("");
  const [orderConfig, setOrderConfig] = useState<OrderConfig>(DEFAULT_ORDER_CONFIG);
  const [kdsConfig, setKdsConfig] = useState<KdsConfig>(DEFAULT_KDS_CONFIG);
  const [receiptConfig, setReceiptConfig] = useState<ReceiptConfig>(DEFAULT_RECEIPT_CONFIG);

  const hasActiveFilters = !!(search || statusFilter || sourceFilter || periodFilter !== DEFAULT_PERIOD || tableFilter);
  const currentFilters = { search, statusFilter, sourceFilter, periodFilter, tableFilter };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (locationId) params.set("locationId", locationId);
      if (debouncedSearch) params.set("search", debouncedSearch);
      if (statusFilter) params.set("status", statusFilter);
      if (sourceFilter) params.set("source", sourceFilter);
      if (periodFilter) params.set("period", periodFilter);
      if (tableFilter) params.set("table", tableFilter);
      const data = await apiFetch<OrderRow[]>(`/api/orders?${params}`);
      setOrders(Array.isArray(data) ? data : []);
      setLastUpdated(new Date());
    } finally {
      setLoading(false);
    }
  }, [locationId, debouncedSearch, statusFilter, sourceFilter, periodFilter, tableFilter]);

  useEffect(() => {
    load().catch((e) => toast(e instanceof Error ? e.message : "Failed to load orders", "error"));
  }, [load, toast]);

  useEffect(() => {
    apiFetch<{ orderControls?: Partial<OrderConfig>; kds?: Partial<KdsConfig>; receipt?: Partial<ReceiptConfig> }>("/api/admin-config?scope=orders")
      .then((config) => {
        setOrderConfig({ ...DEFAULT_ORDER_CONFIG, ...config.orderControls });
        setKdsConfig({ ...DEFAULT_KDS_CONFIG, ...config.kds });
        setReceiptConfig({ ...DEFAULT_RECEIPT_CONFIG, ...config.receipt });
      })
      .catch(() => {});
  }, []);

  useInterval(() => {
    if (liveMode && tab === "list") {
      load().catch(() => {});
    }
  }, liveMode && tab === "list" ? 15000 : null);

  useEffect(() => {
    const openId = searchParams.get("open");
    if (!openId) return;
    apiFetch<OrderRow | null>(`/api/orders?id=${openId}`)
      .then((full) => {
        if (full) {
          setDetail(full);
          setNewStatus(full.status);
          setCancelReason("");
        }
      })
      .catch(() => {});
  }, [searchParams]);

  const clearFilters = () => {
    setSearch("");
    setStatusFilter("");
    setSourceFilter("");
    setPeriodFilter(DEFAULT_PERIOD);
    setTableFilter("");
  };

  const openOrder = async (row: OrderRow) => {
    try {
      const full = await apiFetch<OrderRow | null>(`/api/orders?id=${row.id}`);
      if (!full) {
        toast("Order not found — list may be stale", "error");
        load();
        return;
      }
      setDetail(full);
      setNewStatus(full.status);
      setCancelReason("");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not open order", "error");
    }
  };

  const updateStatus = async () => {
    if (!detail) return;
    if (newStatus === "cancelled" && orderConfig.requireCancelReason && !cancelReason.trim()) {
      toast("Cancellation reason is required", "error");
      return;
    }
    try {
      await apiFetch("/api/orders", { method: "PATCH", body: JSON.stringify({ id: detail.id, status: newStatus, cancelReason }) });
      toast("Order updated"); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const saveOrderConfig = async (key: string, value: OrderConfig | KdsConfig | ReceiptConfig, message: string) => {
    try {
      await apiFetch("/api/admin-config", {
        method: "PATCH",
        body: JSON.stringify({ scope: "orders", key, value }),
      });
      toast(message);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save settings", "error");
    }
  };

  const columns: Column<OrderRow>[] = [
    { key: "number", header: "Order #" },
    { key: "source", header: "Source", render: (r) => <SourceBadge source={r.source} /> },
    { key: "tableLabel", header: "Table", render: (r) => r.tableLabel ?? "—" },
    { key: "status", header: "Status", render: (r) => <StatusDot status={r.status} /> },
    { key: "total", header: "Total", align: "right", render: (r) => formatCurrency(r.total) },
    { key: "createdAt", header: "Time", render: (r) => format(new Date(r.createdAt), "HH:mm") },
  ];

  const statusCounts = orders.reduce(
    (acc, o) => {
      if (["pending", "confirmed"].includes(o.status)) acc.pending += 1;
      if (o.status === "preparing") acc.preparing += 1;
      if (o.status === "ready") acc.ready += 1;
      return acc;
    },
    { pending: 0, preparing: 0, ready: 0 }
  );

  return (
    <div>
      <PageHeader
        title="Orders"
        subtitle={liveMode && lastUpdated ? `Live · updated ${format(lastUpdated, "HH:mm:ss")}` : "Order management"}
        actions={
          <button
            type="button"
            onClick={() => setLiveMode((v) => !v)}
            className={cn(
              "inline-flex items-center gap-2 h-10 px-4 rounded-xl border-2 font-bold text-sm focus-ring",
              liveMode ? "border-primary bg-primary/20 text-black" : "border-border bg-white text-muted"
            )}
          >
            <Radio size={16} className={liveMode ? "text-green-600" : ""} />
            {liveMode ? "Live on" : "Live off"}
          </button>
        }
      />
      <TabBar tabs={[{ id: "list", label: "Live Orders" }, { id: "config", label: "Order Controls" }, { id: "kds", label: "KDS Settings" }, { id: "receipt", label: "Receipt Config" }]} active={tab} onChange={setTab} />

      {tab === "list" && (
        <>
          <StatCards
            stats={[
              { label: "Pending", value: statusCounts.pending, tone: statusCounts.pending > 0 ? "warning" : "default" },
              { label: "Preparing", value: statusCounts.preparing, tone: statusCounts.preparing > 0 ? "active" : "default" },
              { label: "Ready", value: statusCounts.ready, tone: statusCounts.ready > 0 ? "success" : "default" },
              { label: "In view", value: orders.length, hint: "filtered" },
            ]}
          />

          <FilterBar
            search={search}
            onSearchChange={setSearch}
            placeholder="Search order # or table…"
          />

          <SavedViewsBar
            module="orders"
            currentFilters={currentFilters}
            onApply={(filters) => {
              setSearch(String(filters.search ?? ""));
              setStatusFilter(String(filters.statusFilter ?? ""));
              setSourceFilter(String(filters.sourceFilter ?? ""));
              setPeriodFilter(String(filters.periodFilter ?? DEFAULT_PERIOD));
              setTableFilter(String(filters.tableFilter ?? ""));
            }}
          />

          <div className="flex items-center gap-2 mb-5 p-2.5 bg-white border-2 border-border rounded-xl">
            <div className="flex items-center gap-2 flex-1 min-w-0 overflow-x-auto scrollbar-thin flex-nowrap">
              <LabeledFilterSelect
                id="order-status-filter"
                label="Status"
                value={statusFilter}
                onChange={setStatusFilter}
                options={STATUS_OPTIONS}
              />
              <LabeledFilterSelect
                id="order-source-filter"
                label="Source"
                value={sourceFilter}
                onChange={setSourceFilter}
                options={SOURCE_OPTIONS}
              />
              <LabeledFilterSelect
                id="order-period-filter"
                label="Time"
                value={periodFilter}
                onChange={setPeriodFilter}
                options={PERIOD_OPTIONS}
              />
              <LabeledFilterSelect
                id="order-table-filter"
                label="Table"
                value={tableFilter}
                onChange={setTableFilter}
                options={TABLE_OPTIONS}
              />
            </div>

            <div className="flex items-center gap-2 shrink-0 pl-2 border-l-2 border-border">
              <span className="inline-flex items-center h-10 px-3 rounded-xl bg-cream border-2 border-border text-sm font-bold text-black tabular-nums whitespace-nowrap">
                {orders.length} order{orders.length !== 1 ? "s" : ""}
              </span>

              {hasActiveFilters && (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="inline-flex items-center gap-1.5 h-10 px-3 rounded-xl border-2 border-border bg-white text-sm font-bold text-muted hover:bg-cream hover:text-black focus-ring whitespace-nowrap"
                >
                  <X size={16} /> Clear
                </button>
              )}
            </div>
          </div>

          <div className={cn("transition-opacity duration-200", loading && "opacity-60 pointer-events-none")}>
            <DenseGrid
              columns={columns}
              data={orders}
              selectable={false}
              onRowClick={openOrder}
              emptyMessage={loading ? "Loading orders…" : "No orders match your filters"}
              emptyDescription={loading ? undefined : "Try clearing filters or changing the date range"}
            />
          </div>
        </>
      )}

      {tab === "config" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-4">
          {([
            ["dineIn", "Dine-In"],
            ["takeaway", "Takeaway"],
            ["counter", "Counter"],
            ["qr", "QR Ordering"],
            ["requireCancelReason", "Require cancel reason"],
          ] as const).map(([key, label]) => (
            <label key={key} className="flex justify-between font-bold text-black"><span>{label}</span><input type="checkbox" checked={orderConfig[key]} onChange={(e) => setOrderConfig({ ...orderConfig, [key]: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          ))}
          <BtnPrimary onClick={() => saveOrderConfig("orderControls", orderConfig, "Order controls saved")}><Save size={18} /> Save Settings</BtnPrimary>
        </div>
      )}

      {tab === "kds" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-4">
          <label className="flex justify-between font-bold"><span>KDS Enabled</span><input type="checkbox" checked={kdsConfig.enabled} onChange={(e) => setKdsConfig({ ...kdsConfig, enabled: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          <label className="flex justify-between font-bold"><span>Blue → Orange (min)</span><input type="number" className="w-20 border-2 rounded-lg px-2 py-1" value={kdsConfig.blueOrange} onChange={(e) => setKdsConfig({ ...kdsConfig, blueOrange: Number(e.target.value) })} /></label>
          <label className="flex justify-between font-bold"><span>Orange → Red (min)</span><input type="number" className="w-20 border-2 rounded-lg px-2 py-1" value={kdsConfig.orangeRed} onChange={(e) => setKdsConfig({ ...kdsConfig, orangeRed: Number(e.target.value) })} /></label>
          <label className="flex justify-between font-bold"><span>Audio on red</span><input type="checkbox" checked={kdsConfig.audioOnRed} onChange={(e) => setKdsConfig({ ...kdsConfig, audioOnRed: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          <BtnPrimary onClick={() => saveOrderConfig("kds", kdsConfig, "KDS settings saved")}><Save size={18} /> Save</BtnPrimary>
        </div>
      )}

      {tab === "receipt" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-4">
          <FormField label="Footer Text"><textarea className={`${inputClass} min-h-24`} value={receiptConfig.footerText} onChange={(e) => setReceiptConfig({ ...receiptConfig, footerText: e.target.value })} /></FormField>
          <label className="flex justify-between font-bold"><span>Auto-print receipts</span><input type="checkbox" checked={receiptConfig.autoPrint} onChange={(e) => setReceiptConfig({ ...receiptConfig, autoPrint: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          <label className="flex justify-between font-bold"><span>Show GSTIN/FSSAI</span><input type="checkbox" checked={receiptConfig.showGstin} onChange={(e) => setReceiptConfig({ ...receiptConfig, showGstin: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          <BtnPrimary onClick={() => saveOrderConfig("receipt", receiptConfig, "Receipt config saved")}><Save size={18} /> Save</BtnPrimary>
        </div>
      )}

      <Drawer open={!!detail} onClose={() => setDetail(null)} title={detail?.number ?? ""}>
        {detail && (
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-muted font-bold">Source</dt><dd><SourceBadge source={detail.source} /></dd></div>
              <div><dt className="text-muted font-bold">Total</dt><dd className="font-bold">{formatCurrency(detail.total)}</dd></div>
              <div><dt className="text-muted font-bold">Table</dt><dd className="font-bold">{detail.tableLabel ?? "—"}</dd></div>
              <div><dt className="text-muted font-bold">Time</dt><dd className="font-bold">{format(new Date(detail.createdAt), "dd MMM HH:mm")}</dd></div>
            </dl>
            <h3 className="font-bold">Items</h3>
            <ul className="space-y-2">{detail.items?.map((i) => (
              <li key={i.id} className="flex justify-between p-2 bg-cream rounded-lg font-medium">
                <span>{i.quantity}× {i.name}</span><span>{formatCurrency(i.price * i.quantity)}</span>
              </li>
            ))}</ul>
            <FormField label="Update Status"><select className={selectClass} value={newStatus} onChange={(e) => setNewStatus(e.target.value)}>
              {["pending", "confirmed", "preparing", "ready", "served", "cancelled"].map((s) => <option key={s} value={s}>{s}</option>)}
            </select></FormField>
            {newStatus === "cancelled" && (
              <FormField label="Cancellation Reason" required={orderConfig.requireCancelReason}>
                <textarea className={`${inputClass} min-h-24`} value={cancelReason} onChange={(e) => setCancelReason(e.target.value)} />
              </FormField>
            )}
            <BtnPrimary onClick={updateStatus}><Save size={18} /> Update Order</BtnPrimary>
          </div>
        )}
      </Drawer>
    </div>
  );
}
