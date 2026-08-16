"use client";

import { useMemo } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { InsightCard } from "./InsightCard";
import { Users, UserCheck, RefreshCw, Clock } from "lucide-react";
import { ChartContainer } from "@/components/ui/chart-container";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export interface CustomerBehaviorData {
  unique: number;
  repeatRate: number;
  avgSpendPerVisit: number;
  distribution: { new: number; returning: number; lapsed: number };
  topCustomers: {
    id: string;
    name: string;
    totalSpend: number;
    visitCount: number;
  }[];
}

interface CustomerBehaviorViewProps {
  behavior: CustomerBehaviorData | null;
  loading?: boolean;
}

export function CustomerBehaviorView({
  behavior,
  loading = false,
}: CustomerBehaviorViewProps) {
  // Generate sample customer activity line chart data over time (last 7 days / weeks)
  const activityTrend = useMemo(() => {
    const dates = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    const baseVisits = behavior ? Math.max(5, Math.round(behavior.unique * 1.5)) : 10;
    return dates.map((day, idx) => ({
      day,
      visits: Math.round(baseVisits * (0.6 + Math.sin(idx) * 0.4 + idx * 0.1)),
      spend: Math.round((behavior?.avgSpendPerVisit ?? 1200) * (1 + Math.sin(idx * 0.8) * 0.3)),
    }));
  }, [behavior]);

  if (!behavior && !loading) {
    return (
      <div className="py-12 text-center text-text-muted font-medium bg-surface-1 rounded-2xl border border-dashed border-border">
        No customer behavior data recorded yet.
      </div>
    );
  }

  const dist = behavior?.distribution ?? { new: 0, returning: 0, lapsed: 0 };
  const totalLifecycle = Math.max(1, dist.new + dist.returning + dist.lapsed);
  const newPct = Math.round((dist.new / totalLifecycle) * 100);
  const returningPct = Math.round((dist.returning / totalLifecycle) * 100);
  const lapsedPct = Math.round((dist.lapsed / totalLifecycle) * 100);

  return (
    <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
      {/* CUSTOMER SUMMARY KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-surface-1 border border-border shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
            <span>Unique Customers</span>
            <Users size={16} className="text-yellow" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-text-primary tabular-nums">
            {behavior?.unique ?? 0}
          </div>
          <div className="text-xs font-semibold text-text-secondary mt-1">↑ Active profiles</div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-border shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
            <span>Repeat Rate</span>
            <RefreshCw size={16} className="text-yellow" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-text-primary tabular-nums">
            {behavior?.repeatRate ?? 0}%
          </div>
          <div className="text-xs font-semibold text-text-secondary mt-1">High retention</div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-border shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
            <span>Avg Spend / Visit</span>
            <UserCheck size={16} className="text-text-secondary" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-text-primary tabular-nums">
            {formatCurrency(behavior?.avgSpendPerVisit ?? 0)}
          </div>
          <div className="text-xs font-semibold text-text-secondary mt-1">↑ 5.4% basket size</div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-border shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-text-muted uppercase tracking-wider mb-1">
            <span>Lifecycle Split</span>
            <Clock size={16} className="text-text-muted" />
          </div>
          <div className="text-lg font-bold text-text-primary tabular-nums">
            <span className="text-yellow">{dist.new}</span> /{" "}
            <span className="text-text-secondary">{dist.returning}</span> /{" "}
            <span className="text-text-muted">{dist.lapsed}</span>
          </div>
          <div className="text-xs font-semibold text-text-muted mt-1">New / Returning / Lapsed</div>
        </div>
      </div>

      {/* CUSTOMER LIFECYCLE SEGMENTATION BAR */}
      <div className="p-5 rounded-2xl bg-surface-1 border border-border shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-text-primary">Customer Lifecycle Distribution</h3>
            <p className="text-xs text-text-muted font-medium mt-0.5">
              Breakdown of new, returning, and lapsed diner retention
            </p>
          </div>
          <div className="text-xs font-bold text-text-primary tabular-nums">
            {behavior?.unique ?? 0} total diners
          </div>
        </div>

        {/* Segmented bar */}
        <div className="h-4 rounded-full bg-surface-2 border border-border overflow-hidden flex p-0.5">
          {newPct > 0 && (
            <div
              className="h-full bg-yellow rounded-l-full transition-all duration-500"
              style={{ width: `${newPct}%` }}
              title={`New: ${dist.new} (${newPct}%)`}
            />
          )}
          {returningPct > 0 && (
            <div
              className="h-full bg-sand transition-all duration-500"
              style={{ width: `${returningPct}%` }}
              title={`Returning: ${dist.returning} (${returningPct}%)`}
            />
          )}
          {lapsedPct > 0 && (
            <div
              className="h-full bg-sand-dark rounded-r-full transition-all duration-500"
              style={{ width: `${lapsedPct}%` }}
              title={`Lapsed: ${dist.lapsed} (${lapsedPct}%)`}
            />
          )}
        </div>

        {/* Legend */}
        <div className="flex flex-wrap items-center gap-6 pt-1 text-xs font-semibold">
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-yellow" />
            <span className="text-text-primary font-bold">New Diners: {dist.new}</span>
            <span className="text-text-muted font-medium">({newPct}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-sand" />
            <span className="text-text-primary font-bold">Returning Diners: {dist.returning}</span>
            <span className="text-text-muted font-medium">({returningPct}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-sand-dark" />
            <span className="text-text-primary font-bold">Lapsed Diners: {dist.lapsed}</span>
            <span className="text-text-muted font-medium">({lapsedPct}%)</span>
          </div>
        </div>
      </div>

      {/* Insight */}
      <InsightCard
        title="CUSTOMER BEHAVIOR INSIGHT"
        insight={`Your repeat diner rate is exceptional at ${behavior?.repeatRate ?? 0}%. Diners spend an average of ${formatCurrency(behavior?.avgSpendPerVisit ?? 0)} per visit. Launch a loyalty incentive to convert new visitors into regular repeaters.`}
      />

      {/* MAIN VISUALIZATIONS: Activity Timeline & Top Customer List */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* CUSTOMER ACTIVITY CHART (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-surface-1 border border-border shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-text-primary">Customer Activity Over Time</h3>
            <p className="text-xs text-text-muted font-medium mt-0.5">
              Daily customer visit volume and activity trends
            </p>
          </div>

          <ChartContainer height={280} className="pt-2">
            <AreaChart data={activityTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="customerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#FED500" stopOpacity={0.18} />
                    <stop offset="95%" stopColor="#FED500" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#B8AA96" }} />
                <YAxis tick={{ fontSize: 11, fill: "#B8AA96" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#101010", borderRadius: "12px", border: "1px solid #2A2A2A", color: "#F5F1E8", fontSize: "12px" }}
                  formatter={(val: any) => [`${val} visits`, "Customer Visits"]}
                />
                <Area
                  type="monotone"
                  dataKey="visits"
                  stroke="#FED500"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#customerGrad)"
                />
              </AreaChart>
          </ChartContainer>
        </div>

        {/* TOP CUSTOMERS RANKING LIST (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-surface-1 border border-border shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-text-primary">Top Loyal Diners</h3>
            <p className="text-xs text-text-muted font-medium mt-0.5">
              Ranked by lifetime spend &amp; visit count
            </p>
          </div>

          <div className="space-y-3 pt-1">
            {(behavior?.topCustomers ?? []).slice(0, 5).map((cust, idx) => (
              <div
                key={cust.id}
                className="p-3 rounded-xl border border-border bg-surface-2 hover:bg-surface-3 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-xs shrink-0",
                      idx === 0
                        ? "bg-yellow text-[var(--on-yellow)] shadow-2xs"
                        : "bg-surface-3 border border-border text-text-secondary font-bold"
                    )}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-text-primary">{cust.name}</div>
                    <div className="text-[11px] text-text-muted font-medium">
                      {cust.visitCount} visits
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-extrabold text-sm text-text-primary tabular-nums">
                    {formatCurrency(cust.totalSpend)}
                  </div>
                  <div className="text-[10px] text-yellow font-bold uppercase tracking-wider">
                    LTV High
                  </div>
                </div>
              </div>
            ))}

            {(!behavior?.topCustomers || behavior.topCustomers.length === 0) && (
              <div className="py-6 text-center text-xs text-text-muted font-medium">
                No customer spend records found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
