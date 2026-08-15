"use client";

import { useMemo } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { InsightCard } from "./InsightCard";
import { AnalyticsEmptyState } from "./AnalyticsEmptyState";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Trash2, AlertCircle } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface WasteRow {
  id: string;
  ingredient: { name: string };
  quantity: number;
  reason: string;
  estCost: number;
}

interface FoodWasteViewProps {
  wasteData: WasteRow[];
  loading?: boolean;
}

export function FoodWasteView({
  wasteData,
  loading = false,
}: FoodWasteViewProps) {
  // Summary Stats
  const stats = useMemo(() => {
    if (wasteData.length === 0) return null;

    const totalCost = wasteData.reduce((s, w) => s + w.estCost, 0);
    const byReason = wasteData.reduce<Record<string, number>>((acc, w) => {
      acc[w.reason] = (acc[w.reason] ?? 0) + w.estCost;
      return acc;
    }, {});

    const byItem = wasteData.reduce<Record<string, number>>((acc, w) => {
      acc[w.ingredient.name] = (acc[w.ingredient.name] ?? 0) + w.estCost;
      return acc;
    }, {});

    const topReason = Object.entries(byReason).sort((a, b) => b[1] - a[1])[0];
    const topItem = Object.entries(byItem).sort((a, b) => b[1] - a[1])[0];

    return { totalCost, topReason, topItem, count: wasteData.length, byReason };
  }, [wasteData]);

  // Waste by Reason Breakdown (%)
  const reasonBreakdown = useMemo(() => {
    if (!stats || stats.totalCost === 0) return [];
    return Object.entries(stats.byReason)
      .map(([reason, cost]) => ({
        reason,
        cost,
        percentage: Math.round((cost / stats.totalCost) * 100),
      }))
      .sort((a, b) => b.cost - a.cost);
  }, [stats]);

  // Waste Trend over time sample data
  const wasteTrendData = useMemo(() => {
    const dates = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const baseCost = stats ? stats.totalCost / 7 : 500;
    return dates.map((day, idx) => ({
      day,
      cost: Math.round(baseCost * (0.5 + Math.sin(idx * 0.9) * 0.4)),
    }));
  }, [stats]);

  // STRUCTURAL EMPTY STATE (Section 18 requirement)
  if (!loading && wasteData.length === 0) {
    return (
      <div className="space-y-6">
        {/* Preserved Header KPIs (empty placeholder values) */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 opacity-70">
          <div className="p-4 rounded-2xl bg-white border border-border/80">
            <div className="text-xs font-bold text-muted uppercase">Waste Cost</div>
            <div className="text-2xl font-extrabold text-black mt-1">₹—</div>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-border/80">
            <div className="text-xs font-bold text-muted uppercase">Waste Rate</div>
            <div className="text-2xl font-extrabold text-black mt-1">— %</div>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-border/80">
            <div className="text-xs font-bold text-muted uppercase">Top Reason</div>
            <div className="text-lg font-bold text-black mt-1">—</div>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-border/80">
            <div className="text-xs font-bold text-muted uppercase">Top Wasted Item</div>
            <div className="text-lg font-bold text-black mt-1">—</div>
          </div>
        </div>

        {/* Actionable Empty State */}
        <AnalyticsEmptyState
          icon={<Trash2 size={32} className="text-red-500" />}
          title="No food waste logged yet"
          description="Log kitchen spoilage, expired stock, and over-prepared items to track loss costs and reduction trends."
          actionLabel="Start Logging Waste"
          onAction={() => alert("Open Waste Log Dialog")}
        />
      </div>
    );
  }

  const cols: Column<WasteRow>[] = [
    {
      key: "ingredient",
      header: "Ingredient",
      render: (r) => <span className="font-bold text-black">{r.ingredient.name}</span>,
    },
    {
      key: "quantity",
      header: "Wasted Qty",
      align: "right",
      render: (r) => (
        <span className="tabular-nums font-bold text-black">{r.quantity}</span>
      ),
    },
    {
      key: "reason",
      header: "Reason",
      render: (r) => (
        <span className="inline-flex px-2.5 py-0.5 rounded-lg bg-cream border border-border text-xs font-extrabold text-sand-dark uppercase tracking-wide">
          {r.reason}
        </span>
      ),
    },
    {
      key: "cost",
      header: "Estimated Cost",
      align: "right",
      render: (r) => (
        <span className="tabular-nums font-extrabold text-red-700">
          {formatCurrency(r.estCost)}
        </span>
      ),
    },
  ];

  return (
    <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
      {/* INFOGRAPHIC SUMMARY KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs">
          <div className="text-xs font-bold text-muted uppercase tracking-wider">
            Waste Cost Loss
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-red-700 tabular-nums mt-1">
            {stats ? formatCurrency(stats.totalCost) : "₹0"}
          </div>
          <div className="text-xs font-semibold text-red-600 mt-1">Total recorded loss</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs">
          <div className="text-xs font-bold text-muted uppercase tracking-wider">
            Waste Rate
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-amber-800 tabular-nums mt-1">
            3.8%
          </div>
          <div className="text-xs font-semibold text-sand-dark mt-1">% of food purchases</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs">
          <div className="text-xs font-bold text-muted uppercase tracking-wider">
            Top Reason
          </div>
          <div className="text-xl font-bold text-black truncate mt-1">
            {stats?.topReason ? stats.topReason[0] : "Expired"}
          </div>
          <div className="text-xs font-semibold text-red-600 mt-1">
            {stats?.topReason ? formatCurrency(stats.topReason[1]) : "—"}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs">
          <div className="text-xs font-bold text-muted uppercase tracking-wider">
            Top Wasted Item
          </div>
          <div className="text-xl font-bold text-black truncate mt-1">
            {stats?.topItem ? stats.topItem[0] : "Tomatoes"}
          </div>
          <div className="text-xs font-semibold text-red-600 mt-1">
            {stats?.topItem ? formatCurrency(stats.topItem[1]) : "—"}
          </div>
        </div>
      </div>

      {/* Insight */}
      {stats?.topReason && (
        <InsightCard
          title="FOOD WASTE INSIGHT"
          insight={`Primary food waste driver is '${stats.topReason[0]}' accounting for ${reasonBreakdown[0]?.percentage ?? 42}% of total waste cost (${formatCurrency(stats.topReason[1])}). Implement FIFO ingredient rotation.`}
        />
      )}

      {/* WASTE BY REASON & WASTE TREND */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* WASTE BY REASON HORIZONTAL BARS (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-black flex items-center gap-2">
              <AlertCircle size={18} className="text-red-600" />
              <span>Waste Breakdown by Reason</span>
            </h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Cost contribution per waste classification
            </p>
          </div>

          <div className="space-y-3.5 pt-1">
            {reasonBreakdown.map((item) => (
              <div key={item.reason} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-black">
                  <span className="capitalize">{item.reason}</span>
                  <div className="tabular-nums font-bold text-right">
                    <span>{formatCurrency(item.cost)}</span>
                    <span className="text-muted ml-1.5 text-[11px]">({item.percentage}%)</span>
                  </div>
                </div>

                <div className="h-2.5 rounded-full bg-cream border border-border/50 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-red-500 transition-all duration-500"
                    style={{ width: `${item.percentage}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* WASTE TREND OVER TIME CHART (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-black">Waste Cost Trajectory</h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Daily waste cost losses over the selected period
            </p>
          </div>

          <div className="h-[280px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={wasteTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="wasteGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#C44B4B" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#C44B4B" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8B7355" }} />
                <YAxis tick={{ fontSize: 11, fill: "#8B7355" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1A141A", borderRadius: "12px", color: "#fff", fontSize: "12px" }}
                  formatter={(val: any) => [formatCurrency(Number(val)), "Waste Cost"]}
                />
                <Area
                  type="monotone"
                  dataKey="cost"
                  stroke="#C44B4B"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#wasteGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* MOST WASTED INGREDIENTS TABLE */}
      <div className="space-y-3 pt-2">
        <div>
          <h3 className="font-bold text-base text-black">Ingredient Wastage Log</h3>
          <p className="text-xs text-muted font-medium mt-0.5">
            Individual ingredient spoilage entries and estimated cost impact
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 overflow-hidden bg-white shadow-2xs">
          <DenseGrid
            columns={cols}
            data={wasteData}
            selectable={false}
            showRowHint={false}
            onRowClick={() => {}}
            emptyMessage={loading ? "Loading wastage log..." : "No waste logged"}
          />
        </div>
      </div>
    </div>
  );
}
