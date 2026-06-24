"use client";

import { useEffect, useMemo, useState } from "react";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import {
  FilterBar, PageHeader, TabBar, BtnSecondary, StatCards, ChipFilter,
} from "@/components/ui/shared";
import { exportCsv } from "@/components/ui/forms";
import { formatCurrency, cn } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { useDebouncedValue } from "@/lib/use-debounce";
import { useApp } from "@/lib/context";
import {
  Download, TrendingUp, BarChart3, CreditCard, Trash2, Flame, Package, Star, Printer,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  PieChart, Pie, Cell,
} from "recharts";
import { ChartContainer } from "@/components/ui/chart-container";

interface MenuItem {
  id: string;
  name: string;
  basePrice: number;
  recipeCost: number;
  grossMargin: number;
  unitsSold: number;
}

interface WasteRow {
  id: string;
  ingredient: { name: string };
  quantity: number;
  reason: string;
  estCost: number;
}

const COLORS = ["#F4B315", "#D3AF85", "#1A141A", "#8B7355", "#5A8F4A", "#C44B4B"];
const SOURCE_LABELS: Record<string, string> = {
  dine_in: "Dine-In",
  takeaway: "Takeaway",
  swiggy: "Swiggy",
  zomato: "Zomato",
  qr: "QR Order",
  counter: "Counter",
};

const TABS = [
  { id: "margin", label: "Profit Margin" },
  { id: "top-selling", label: "Top Selling" },
  { id: "customer-behavior", label: "Customer Behavior" },
  { id: "heatmap", label: "Peak-Hour Heatmap" },
  { id: "payments", label: "Payment Mix" },
  { id: "inventory-trend", label: "Inventory Trend" },
  { id: "waste", label: "Food Waste" },
  { id: "reviews", label: "Reviews & Ratings" },
];

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const RANGE_PRESETS = [
  { id: "today", label: "Today" }, { id: "week", label: "Week" }, { id: "month", label: "Month" }, { id: "quarter", label: "Quarter" },
];

interface Behavior { unique: number; repeatRate: number; avgSpendPerVisit: number; distribution: { new: number; returning: number; lapsed: number }; topCustomers: { id: string; name: string; totalSpend: number; visitCount: number }[]; }
interface HeatCell { count: number; revenue: number; }
interface TrendRow { id: string; name: string; unit: string; dailyUsage: number; currentStock: number; daysToDepletion: number | null; reorder: boolean; }
interface ReviewsData { avg: number; total: number; distribution: { star: number; count: number }[]; recent: { id: string; author: string; rating: number; text: string | null; reviewedAt: string }[]; }
interface Comparison { current: { revenue: number; orders: number }; previous: { revenue: number; orders: number }; }

function marginTone(m: number): "success" | "warning" | "danger" {
  if (m >= 60) return "success";
  if (m >= 40) return "warning";
  return "danger";
}

