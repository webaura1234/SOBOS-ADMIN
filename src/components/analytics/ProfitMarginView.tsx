"use client";

import { useMemo, useState } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { InsightCard } from "./InsightCard";
import { FilterBar } from "@/components/ui/shared";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
  ReferenceLine,
} from "recharts";

export interface MenuItem {
  id: string;
  name: string;
  basePrice: number;
  recipeCost: number;
  grossMargin: number;
  unitsSold: number;
}

interface ProfitMarginViewProps {
  items: MenuItem[];
  loading?: boolean;
}

function MarginBar({ value }: { value: number }) {
  const pct = Math.min(100, Math.max(0, value));
  return (
    <div className="flex items-center gap-2.5 min-w-[140px]">
      <div className="flex-1 h-3 rounded-full bg-cream-dark/60 border border-border/80 overflow-hidden p-0.5 shadow-2xs">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: "var(--yellow, #F4B315)" }}
        />
      </div>
      <span className="text-xs font-extrabold tabular-nums w-12 text-right text-black">
        {value.toFixed(1)}%
      </span>
    </div>
  );
}

export function ProfitMarginView({ items, loading = false }: ProfitMarginViewProps) {
  const [search, setSearch] = useState("");
  const [marginSort, setMarginSort] = useState<"margin" | "sold" | "price">("margin");
  const [quadFilter, setQuadFilter] = useState<"all" | "high" | "review">("all");

  // Summary Metrics
  const stats = useMemo(() => {
    if (items.length === 0) return null;
    const avgMargin = items.reduce((s, i) => s + i.grossMargin, 0) / items.length;
    const sortedMargin = [...items].sort((a, b) => b.grossMargin - a.grossMargin);
    const best = sortedMargin[0];
    const worst = sortedMargin[sortedMargin.length - 1];
    const totalSold = items.reduce((s, i) => s + i.unitsSold, 0);
    return { avgMargin, best, worst, totalSold };
  }, [items]);

  // Filtered & Sorted items for table
  const filtered = useMemo(() => {
    let rows = [...items];
    if (search) {
      const q = search.toLowerCase();
      rows = rows.filter((i) => i.name.toLowerCase().includes(q));
    }
    if (marginSort === "margin") rows.sort((a, b) => b.grossMargin - a.grossMargin);
    if (marginSort === "sold") rows.sort((a, b) => b.unitsSold - a.unitsSold);
    if (marginSort === "price") rows.sort((a, b) => b.basePrice - a.basePrice);
    return rows;
  }, [items, search, marginSort]);

  // Horizontal distribution data (top items high to low margin)
  const distributionItems = useMemo(() => {
    return [...items].sort((a, b) => b.grossMargin - a.grossMargin).slice(0, 7);
  }, [items]);

  // Average units for quadrant splitting
  const avgUnits = useMemo(() => {
    if (items.length === 0) return 200;
    return Math.round(items.reduce((s, i) => s + i.unitsSold, 0) / items.length);
  }, [items]);

  // Matrix Scatter Data: Units Sold (X) vs Gross Margin (Y)
  const matrixData = useMemo(() => {
    if (items.length === 0) return [];
    const avgMargin = 60; // Standard 60% margin threshold or avg

    return items.map((item) => {
      let quadKey = "other";
      let quadName = "Low Performer";

      if (item.unitsSold >= avgUnits && item.grossMargin >= avgMargin) {
        quadKey = "high";
        quadName = "High Performer";
      } else if (item.unitsSold >= avgUnits && item.grossMargin < avgMargin) {
        quadKey = "review";
        quadName = "Review Pricing";
      } else if (item.unitsSold < avgUnits && item.grossMargin >= avgMargin) {
        quadKey = "opportunity";
        quadName = "High Margin (Low Vol)";
      } else {
        quadKey = "low";
        quadName = "Low Performer";
      }

      return {
        x: item.unitsSold,
        y: Math.round(item.grossMargin * 10) / 10,
        z: item.basePrice,
        name: item.name,
        quadKey,
        quadName,
        profitPerUnit: item.basePrice - item.recipeCost,
      };
    });
  }, [items, avgUnits]);

  const cols: Column<MenuItem>[] = [
    {
      key: "rank",
      header: "#",
      width: "48px",
      render: (_, idx) => (
        <span className="font-bold text-xs text-muted tabular-nums">{idx + 1}</span>
      ),
    },
    {
      key: "name",
      header: "Menu Item",
      render: (r) => (
        <div>
          <div className="font-bold text-black">{r.name}</div>
          <div className="text-[11px] text-muted font-medium">Cost: {formatCurrency(r.recipeCost)}</div>
        </div>
      ),
    },
    {
      key: "basePrice",
      header: "Selling Price",
      align: "right",
      render: (r) => <span className="font-bold text-black">{formatCurrency(r.basePrice)}</span>,
    },
    {
      key: "grossMargin",
      header: "Margin %",
      width: "180px",
      render: (r) => <MarginBar value={r.grossMargin} />,
    },
    {
      key: "profit",
      header: "Profit / Unit",
      align: "right",
      render: (r) => (
        <span className="tabular-nums font-extrabold text-black">
          {formatCurrency(r.basePrice - r.recipeCost)}
        </span>
      ),
    },
    {
      key: "unitsSold",
      header: "Units Sold",
      align: "right",
      render: (r) => <span className="tabular-nums font-bold text-black">{r.unitsSold}</span>,
    },
  ];

  return (
    <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
      {/* SECTION 1 — Profitability Summary */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
            Avg Margin
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-black tabular-nums">
            {stats ? `${stats.avgMargin.toFixed(1)}%` : "—"}
          </div>
          <div className="flex items-center gap-1 mt-1.5 text-xs font-bold text-black">
            <span>↑ 2.1%</span>
            <span className="text-muted font-normal">vs previous period</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
            Best Margin
          </div>
          <div className="text-lg font-bold text-black truncate">
            {stats?.best ? stats.best.name : "—"}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-xs font-bold text-black">
            <span className="px-2 py-0.5 rounded-md bg-yellow/30 text-black font-extrabold border border-yellow/50">
              {stats?.best ? `${stats.best.grossMargin.toFixed(1)}%` : "—"}
            </span>
            <span className="text-muted font-medium">
              {stats?.best ? formatCurrency(stats.best.basePrice) : ""}
            </span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
            Needs Review
          </div>
          <div className="text-lg font-bold text-black truncate">
            {stats?.worst ? stats.worst.name : "—"}
          </div>
          <div className="flex items-center gap-1.5 mt-1.5 text-xs font-bold text-black">
            <span className="px-2 py-0.5 rounded-md bg-cream border border-border text-black font-extrabold">
              {stats?.worst ? `${stats.worst.grossMargin.toFixed(1)}% margin` : "—"}
            </span>
            <span className="text-muted font-medium">Low margin</span>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs hover:shadow-xs transition-shadow">
          <div className="text-xs font-bold text-muted uppercase tracking-wider mb-1">
            Units Sold
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-black tabular-nums">
            {stats ? stats.totalSold.toLocaleString() : "—"}
          </div>
          <div className="flex items-center gap-1 mt-1.5 text-xs font-bold text-black">
            <span>↑ 8.2%</span>
            <span className="text-muted font-normal">menu volume</span>
          </div>
        </div>
      </div>

      {/* Insight Banner */}
      {stats?.worst && (
        <InsightCard
          title="PROFITABILITY INSIGHT"
          insight={`${stats.best.name} has the highest gross margin at ${stats.best.grossMargin.toFixed(1)}%, while ${stats.worst.name} is lower at ${stats.worst.grossMargin.toFixed(1)}%. Consider revising pricing or recipe costs for ${stats.worst.name}.`}
        />
      )}

      {/* SECTION 2 & 3 — Grid layout: Margin Distribution (Horizontal Bars) + Profitability Matrix */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* SECTION 2: Horizontal Margin Distribution (5 cols) — SOBOS Yellow Primary Accent */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-black">Margin Distribution</h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              High to low profitability menu ranking
            </p>
          </div>

          <div className="space-y-3.5 pt-1">
            {distributionItems.map((item) => (
              <div key={item.id} className="space-y-1.5">
                <div className="flex justify-between items-center text-xs font-bold text-black">
                  <span className="truncate pr-2">{item.name}</span>
                  <span className="tabular-nums font-extrabold text-black shrink-0">
                    {item.grossMargin.toFixed(1)}%
                  </span>
                </div>
                <div className="h-3 rounded-full bg-cream-dark/60 border border-border/80 overflow-hidden p-0.5 shadow-2xs">
                  <div
                    className="h-full rounded-full transition-all duration-500 shadow-2xs"
                    style={{
                      width: `${Math.min(100, Math.max(0, item.grossMargin))}%`,
                      backgroundColor: "var(--yellow, #F4B315)",
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 3: Profitability Matrix 2x2 Scatter Grid (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="font-bold text-base text-black">Profitability Matrix</h3>
              <p className="text-xs text-muted font-medium mt-0.5">
                Gross Margin % (Y) vs Sales Volume (X)
              </p>
            </div>

            {/* Interactive Quadrant Filters */}
            <div className="flex gap-2 text-[11px] font-bold shrink-0">
              <button
                type="button"
                onClick={() => setQuadFilter(quadFilter === "high" ? "all" : "high")}
                className={cn(
                  "px-3 py-1 rounded-full transition-all border cursor-pointer",
                  quadFilter === "high"
                    ? "bg-yellow text-black border-yellow-hover shadow-2xs font-extrabold"
                    : "bg-cream/60 text-muted border-border/80 hover:text-black"
                )}
              >
                High Performers
              </button>
              <button
                type="button"
                onClick={() => setQuadFilter(quadFilter === "review" ? "all" : "review")}
                className={cn(
                  "px-3 py-1 rounded-full transition-all border cursor-pointer",
                  quadFilter === "review"
                    ? "bg-amber-100 text-amber-900 border-amber-300 shadow-2xs font-extrabold"
                    : "bg-cream/60 text-muted border-border/80 hover:text-black"
                )}
              >
                Review Pricing
              </button>
            </div>
          </div>

          {/* Quadrant Visual overlay container */}
          <div className="relative w-full h-[290px] bg-cream/20 rounded-xl p-2 border border-border/40 overflow-hidden">
            {/* Quadrant Labels (Positioned cleanly) */}
            <div className="absolute top-3 left-4 text-[10px] font-extrabold text-muted/80 uppercase tracking-wider pointer-events-none select-none">
              High Margin (Low Volume)
            </div>
            <div className="absolute top-3 right-4 text-[10px] font-extrabold text-black uppercase tracking-wider pointer-events-none select-none">
              High Performers ⭐
            </div>
            <div className="absolute bottom-3 left-4 text-[10px] font-extrabold text-muted/70 uppercase tracking-wider pointer-events-none select-none">
              Low Performers
            </div>
            <div className="absolute bottom-3 right-4 text-[10px] font-extrabold text-sand-dark uppercase tracking-wider pointer-events-none select-none">
              Review Pricing ⚠️
            </div>

            <ResponsiveContainer width="100%" height="100%">
              <ScatterChart margin={{ top: 25, right: 25, bottom: 25, left: 10 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" opacity={0.6} />
                <XAxis
                  type="number"
                  dataKey="x"
                  name="Sales Volume"
                  unit=" units"
                  tick={{ fontSize: 10, fill: "#8B7355", fontWeight: 600 }}
                  tickFormatter={(val) => `${val} units`}
                />
                <YAxis
                  type="number"
                  dataKey="y"
                  name="Gross Margin"
                  unit="%"
                  domain={[0, 100]}
                  ticks={[0, 25, 50, 75, 100]}
                  tick={{ fontSize: 10, fill: "#8B7355", fontWeight: 600 }}
                  tickFormatter={(val) => `${val}%`}
                />

                {/* Subtle Quadrant Dividers */}
                <ReferenceLine x={avgUnits} stroke="#D3AF85" strokeDasharray="4 4" opacity={0.7} />
                <ReferenceLine y={60} stroke="#D3AF85" strokeDasharray="4 4" opacity={0.7} />

                <Tooltip
                  cursor={{ strokeDasharray: "3 3", stroke: "#8B7355" }}
                  content={({ payload }) => {
                    if (!payload || payload.length === 0) return null;
                    const data = payload[0].payload;
                    return (
                      <div className="bg-black text-white p-3 rounded-xl shadow-xl text-xs space-y-1 border border-border/20 z-50">
                        <div className="font-extrabold text-yellow text-sm">{data.name}</div>
                        <div className="flex justify-between gap-4 pt-1">
                          <span className="text-gray-300 font-semibold">Gross Margin:</span>
                          <span className="font-bold tabular-nums text-white">{data.y}%</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-300 font-semibold">Sales Volume:</span>
                          <span className="font-bold tabular-nums text-white">{data.x} units</span>
                        </div>
                        <div className="flex justify-between gap-4">
                          <span className="text-gray-300 font-semibold">Profit / Unit:</span>
                          <span className="font-bold tabular-nums text-yellow-hover">{formatCurrency(data.profitPerUnit)}</span>
                        </div>
                        <div className="mt-2 pt-1 border-t border-gray-800 text-[10px] font-extrabold uppercase tracking-wider text-sand">
                          Category: <span className="text-white">{data.quadName}</span>
                        </div>
                      </div>
                    );
                  }}
                />

                <Scatter data={matrixData} fill="#F4B315">
                  {matrixData.map((entry, index) => {
                    let fill = "#F4B315";
                    if (entry.quadKey === "high") fill = "#F4B315";
                    else if (entry.quadKey === "review") fill = "#E07A5F";
                    else if (entry.quadKey === "opportunity") fill = "#8B7355";
                    else fill = "#2E251C";

                    // Filter opacity logic
                    const matchesFilter =
                      quadFilter === "all" ||
                      (quadFilter === "high" && entry.quadKey === "high") ||
                      (quadFilter === "review" && entry.quadKey === "review");

                    const opacity = matchesFilter ? 1.0 : 0.2;
                    const radius = matchesFilter ? (quadFilter !== "all" ? 9 : 7) : 5;

                    return (
                      <Cell
                        key={`cell-${index}`}
                        fill={fill}
                        stroke="#1A141A"
                        strokeWidth={1.5}
                        r={radius}
                        opacity={opacity}
                        className="transition-all duration-300 hover:scale-125 cursor-pointer"
                      />
                    );
                  })}
                </Scatter>
              </ScatterChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* SECTION 4 — Detailed Profitability Table */}
      <div className="space-y-3 pt-2">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="font-bold text-base text-black">Menu Profitability Breakdown</h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Exact item prices, recipe costs, unit profits, and volume
            </p>
          </div>

          <div className="flex items-center gap-2">
            <FilterBar search={search} onSearchChange={setSearch} placeholder="Search menu item..." />
            <div className="inline-flex rounded-xl bg-white border border-border overflow-hidden p-0.5 text-xs font-bold shrink-0 shadow-2xs">
              <button
                onClick={() => setMarginSort("margin")}
                className={cn("px-2.5 py-1.5 rounded-lg transition-colors", marginSort === "margin" ? "bg-yellow text-black" : "text-muted hover:text-black")}
              >
                By Margin
              </button>
              <button
                onClick={() => setMarginSort("sold")}
                className={cn("px-2.5 py-1.5 rounded-lg transition-colors", marginSort === "sold" ? "bg-yellow text-black" : "text-muted hover:text-black")}
              >
                By Sold
              </button>
              <button
                onClick={() => setMarginSort("price")}
                className={cn("px-2.5 py-1.5 rounded-lg transition-colors", marginSort === "price" ? "bg-yellow text-black" : "text-muted hover:text-black")}
              >
                By Price
              </button>
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-border/80 overflow-hidden bg-white shadow-2xs">
          <DenseGrid
            columns={cols}
            data={filtered}
            selectable={false}
            showRowHint={false}
            onRowClick={() => {}}
            emptyMessage={loading ? "Loading menu items..." : "No menu items match your search"}
          />
        </div>
      </div>
    </div>
  );
}
