"use client";

import { useMemo } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { MenuItem } from "./ProfitMarginView";
import { InsightCard } from "./InsightCard";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Award, Flame, TrendingUp } from "lucide-react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

interface TopSellingViewProps {
  items: MenuItem[];
  loading?: boolean;
}

export function TopSellingView({ items, loading = false }: TopSellingViewProps) {
  // Sort items by units sold descending
  const sortedItems = useMemo(() => {
    return [...items].sort((a, b) => b.unitsSold - a.unitsSold);
  }, [items]);

  const bestseller = sortedItems[0];
  const totalUnits = useMemo(() => items.reduce((s, i) => s + i.unitsSold, 0), [items]);
  const totalRevenue = useMemo(
    () => items.reduce((s, i) => s + i.basePrice * i.unitsSold, 0),
    [items]
  );

  const bestsellerRev = bestseller ? bestseller.basePrice * bestseller.unitsSold : 0;
  const bestsellerShare = totalRevenue > 0 ? ((bestsellerRev / totalRevenue) * 100).toFixed(1) : "0.0";

  // Horizontal Bar Chart Data (Top 8)
  const rankingChartData = useMemo(() => {
    return sortedItems.slice(0, 8).map((item) => ({
      name: item.name,
      unitsSold: item.unitsSold,
      revenue: item.basePrice * item.unitsSold,
    }));
  }, [sortedItems]);

  // Revenue Contribution Share Data
  const revenueShareData = useMemo(() => {
    return sortedItems.slice(0, 6).map((item) => {
      const rev = item.basePrice * item.unitsSold;
      const share = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
      return {
        name: item.name,
        revenue: rev,
        share: Math.round(share * 10) / 10,
        unitsSold: item.unitsSold,
      };
    });
  }, [sortedItems, totalRevenue]);

  const cols: Column<MenuItem>[] = [
    {
      key: "rank",
      header: "#",
      width: "52px",
      render: (_, idx) => {
        if (idx === 0)
          return (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-yellow text-[var(--on-yellow)] font-extrabold text-xs shadow-2xs">
              1
            </span>
          );
        if (idx === 1)
          return (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-surface-2 border border-border text-text-secondary font-bold text-xs">
              2
            </span>
          );
        if (idx === 2)
          return (
            <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-surface-2 border border-border text-text-secondary font-bold text-xs">
              3
            </span>
          );
        return <span className="font-bold text-xs text-text-muted tabular-nums pl-2">{idx + 1}</span>;
      },
    },
    {
      key: "name",
      header: "Menu Item",
      render: (r) => (
        <div>
          <span className="font-bold text-text-primary">{r.name}</span>
          <div className="text-[11px] text-text-muted font-medium">Unit Price: {formatCurrency(r.basePrice)}</div>
        </div>
      ),
    },
    {
      key: "unitsSold",
      header: "Units Sold",
      align: "right",
      render: (r) => (
        <span className="tabular-nums font-extrabold text-text-primary">{r.unitsSold.toLocaleString()}</span>
      ),
    },
    {
      key: "basePrice",
      header: "Price",
      align: "right",
      render: (r) => <span className="text-text-primary">{formatCurrency(r.basePrice)}</span>,
    },
    {
      key: "revenue",
      header: "Est. Revenue",
      align: "right",
      render: (r) => (
        <span className="tabular-nums font-bold text-text-primary">
          {formatCurrency(r.basePrice * r.unitsSold)}
        </span>
      ),
    },
    {
      key: "contribution",
      header: "Share",
      align: "right",
      render: (r) => {
        const rev = r.basePrice * r.unitsSold;
        const share = totalRevenue > 0 ? (rev / totalRevenue) * 100 : 0;
        return (
          <span className="tabular-nums text-xs font-bold text-text-secondary">
            {share.toFixed(1)}%
          </span>
        );
      },
    },
  ];

  return (
    <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
      {/* HERO SECTION — #1 BESTSELLER SPOTLIGHT */}
      {bestseller && (
        <div className="p-6 rounded-2xl bg-gradient-to-r from-[var(--yellow-surface)] via-surface-1 to-surface-2 border border-[var(--border-yellow)] shadow-xs relative overflow-hidden">
          <div className="absolute top-4 right-4 flex items-center gap-1.5 px-3 py-1 rounded-full bg-yellow text-[var(--on-yellow)] text-xs font-extrabold shadow-2xs">
            <Award size={14} />
            <span>BESTSELLER SPOTLIGHT</span>
          </div>

          <div className="max-w-2xl space-y-3">
            <div className="text-xs font-bold uppercase tracking-wider text-text-secondary flex items-center gap-1">
              <Flame size={15} className="text-yellow" />
              <span>Top Volume Performer</span>
            </div>

            <div className="flex items-baseline justify-between gap-4">
              <h2 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
                {bestseller.name}
              </h2>
              <span className="text-xl sm:text-2xl font-extrabold text-text-primary tabular-nums shrink-0">
                {bestseller.unitsSold} units
              </span>
            </div>

            {/* Visual volume bar */}
            <div className="h-3.5 rounded-full bg-surface-2 border border-border overflow-hidden p-0.5">
              <div
                className="h-full rounded-full bg-yellow shadow-xs transition-all duration-700"
                style={{ width: "88%" }}
              />
            </div>

            <div className="flex flex-wrap items-center gap-6 pt-1 text-sm font-bold text-text-primary">
              <div>
                <span className="text-text-muted font-medium text-xs block">Revenue</span>
                <span className="text-base font-extrabold text-text-primary">{formatCurrency(bestsellerRev)}</span>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <span className="text-text-muted font-medium text-xs block">Sales Contribution</span>
                <span className="text-base font-extrabold text-text-primary">{bestsellerShare}% of total sales</span>
              </div>
              <div className="w-px h-8 bg-border" />
              <div>
                <span className="text-text-muted font-medium text-xs block">Gross Margin</span>
                <span className="text-base font-extrabold text-text-primary">{bestseller.grossMargin.toFixed(1)}%</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SUPPORTING METRICS ROW */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-surface-1 border border-border shadow-2xs">
          <div className="text-xs font-bold text-text-muted uppercase tracking-wider">Total Units</div>
          <div className="text-2xl font-extrabold text-text-primary tabular-nums mt-1">
            {totalUnits.toLocaleString()}
          </div>
          <div className="text-xs font-semibold text-text-secondary mt-1">↑ Across all items</div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-border shadow-2xs">
          <div className="text-xs font-bold text-text-muted uppercase tracking-wider">Total Revenue</div>
          <div className="text-2xl font-extrabold text-text-primary tabular-nums mt-1">
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-xs font-semibold text-text-secondary mt-1">↑ Period aggregate</div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-border shadow-2xs">
          <div className="text-xs font-bold text-text-muted uppercase tracking-wider">Items Tracked</div>
          <div className="text-2xl font-extrabold text-text-primary tabular-nums mt-1">
            {sortedItems.length}
          </div>
          <div className="text-xs font-semibold text-text-secondary mt-1">Active menu items</div>
        </div>
      </div>

      {/* Insight */}
      {bestseller && (
        <InsightCard
          title="BESTSELLER INSIGHT"
          insight={`${bestseller.name} is leading sales with ${bestseller.unitsSold} units, generating ${bestsellerShare}% of overall restaurant revenue. Ensure inventory supply for peak hours.`}
        />
      )}

      {/* MAIN VISUALIZATIONS: Horizontal Volume Ranking & Revenue Contribution */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Horizontal ranking chart (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-surface-1 border border-border shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-text-primary flex items-center gap-2">
              <TrendingUp size={18} className="text-yellow" />
              <span>Sales Volume Ranking</span>
            </h3>
            <p className="text-xs text-text-muted font-medium mt-0.5">
              Top items ordered by units sold (horizontal visual scale)
            </p>
          </div>

          <div className="h-[280px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={rankingChartData}
                layout="vertical"
                margin={{ left: 10, right: 25, top: 0, bottom: 0 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#1F1F1F" />
                <XAxis type="number" tick={{ fontSize: 11, fill: "#B8AA96" }} />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={110}
                  tick={{ fontSize: 11, fontWeight: 600, fill: "#F5F1E8" }}
                />
                <Tooltip
                  formatter={(value: any) => [`${value} units`, "Units Sold"]}
                  contentStyle={{ backgroundColor: "#101010", borderRadius: "12px", border: "1px solid #2A2A2A", color: "#F5F1E8", fontSize: "12px" }}
                />
                <Bar dataKey="unitsSold" fill="#FED500" radius={[0, 6, 6, 0]} barSize={18}>
                  {rankingChartData.map((_, index) => (
                    <Cell key={`cell-${index}`} fill={index === 0 ? "#FED500" : index < 3 ? "#B8AA96" : "#8C8070"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Secondary visualization: Revenue Contribution Share (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-surface-1 border border-border shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-text-primary">Revenue Share Breakdown</h3>
            <p className="text-xs text-text-muted font-medium mt-0.5">
              Financial revenue contribution by top dish
            </p>
          </div>

          <div className="space-y-3.5 pt-1">
            {revenueShareData.map((item, idx) => (
              <div key={item.name} className="space-y-1">
                <div className="flex justify-between text-xs font-semibold text-text-primary">
                  <span className="truncate pr-2">
                    <span className="text-text-muted mr-1.5 font-bold">#{idx + 1}</span>
                    {item.name}
                  </span>
                  <div className="tabular-nums font-bold shrink-0 text-right">
                    <span>{formatCurrency(item.revenue)}</span>
                    <span className="text-[11px] text-text-muted ml-1.5 font-normal">({item.share}%)</span>
                  </div>
                </div>
                <div className="h-2 rounded-full bg-surface-2 border border-border overflow-hidden">
                  <div
                    className="h-full rounded-full bg-yellow transition-all duration-500"
                    style={{ width: `${Math.min(100, item.share * 4)}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* DETAILED RANKING TABLE */}
      <div className="space-y-3 pt-2">
        <div>
          <h3 className="font-bold text-base text-text-primary">Sales Ranking Details</h3>
          <p className="text-xs text-text-muted font-medium mt-0.5">
            Complete ranking with selling prices and total sales contributions
          </p>
        </div>

        <div className="rounded-2xl border border-border overflow-hidden bg-surface-1 shadow-2xs">
          <DenseGrid
            columns={cols}
            data={sortedItems}
            selectable={false}
            showRowHint={false}
            onRowClick={() => {}}
            emptyMessage={loading ? "Loading bestseller data..." : "No items found"}
          />
        </div>
      </div>
    </div>
  );
}
