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
import {
  Download, TrendingUp, BarChart3, CreditCard, Trash2,
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
  { id: "payments", label: "Payment Mix" },
  { id: "waste", label: "Food Waste" },
];

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

  const [marginData, setMarginData] = useState<MenuItem[]>([]);
  const [topSelling, setTopSelling] = useState<MenuItem[]>([]);
  const [paymentData, setPaymentData] = useState<{ source: string; _count: number; _sum: { total: number | null } }[]>([]);
  const [wasteData, setWasteData] = useState<WasteRow[]>([]);

  useEffect(() => {
    setLoading(true);
    const load = async () => {
      const data = await apiFetch<Record<string, unknown>>(`/api/analytics?tab=${tab}`);
      if (tab === "margin") setMarginData((data.items as MenuItem[]) ?? []);
      if (tab === "top-selling") setTopSelling((data.items as MenuItem[]) ?? []);
      if (tab === "payments") setPaymentData((data.paymentBreakdown as typeof paymentData) ?? []);
      if (tab === "waste") {
        const rows = (data.wastage as Omit<WasteRow, "id">[]) ?? [];
        setWasteData(rows.map((w, i) => ({ ...w, id: String(i) })));
      }
    };
    load()
      .catch((e) => toast(e.message, "error"))
      .finally(() => setLoading(false));
  }, [tab, toast]);

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
    if (tab === "margin") {
      exportCsv("margin-report.csv", ["Item", "Price", "Cost", "Margin %", "Sold"],
        marginData.map((i) => [i.name, i.basePrice, i.recipeCost, i.grossMargin.toFixed(1), i.unitsSold]));
    } else if (tab === "top-selling") {
      exportCsv("top-selling.csv", ["Item", "Sold", "Price", "Margin %"],
        topSelling.map((i) => [i.name, i.unitsSold, i.basePrice, i.grossMargin.toFixed(1)]));
    } else if (tab === "payments") {
      exportCsv("payment-mix.csv", ["Source", "Orders", "Revenue"],
        pieData.map((p) => [p.name, p.count, p.value]));
    } else {
      exportCsv("waste-report.csv", ["Ingredient", "Qty", "Reason", "Est. Cost"],
        wasteData.map((w) => [w.ingredient.name, w.quantity, w.reason, w.estCost]));
    }
    toast("Report exported");
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
        subtitle="Margin analysis, bestsellers, payment channels, and waste tracking"
        actions={
          <BtnSecondary onClick={exportReport}>
            <Download size={18} /> Export CSV
          </BtnSecondary>
        }
      />

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
    </div>
  );
}