function MarginBar({ value, max = 100 }: { value: number; max?: number }) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));
  const tone = marginTone(value);
  const barColor = tone === "success" ? "#5A8F4A" : tone === "warning" ? "#F4B315" : "#C44B4B";
  return (
    <div className="flex items-center gap-3 min-w-[140px]">
      <div className="flex-1 h-2.5 rounded-full bg-cream border border-border overflow-hidden">
        <div className="h-full rounded-full transition-all duration-300" style={{ width: `${pct}%`, backgroundColor: barColor }} />
      </div>
      <span className={cn(
        "text-sm font-bold tabular-nums shrink-0 w-12 text-right",
        tone === "success" && "text-green-700",
        tone === "warning" && "text-amber-800",
        tone === "danger" && "text-red-700",
      )}>
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

function RankBadge({ rank }: { rank: number }) {
  if (rank === 1) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-primary text-black text-xs font-bold">1</span>;
  if (rank === 2) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-sand/60 text-black text-xs font-bold">2</span>;
  if (rank === 3) return <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-cream border-2 border-border text-black text-xs font-bold">3</span>;
  return <span className="inline-flex items-center justify-center w-7 h-7 text-sm font-bold text-muted tabular-nums">{rank}</span>;
}

function SectionPanel({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="page-surface overflow-hidden">
      <div className="px-5 py-4 border-b-2 border-border bg-cream/50 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="font-bold text-lg text-black">{title}</h2>
          {description && <p className="text-sm text-muted font-medium mt-0.5">{description}</p>}
        </div>
      </div>
      <div className="p-1">{children}</div>
    </section>
  );
}

export default function AnalyticsPage() {
  const { toast } = useToast();
  const [tab, setTab] = useState("margin");
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [marginSort, setMarginSort] = useState<"margin" | "sold" | "price">("margin");
  const debouncedSearch = useDebouncedValue(search, 250);

  const { locationId } = useApp();
  const [rangePreset, setRangePreset] = useState("month");
  const [compare, setCompare] = useState("none");
  const [marginData, setMarginData] = useState<MenuItem[]>([]);
  const [topSelling, setTopSelling] = useState<MenuItem[]>([]);
  const [paymentData, setPaymentData] = useState<{ source: string; _count: number; _sum: { total: number | null } }[]>([]);
  const [comparison, setComparison] = useState<Comparison | null>(null);
  const [wasteData, setWasteData] = useState<WasteRow[]>([]);
  const [behavior, setBehavior] = useState<Behavior | null>(null);
  const [heatmap, setHeatmap] = useState<HeatCell[][]>([]);
  const [trend, setTrend] = useState<TrendRow[]>([]);
  const [reviews, setReviews] = useState<ReviewsData | null>(null);

  const dateRange = useMemo(() => {
    const end = new Date(); const start = new Date();
    if (rangePreset === "today") start.setHours(0, 0, 0, 0);
    else if (rangePreset === "week") start.setDate(start.getDate() - 7);
    else if (rangePreset === "month") start.setMonth(start.getMonth() - 1);
    else if (rangePreset === "quarter") start.setMonth(start.getMonth() - 3);
    return { from: start.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
  }, [rangePreset]);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      const params = new URLSearchParams({ tab, from: dateRange.from, to: dateRange.to, compare });
      if (locationId) params.set("locationId", locationId);
      const data = await apiFetch<Record<string, unknown>>(`/api/analytics?${params}`);
      if (tab === "margin") setMarginData((data.items as MenuItem[]) ?? []);
      if (tab === "top-selling") setTopSelling((data.items as MenuItem[]) ?? []);
      if (tab === "payments") { setPaymentData((data.paymentBreakdown as typeof paymentData) ?? []); setComparison((data.comparison as Comparison) ?? null); }
      if (tab === "customer-behavior") setBehavior((data.behavior as Behavior) ?? null);
      if (tab === "heatmap") setHeatmap((data.heatmap as HeatCell[][]) ?? []);
      if (tab === "inventory-trend") setTrend((data.trend as TrendRow[]) ?? []);
      if (tab === "reviews") setReviews((data.reviews as ReviewsData) ?? null);
      if (tab === "waste") {
        const rows = (data.wastage as Omit<WasteRow, "id">[]) ?? [];
        setWasteData(rows.map((w, i) => ({ ...w, id: String(i) })));
      }
    };
    load()
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [tab, toast, dateRange, compare, locationId]);

  useEffect(() => { setSearch(""); }, [tab]);

  const filteredMargin = useMemo(() => {
    let rows = [...marginData];
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase();
      rows = rows.filter((r) => r.name.toLowerCase().includes(q));
    }
    if (marginSort === "margin") rows.sort((a, b) => b.grossMargin - a.grossMargin);
    if (marginSort === "sold") rows.sort((a, b) => b.unitsSold - a.unitsSold);
    if (marginSort === "price") rows.sort((a, b) => b.basePrice - a.basePrice);
    return rows;
  }, [marginData, debouncedSearch, marginSort]);

  const marginStats = useMemo(() => {
    if (marginData.length === 0) return null;
    const avg = marginData.reduce((s, i) => s + i.grossMargin, 0) / marginData.length;
    const best = [...marginData].sort((a, b) => b.grossMargin - a.grossMargin)[0];
    const worst = [...marginData].sort((a, b) => a.grossMargin - b.grossMargin)[0];
    const sold = marginData.reduce((s, i) => s + i.unitsSold, 0);
    return { avg, best, worst, sold };
  }, [marginData]);

  const topStats = useMemo(() => {
    if (topSelling.length === 0) return null;
    const top = topSelling[0];
    const total = topSelling.reduce((s, i) => s + i.unitsSold, 0);
    return { top, total, count: topSelling.length };
  }, [topSelling]);

  const paymentStats = useMemo(() => {
    if (paymentData.length === 0) return null;
    const totalRev = paymentData.reduce((s, p) => s + (p._sum.total ?? 0), 0);
    const totalOrders = paymentData.reduce((s, p) => s + p._count, 0);
    const top = [...paymentData].sort((a, b) => (b._sum.total ?? 0) - (a._sum.total ?? 0))[0];
    return { totalRev, totalOrders, top };
  }, [paymentData]);

  const wasteStats = useMemo(() => {
    if (wasteData.length === 0) return null;
    const totalCost = wasteData.reduce((s, w) => s + w.estCost, 0);
    const byReason = wasteData.reduce<Record<string, number>>((acc, w) => {
      acc[w.reason] = (acc[w.reason] ?? 0) + w.estCost;
      return acc;
    }, {});
    const topReason = Object.entries(byReason).sort((a, b) => b[1] - a[1])[0];
    return { totalCost, topReason, count: wasteData.length, byReason };
  }, [wasteData]);

  const pieData = paymentData.map((p) => ({
    name: SOURCE_LABELS[p.source] ?? p.source,
    source: p.source,
    value: p._sum.total ?? 0,
    count: p._count,
  }));

  const marginChartData = filteredMargin.slice(0, 8).map((i) => ({
    name: i.name.length > 14 ? `${i.name.slice(0, 12)}…` : i.name,
    margin: Math.round(i.grossMargin * 10) / 10,
    sold: i.unitsSold,
  }));

  const exportReport = () => {
    const sets: Record<string, { name: string; headers: string[]; rows: (string | number)[][] }> = {
      margin: { name: "margin-report.csv", headers: ["Item", "Price", "Cost", "Margin %", "Sold"], rows: marginData.map((i) => [i.name, i.basePrice, i.recipeCost, i.grossMargin.toFixed(1), i.unitsSold]) },
      "top-selling": { name: "top-selling.csv", headers: ["Item", "Sold", "Price", "Margin %"], rows: topSelling.map((i) => [i.name, i.unitsSold, i.basePrice, i.grossMargin.toFixed(1)]) },
      payments: { name: "payment-mix.csv", headers: ["Source", "Orders", "Revenue"], rows: pieData.map((p) => [p.name, p.count, p.value]) },
      waste: { name: "waste-report.csv", headers: ["Ingredient", "Qty", "Reason", "Est. Cost"], rows: wasteData.map((w) => [w.ingredient.name, w.quantity, w.reason, w.estCost]) },
      "customer-behavior": { name: "customer-behavior.csv", headers: ["Customer", "Spend", "Visits"], rows: (behavior?.topCustomers ?? []).map((c) => [c.name, c.totalSpend, c.visitCount]) },
      "inventory-trend": { name: "inventory-trend.csv", headers: ["Ingredient", "Usage/day", "Stock", "Days left", "Reorder"], rows: trend.map((t) => [t.name, t.dailyUsage, t.currentStock, t.daysToDepletion ?? "—", t.reorder ? "Yes" : "No"]) },
      reviews: { name: "reviews.csv", headers: ["Author", "Rating", "Review", "Date"], rows: (reviews?.recent ?? []).map((r) => [r.author, r.rating, r.text ?? "", r.reviewedAt.slice(0, 10)]) },
      heatmap: { name: "heatmap.csv", headers: ["Day", ...Array.from({ length: 24 }, (_, h) => `${h}:00`)], rows: heatmap.map((row, d) => [DAYS[d], ...row.map((c) => c.count)]) },
    };
    const set = sets[tab];
    if (!set) return;
    // Large exports (≥1000 rows) run async with a notification, per spec (F-64).
    if (set.rows.length >= 1000) { toast("Large export queued — you'll be notified when the file is ready (link valid 24h)"); return; }
    exportCsv(set.name, set.headers, set.rows);
    toast("Report exported (Excel-compatible CSV)");
  };

  const marginCols: Column<MenuItem>[] = [
    {
      key: "rank",
      header: "#",
      width: "52px",
      render: (_, idx) => <RankBadge rank={idx + 1} />,
    },
    { key: "name", header: "Item", render: (r) => <span className="font-bold">{r.name}</span> },
    { key: "basePrice", header: "Price", align: "right", render: (r) => formatCurrency(r.basePrice) },
    {
      key: "grossMargin",
      header: "Margin",
      width: "200px",
      render: (r) => <MarginBar value={r.grossMargin} />,
    },
    {
      key: "profit",
      header: "Profit / unit",
      align: "right",
      render: (r) => (
        <span className="tabular-nums font-bold text-green-800">
          {formatCurrency(r.basePrice - r.recipeCost)}
        </span>
      ),
    },
    { key: "unitsSold", header: "Sold", align: "right", render: (r) => <span className="tabular-nums font-bold">{r.unitsSold}</span> },
  ];

  const topCols: Column<MenuItem>[] = [
    { key: "rank", header: "#", width: "52px", render: (_, idx) => <RankBadge rank={idx + 1} /> },
    { key: "name", header: "Item", render: (r) => <span className="font-bold">{r.name}</span> },
    { key: "unitsSold", header: "Units Sold", align: "right", render: (r) => <span className="tabular-nums font-bold text-black">{r.unitsSold}</span> },
    { key: "basePrice", header: "Price", align: "right", render: (r) => formatCurrency(r.basePrice) },
    { key: "revenue", header: "Est. Revenue", align: "right", render: (r) => <span className="tabular-nums font-bold">{formatCurrency(r.basePrice * r.unitsSold)}</span> },
  ];

  return (
    <div>
      <PageHeader
        title="Analytics & Reports"
        subtitle="Margin, bestsellers, customer behavior, peak hours, payments, inventory, waste, and reviews"
        actions={
          <div className="flex items-center gap-2">
            <BtnSecondary onClick={() => window.print()}><Printer size={18} /> PDF</BtnSecondary>
            <BtnSecondary onClick={exportReport}><Download size={18} /> Export</BtnSecondary>
          </div>
        }
      />

      <div className="flex flex-wrap items-center gap-3 mb-5">
        <ChipFilter value={rangePreset} onChange={setRangePreset} options={RANGE_PRESETS.map((r) => ({ value: r.id, label: r.label }))} />
        <div className="inline-flex items-stretch h-10 border-2 border-border rounded-xl bg-white overflow-hidden">
          <span className="flex items-center px-2.5 text-xs font-bold text-muted uppercase border-r border-border bg-cream/50">Compare</span>
          <select value={compare} onChange={(e) => setCompare(e.target.value)} className="h-full pl-2.5 pr-8 text-sm font-bold bg-transparent outline-none focus-ring">
            <option value="none">No comparison</option>
            <option value="prev">vs Previous period</option>
            <option value="year">vs Same period last year</option>
          </select>
        </div>
        <span className="text-sm text-muted font-medium">{dateRange.from} → {dateRange.to}</span>
      </div>

      <TabBar tabs={TABS} active={tab} onChange={setTab} />

      {/* ── Profit Margin ── */}
      {tab === "margin" && (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          {marginStats && (
            <StatCards stats={[
              { label: "Avg margin", value: `${marginStats.avg.toFixed(1)}%`, tone: marginTone(marginStats.avg) === "success" ? "success" : "active", hint: "across menu" },
              { label: "Best margin", value: marginStats.best.name, tone: "success", hint: `${marginStats.best.grossMargin.toFixed(1)}% · ${formatCurrency(marginStats.best.basePrice)}` },
              { label: "Needs review", value: marginStats.worst.name, tone: "danger", hint: `${marginStats.worst.grossMargin.toFixed(1)}% margin` },
              { label: "Units sold", value: marginStats.sold.toLocaleString(), tone: "default", hint: `${marginData.length} menu items` },
            ]} />
          )}

          <div className="grid grid-cols-1 xl:grid-cols-5 gap-5">
            <div className="xl:col-span-2 bg-white border-2 border-border rounded-2xl p-5">
              <div className="flex items-center gap-2 mb-4">
                <BarChart3 size={20} className="text-muted" />
                <h2 className="font-bold text-black">Margin by item</h2>
              </div>
              <ChartContainer height={280}>
                <BarChart data={marginChartData} layout="vertical" margin={{ left: 4, right: 16 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                  <YAxis type="category" dataKey="name" width={88} tick={{ fontSize: 11, fontWeight: 600 }} />
                  <Tooltip formatter={(v) => [`${Number(v)}%`, "Margin"]} />
                  <Bar dataKey="margin" fill="#F4B315" radius={[0, 6, 6, 0]} barSize={18} />
                </BarChart>
              </ChartContainer>
            </div>

            <div className="xl:col-span-3 space-y-3">
              <FilterBar search={search} onSearchChange={setSearch} placeholder="Filter menu items…" />
              <ChipFilter
                options={[
                  { value: "margin", label: "By margin" },
                  { value: "sold", label: "By sold" },
                  { value: "price", label: "By price" },
                ]}
                value={marginSort}
                onChange={(v) => setMarginSort(v as typeof marginSort)}
              />
              <SectionPanel title="Menu profitability" description={`${filteredMargin.length} items · higher margin = healthier profit`}>
                <DenseGrid
                  columns={marginCols}
                  data={filteredMargin}
                  selectable={false}
                  showRowHint={false}
                  onRowClick={() => {}}
                  emptyMessage={loading ? "Loading…" : "No items match your search"}
                />
              </SectionPanel>
            </div>
          </div>
        </div>
      )}

      {/* ── Top Selling ── */}
      {tab === "top-selling" && (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          {topStats && (
            <StatCards stats={[
              { label: "#1 Bestseller", value: topStats.top.name, tone: "active", hint: `${topStats.top.unitsSold} units sold` },
              { label: "Total units", value: topStats.total.toLocaleString(), tone: "default" },
              { label: "Est. revenue", value: formatCurrency(topSelling.reduce((s, i) => s + i.basePrice * i.unitsSold, 0)), tone: "success" },
              { label: "Items tracked", value: topStats.count, hint: "in ranking" },
            ]} />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <div className="bg-white border-2 border-border rounded-2xl p-5">
              <h2 className="font-bold mb-4 flex items-center gap-2"><TrendingUp size={20} className="text-green-700" /> Sales volume</h2>
              <ChartContainer height={300}>
                <BarChart data={topSelling.slice(0, 8)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="name" fontSize={11} angle={-25} textAnchor="end" height={70} interval={0} />
                  <YAxis allowDecimals={false} />
                  <Tooltip />
                  <Bar dataKey="unitsSold" fill="#F4B315" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ChartContainer>
            </div>

            <SectionPanel title="Sales ranking" description="Top performers by units sold">
              <DenseGrid columns={topCols} data={topSelling} selectable={false} showRowHint={false} onRowClick={() => {}} />
            </SectionPanel>
          </div>
        </div>
      )}

      {/* ── Payment Mix ── */}
      {tab === "payments" && (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          {comparison && (
            <div className="page-surface p-4 flex flex-wrap gap-6">
              {([["Revenue", comparison.current.revenue, comparison.previous.revenue, true], ["Orders", comparison.current.orders, comparison.previous.orders, false]] as const).map(([label, cur, prev, money]) => {
                const diff = cur - prev; const pct = prev ? Math.round((diff / prev) * 100) : 0;
                return (
                  <div key={label}>
                    <div className="text-sm font-bold text-muted">{label} · vs {compare === "year" ? "last year" : "prev period"}</div>
                    <div className="text-2xl font-bold tabular-nums">{money ? formatCurrency(cur) : cur}</div>
                    <div className={cn("text-sm font-bold", diff >= 0 ? "text-green-700" : "text-red-600")}>{diff >= 0 ? "▲" : "▼"} {Math.abs(pct)}% <span className="text-muted font-medium">({money ? formatCurrency(prev) : prev} prior)</span></div>
                  </div>
                );
              })}
            </div>
          )}
          {paymentStats && (
            <StatCards stats={[
              { label: "Total revenue", value: formatCurrency(paymentStats.totalRev), tone: "active" },
              { label: "Total orders", value: paymentStats.totalOrders, tone: "default" },
              { label: "Top channel", value: SOURCE_LABELS[paymentStats.top.source] ?? paymentStats.top.source, tone: "success", hint: formatCurrency(paymentStats.top._sum.total ?? 0) },
              { label: "Channels", value: paymentData.length, hint: "order sources" },
            ]} />
          )}

          <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
            <div className="lg:col-span-2 bg-white border-2 border-border rounded-2xl p-5 flex flex-col">
              <h2 className="font-bold mb-2 flex items-center gap-2"><CreditCard size={20} /> Revenue by channel</h2>
              <ChartContainer height={280} className="flex-1">
                <PieChart>
                  <Pie
                    data={pieData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={95}
                    paddingAngle={3}
                  >
                    {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} stroke="#fff" strokeWidth={2} />)}
                  </Pie>
                  <Tooltip formatter={(v) => formatCurrency(Number(v))} />
                </PieChart>
              </ChartContainer>
              <ul className="mt-3 space-y-2">
                {pieData.map((p, i) => (
                  <li key={p.source} className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-2 font-semibold">
                      <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                      {p.name}
                    </span>
                    <span className="font-bold tabular-nums">{formatCurrency(p.value)}</span>
                  </li>
                ))}
              </ul>
            </div>

            <div className="lg:col-span-3">
              <SectionPanel title="Channel breakdown" description="Orders and revenue per source">
                <div className="grid sm:grid-cols-2 gap-3 p-4">
                  {pieData.map((p, i) => {
                    const share = paymentStats ? Math.round((p.value / paymentStats.totalRev) * 100) : 0;
                    return (
                      <div key={p.source} className="p-4 rounded-xl border-2 border-border bg-white hover:border-primary/50 transition-colors">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                          <span className="font-bold text-black">{p.name}</span>
                        </div>
                        <div className="text-2xl font-bold tabular-nums text-black">{formatCurrency(p.value)}</div>
                        <div className="flex items-center justify-between mt-2 text-sm text-muted font-medium">
                          <span>{p.count} orders</span>
                          <span className="font-bold text-black">{share}%</span>
                        </div>
                        <div className="mt-2 h-1.5 rounded-full bg-cream overflow-hidden">
                          <div className="h-full rounded-full" style={{ width: `${share}%`, backgroundColor: COLORS[i % COLORS.length] }} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </SectionPanel>
            </div>
          </div>
        </div>
      )}

      {/* ── Food Waste ── */}
      {tab === "waste" && (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          {wasteStats && (
            <StatCards stats={[
              { label: "Total waste cost", value: formatCurrency(wasteStats.totalCost), tone: "danger" },
              { label: "Top reason", value: wasteStats.topReason?.[0] ?? "—", tone: "warning", hint: wasteStats.topReason ? formatCurrency(wasteStats.topReason[1]) : undefined },
              { label: "Log entries", value: wasteStats.count, tone: "default" },
              { label: "Avg per entry", value: formatCurrency(wasteStats.count ? wasteStats.totalCost / wasteStats.count : 0), tone: "default" },
            ]} />
          )}

          {wasteStats && Object.keys(wasteStats.byReason).length > 0 && (
            <div className="flex flex-wrap gap-2">
              {Object.entries(wasteStats.byReason)
                .sort((a, b) => b[1] - a[1])
                .map(([reason, cost]) => (
                  <span key={reason} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border-2 border-border bg-white text-sm font-bold">
                    <Trash2 size={14} className="text-red-600" />
                    {reason}
                    <span className="text-muted font-medium">·</span>
                    <span className="text-red-700 tabular-nums">{formatCurrency(cost)}</span>
                  </span>
                ))}
            </div>
          )}

          <SectionPanel title="Wastage log" description="Ingredient losses by reason and estimated cost">
            <DenseGrid
              columns={[
                { key: "ingredient", header: "Ingredient", render: (r) => <span className="font-bold">{r.ingredient.name}</span> },
                { key: "qty", header: "Qty", align: "right", render: (r) => <span className="tabular-nums font-bold">{r.quantity}</span> },
                {
                  key: "reason",
                  header: "Reason",
                  render: (r) => (
                    <span className="inline-flex px-2.5 py-1 rounded-lg bg-cream border border-border text-xs font-bold uppercase tracking-wide">
                      {r.reason}
                    </span>
                  ),
                },
                {
                  key: "cost",
                  header: "Est. cost",
                  align: "right",
                  render: (r) => <span className="tabular-nums font-bold text-red-700">{formatCurrency(r.estCost)}</span>,
                },
              ]}
              data={wasteData}
              selectable={false}
              showRowHint={false}
              onRowClick={() => {}}
              emptyMessage="No wastage logged yet"
            />
          </SectionPanel>
        </div>
      )}

      {/* ── Customer Behavior ── */}
      {tab === "customer-behavior" && behavior && (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          <StatCards stats={[
            { label: "Unique customers", value: behavior.unique, tone: "active" },
            { label: "Repeat rate", value: `${behavior.repeatRate}%`, tone: "success" },
            { label: "Avg spend / visit", value: formatCurrency(behavior.avgSpendPerVisit), tone: "default" },
            { label: "New / Returning / Lapsed", value: `${behavior.distribution.new}/${behavior.distribution.returning}/${behavior.distribution.lapsed}`, tone: "warning" },
          ]} />
          <SectionPanel title="Top customers" description="By lifetime spend">
            <DenseGrid<{ id: string; name: string; totalSpend: number; visitCount: number }> columns={[
              { key: "rank", header: "#", width: "52px", render: (_, i) => <RankBadge rank={i + 1} /> },
              { key: "name", header: "Customer", render: (r) => <span className="font-bold">{r.name}</span> },
              { key: "spend", header: "Spend", align: "right", render: (r) => formatCurrency(r.totalSpend) },
              { key: "visits", header: "Visits", align: "right", render: (r) => r.visitCount },
            ]} data={behavior.topCustomers} selectable={false} showRowHint={false} onRowClick={() => {}} />
          </SectionPanel>
        </div>
      )}

      {/* ── Peak-Hour Heatmap ── */}
      {tab === "heatmap" && (
        <div className={cn("space-y-3 transition-opacity", loading && "opacity-60")}>
          <div className="flex items-center gap-2"><Flame size={20} className="text-red-500" /><h2 className="font-bold">Orders by day &amp; hour</h2></div>
          <div className="page-surface p-4 overflow-x-auto">
            <HeatGrid grid={heatmap} />
          </div>
        </div>
      )}

      {/* ── Inventory Trend ── */}
      {tab === "inventory-trend" && (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          <SectionPanel title="Depletion forecast" description="Daily usage from the last 14 days of order consumption">
            <DenseGrid columns={[
              { key: "name", header: "Ingredient", render: (r: TrendRow) => <span className="font-bold inline-flex items-center gap-2"><Package size={14} className="text-muted" />{r.name}</span> },
              { key: "usage", header: "Usage/day", align: "right", render: (r: TrendRow) => `${r.dailyUsage} ${r.unit}` },
              { key: "stock", header: "Stock", align: "right", render: (r: TrendRow) => `${r.currentStock} ${r.unit}` },
              { key: "days", header: "Days left", align: "right", render: (r: TrendRow) => r.daysToDepletion == null ? <span className="text-muted">—</span> : <span className={cn("tabular-nums font-bold", r.daysToDepletion <= 3 && "text-red-600", r.daysToDepletion > 3 && r.daysToDepletion <= 7 && "text-amber-700")}>{r.daysToDepletion}d</span> },
              { key: "reorder", header: "Reorder", render: (r: TrendRow) => r.reorder ? <span className="px-2 py-0.5 rounded-lg bg-red-100 text-red-700 text-xs font-bold">Reorder</span> : <span className="text-muted">OK</span> },
            ]} data={trend} selectable={false} showRowHint={false} onRowClick={() => {}} emptyMessage="No ingredients tracked" />
          </SectionPanel>
        </div>
      )}

      {/* ── Reviews & Ratings ── */}
      {tab === "reviews" && reviews && (
        <div className={cn("space-y-5 transition-opacity", loading && "opacity-60")}>
          <StatCards stats={[
            { label: "Avg rating", value: reviews.total ? `★ ${reviews.avg}` : "—", tone: "active" },
            { label: "Total reviews", value: reviews.total, tone: "default" },
            { label: "5-star", value: reviews.distribution.find((d) => d.star === 5)?.count ?? 0, tone: "success" },
            { label: "1-star", value: reviews.distribution.find((d) => d.star === 1)?.count ?? 0, tone: "danger" },
          ]} />
          {reviews.total === 0 ? (
            <div className="page-surface p-8 text-center text-muted font-medium">No reviews yet. Connect Google Business (Integrations) to pull reviews &amp; ratings.</div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <SectionPanel title="Rating distribution">
                <div className="p-4 space-y-2">{reviews.distribution.map((d) => (
                  <div key={d.star} className="flex items-center gap-2 text-sm"><span className="w-10 font-bold flex items-center gap-1"><Star size={12} className="text-amber-500 fill-amber-500" />{d.star}</span>
                    <div className="flex-1 h-2.5 rounded-full bg-cream overflow-hidden"><div className="h-full bg-primary" style={{ width: `${reviews.total ? (d.count / reviews.total) * 100 : 0}%` }} /></div>
                    <span className="w-8 text-right tabular-nums font-bold">{d.count}</span></div>
                ))}</div>
              </SectionPanel>
              <div className="lg:col-span-2"><SectionPanel title="Recent reviews">
                <ul className="p-4 space-y-2">{reviews.recent.map((r) => (
                  <li key={r.id} className="p-3 bg-cream rounded-lg"><div className="flex justify-between font-bold"><span>{r.author}</span><span className="text-amber-600">{"★".repeat(r.rating)}</span></div>{r.text && <p className="text-sm text-muted mt-1">{r.text}</p>}</li>
                ))}</ul>
              </SectionPanel></div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function HeatGrid({ grid }: { grid: HeatCell[][] }) {
  const max = Math.max(1, ...grid.flat().map((c) => c.count));
  const hours = Array.from({ length: 24 }, (_, h) => h);
  return (
    <table className="border-separate" style={{ borderSpacing: 2 }}>
      <thead><tr><th></th>{hours.map((h) => <th key={h} className="text-[10px] font-bold text-muted w-6">{h}</th>)}</tr></thead>
      <tbody>{grid.map((row, d) => (
        <tr key={d}>
          <td className="text-xs font-bold text-muted pr-2">{DAYS[d]}</td>
          {row.map((cell, h) => {
            const intensity = cell.count / max;
            return <td key={h} title={`${DAYS[d]} ${h}:00 — ${cell.count} orders, ${formatCurrency(cell.revenue)}`} className="w-6 h-6 rounded" style={{ backgroundColor: cell.count ? `rgba(244,179,21,${0.15 + intensity * 0.85})` : "var(--cream)" }} />;
          })}
        </tr>
      ))}</tbody>
    </table>
  );
}
