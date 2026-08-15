"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { InsightCard } from "./InsightCard";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Package, AlertTriangle, ShieldCheck, Clock } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface TrendRow {
  id: string;
  name: string;
  unit: string;
  dailyUsage: number;
  currentStock: number;
  daysToDepletion: number | null;
  reorder: boolean;
}

interface InventoryTrendViewProps {
  trend: TrendRow[];
  loading?: boolean;
}

export function InventoryTrendView({
  trend,
  loading = false,
}: InventoryTrendViewProps) {
  // Categorize stock health status
  const healthStats = useMemo(() => {
    let healthy = 0;
    let low = 0;
    let critical = 0;

    trend.forEach((item) => {
      const days = item.daysToDepletion;
      if (item.reorder || (days !== null && days <= 3)) critical++;
      else if (days !== null && days <= 7) low++;
      else healthy++;
    });

    return { healthy, low, critical, total: trend.length };
  }, [trend]);

  // Expected stockout items (sorted by lowest days left)
  const stockoutItems = useMemo(() => {
    return trend
      .filter((i) => i.daysToDepletion !== null && i.daysToDepletion <= 10)
      .sort((a, b) => (a.daysToDepletion ?? 99) - (b.daysToDepletion ?? 99))
      .slice(0, 5);
  }, [trend]);

  // Depletion projection chart sample data (next 7 days)
  const depletionData = useMemo(() => {
    const days = ["Today", "Day 2", "Day 3", "Day 4", "Day 5", "Day 6", "Day 7"];
    const topIngs = stockoutItems.slice(0, 3);
    if (topIngs.length === 0) return [];

    return days.map((dayLabel, dIdx) => {
      const row: Record<string, any> = { day: dayLabel };
      topIngs.forEach((ing) => {
        const remaining = Math.max(
          0,
          Math.round(ing.currentStock - ing.dailyUsage * dIdx)
        );
        row[ing.name] = remaining;
      });
      return row;
    });
  }, [stockoutItems]);

  const cols: Column<TrendRow>[] = [
    {
      key: "name",
      header: "Ingredient",
      render: (r) => (
        <span className="font-bold text-black flex items-center gap-2">
          <Package size={15} className="text-sand-dark" />
          {r.name}
        </span>
      ),
    },
    {
      key: "usage",
      header: "Usage / Day",
      align: "right",
      render: (r) => (
        <span className="tabular-nums font-bold text-black">
          {r.dailyUsage} {r.unit}
        </span>
      ),
    },
    {
      key: "stock",
      header: "Current Stock",
      align: "right",
      render: (r) => (
        <span className="tabular-nums font-extrabold text-black">
          {r.currentStock} {r.unit}
        </span>
      ),
    },
    {
      key: "days",
      header: "Depletion Forecast",
      align: "right",
      render: (r) => {
        if (r.daysToDepletion === null) return <span className="text-muted">—</span>;
        const tone =
          r.daysToDepletion <= 3
            ? "text-red-700 font-extrabold"
            : r.daysToDepletion <= 7
            ? "text-amber-800 font-bold"
            : "text-black font-bold";
        return <span className={cn("tabular-nums", tone)}>{r.daysToDepletion} days left</span>;
      },
    },
    {
      key: "status",
      header: "Stock Health",
      render: (r) => {
        if (r.reorder || (r.daysToDepletion !== null && r.daysToDepletion <= 3)) {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-red-100 text-red-700 text-xs font-bold border border-red-200">
              <span className="w-2 h-2 rounded-full bg-red-600" />
              Critical Reorder
            </span>
          );
        }
        if (r.daysToDepletion !== null && r.daysToDepletion <= 7) {
          return (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-800 text-xs font-bold border border-amber-200">
              <span className="w-2 h-2 rounded-full bg-amber-600" />
              Low Stock
            </span>
          );
        }
        return (
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-cream border border-border text-black text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-yellow" />
            Healthy
          </span>
        );
      },
    },
  ];

  return (
    <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
      {/* INVENTORY HEALTH KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              Healthy Stock
            </div>
            <div className="text-2xl font-extrabold text-black tabular-nums mt-1">
              {healthStats.healthy} items
            </div>
            <div className="text-xs font-medium text-muted mt-1">Sufficient supply &gt; 7 days</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-yellow/20 text-yellow-hover flex items-center justify-center font-bold">
            <ShieldCheck size={20} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              Low Stock
            </div>
            <div className="text-2xl font-extrabold text-amber-800 tabular-nums mt-1">
              {healthStats.low} items
            </div>
            <div className="text-xs font-medium text-muted mt-1">Depleting in 4–7 days</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-800 flex items-center justify-center font-bold">
            <Clock size={20} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              Critical Reorder
            </div>
            <div className="text-2xl font-extrabold text-red-700 tabular-nums mt-1">
              {healthStats.critical} items
            </div>
            <div className="text-xs font-medium text-muted mt-1">Depleting within 3 days</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-red-100 text-red-600 flex items-center justify-center font-bold">
            <AlertTriangle size={20} />
          </div>
        </div>
      </div>

      {/* Insight */}
      {stockoutItems.length > 0 && (
        <InsightCard
          title="INVENTORY FORECAST INSIGHT"
          insight={`${stockoutItems[0].name} is project to run out of stock in ${stockoutItems[0].daysToDepletion} days based on recent usage rates. Trigger a purchase order to prevent menu stockouts.`}
        />
      )}

      {/* EXPECTED STOCKOUTS & DEPLETION FORECAST */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* EXPECTED STOCKOUT PROGRESS BARS (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-black flex items-center gap-2">
              <AlertTriangle size={18} className="text-amber-700" />
              <span>Imminent Stockout Timeline</span>
            </h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Ingredients closest to depletion
            </p>
          </div>

          <div className="space-y-4 pt-1">
            {stockoutItems.map((item) => {
              const days = item.daysToDepletion ?? 0;
              const pct = Math.min(100, Math.max(10, (days / 10) * 100));
              const color = days <= 3 ? "bg-red-500" : "bg-yellow";

              return (
                <div key={item.id} className="space-y-1.5">
                  <div className="flex justify-between text-xs font-bold text-black">
                    <span>{item.name}</span>
                    <span className={cn("tabular-nums", days <= 3 ? "text-red-700" : "text-amber-800")}>
                      {days} days left ({item.currentStock} {item.unit})
                    </span>
                  </div>

                  <div className="h-2.5 rounded-full bg-cream border border-border/50 overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${color}`}
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}

            {stockoutItems.length === 0 && (
              <div className="py-8 text-center text-xs font-semibold text-sand-dark">
                ✓ All inventory items have healthy stock levels above 10 days.
              </div>
            )}
          </div>
        </div>

        {/* DEPLETION FORECAST CHART (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-black">7-Day Depletion Trajectory</h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Projected daily stock drawdown based on order consumption
            </p>
          </div>

          <div className="h-[280px] w-full pt-2">
            {depletionData.length > 0 ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={depletionData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" />
                  <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8B7355" }} />
                  <YAxis tick={{ fontSize: 11, fill: "#8B7355" }} />
                  <Tooltip
                    contentStyle={{ backgroundColor: "#1A141A", borderRadius: "12px", color: "#fff", fontSize: "12px" }}
                  />
                  {stockoutItems.slice(0, 3).map((ing, idx) => {
                    const colors = ["#C44B4B", "#F4B315", "#D3AF85"];
                    return (
                      <Area
                        key={ing.name}
                        type="monotone"
                        dataKey={ing.name}
                        stroke={colors[idx % colors.length]}
                        fill={colors[idx % colors.length]}
                        fillOpacity={0.2}
                        strokeWidth={2}
                      />
                    );
                  })}
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="py-12 text-center text-xs text-muted">No stockout forecast items</div>
            )}
          </div>
        </div>
      </div>

      {/* DETAILED INVENTORY TABLE */}
      <div className="space-y-3 pt-2">
        <div>
          <h3 className="font-bold text-base text-black">Complete Inventory Status</h3>
          <p className="text-xs text-muted font-medium mt-0.5">
            Full list of tracked ingredients, daily usage, and depletion estimates
          </p>
        </div>

        <div className="rounded-2xl border border-border/80 overflow-hidden bg-white shadow-2xs">
          <DenseGrid
            columns={cols}
            data={trend}
            selectable={false}
            showRowHint={false}
            onRowClick={() => {}}
            emptyMessage={loading ? "Loading inventory trend..." : "No inventory data found"}
          />
        </div>
      </div>
    </div>
  );
}
