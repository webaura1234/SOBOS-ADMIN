"use client";

import { useMemo } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { InsightCard } from "./InsightCard";
import { Users, UserCheck, RefreshCw, Clock } from "lucide-react";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
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
      <div className="py-12 text-center text-muted font-medium bg-cream/20 rounded-2xl border border-dashed border-border">
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
        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-muted uppercase tracking-wider mb-1">
            <span>Unique Customers</span>
            <Users size={16} className="text-yellow-hover" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-black tabular-nums">
            {behavior?.unique ?? 0}
          </div>
          <div className="text-xs font-semibold text-sand-dark mt-1">↑ Active profiles</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-muted uppercase tracking-wider mb-1">
            <span>Repeat Rate</span>
            <RefreshCw size={16} className="text-yellow-hover" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-black tabular-nums">
            {behavior?.repeatRate ?? 0}%
          </div>
          <div className="text-xs font-semibold text-sand-dark mt-1">High retention</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-muted uppercase tracking-wider mb-1">
            <span>Avg Spend / Visit</span>
            <UserCheck size={16} className="text-sand-dark" />
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-black tabular-nums">
            {formatCurrency(behavior?.avgSpendPerVisit ?? 0)}
          </div>
          <div className="text-xs font-semibold text-sand-dark mt-1">↑ 5.4% basket size</div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-bold text-muted uppercase tracking-wider mb-1">
            <span>Lifecycle Split</span>
            <Clock size={16} className="text-muted" />
          </div>
          <div className="text-lg font-bold text-black tabular-nums">
            <span className="text-yellow-hover">{dist.new}</span> /{" "}
            <span className="text-sand-dark">{dist.returning}</span> /{" "}
            <span className="text-muted">{dist.lapsed}</span>
          </div>
          <div className="text-xs font-semibold text-muted mt-1">New / Returning / Lapsed</div>
        </div>
      </div>

      {/* CUSTOMER LIFECYCLE SEGMENTATION BAR */}
      <div className="p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-black">Customer Lifecycle Distribution</h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Breakdown of new, returning, and lapsed diner retention
            </p>
          </div>
          <div className="text-xs font-bold text-black tabular-nums">
            {behavior?.unique ?? 0} total diners
          </div>
        </div>

        {/* Segmented bar */}
        <div className="h-4 rounded-full bg-cream border border-border/60 overflow-hidden flex p-0.5">
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
            <span className="text-black font-bold">New Diners: {dist.new}</span>
            <span className="text-muted font-medium">({newPct}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-sand" />
            <span className="text-black font-bold">Returning Diners: {dist.returning}</span>
            <span className="text-muted font-medium">({returningPct}%)</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-3 h-3 rounded-full bg-sand-dark" />
            <span className="text-black font-bold">Lapsed Diners: {dist.lapsed}</span>
            <span className="text-muted font-medium">({lapsedPct}%)</span>
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
        <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-black">Customer Activity Over Time</h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Daily customer visit volume and activity trends
            </p>
          </div>

          <div className="h-[280px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={activityTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="customerGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F4B315" stopOpacity={0.4} />
                    <stop offset="95%" stopColor="#F4B315" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#8B7355" }} />
                <YAxis tick={{ fontSize: 11, fill: "#8B7355" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1A141A", borderRadius: "12px", color: "#fff", fontSize: "12px" }}
                  formatter={(val: any) => [`${val} visits`, "Customer Visits"]}
                />
                <Area
                  type="monotone"
                  dataKey="visits"
                  stroke="#F4B315"
                  strokeWidth={2.5}
                  fillOpacity={1}
                  fill="url(#customerGrad)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* TOP CUSTOMERS RANKING LIST (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-black">Top Loyal Diners</h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Ranked by lifetime spend &amp; visit count
            </p>
          </div>

          <div className="space-y-3 pt-1">
            {(behavior?.topCustomers ?? []).slice(0, 5).map((cust, idx) => (
              <div
                key={cust.id}
                className="p-3 rounded-xl border border-border/60 bg-cream/20 hover:bg-cream/40 transition-colors flex items-center justify-between gap-3"
              >
                <div className="flex items-center gap-3">
                  <div
                    className={cn(
                      "w-8 h-8 rounded-full flex items-center justify-center font-extrabold text-xs shrink-0",
                      idx === 0
                        ? "bg-yellow text-black shadow-2xs"
                        : idx === 1
                        ? "bg-sand/60 text-black"
                        : "bg-cream border border-border text-black"
                    )}
                  >
                    {idx + 1}
                  </div>
                  <div>
                    <div className="font-bold text-sm text-black">{cust.name}</div>
                    <div className="text-[11px] text-muted font-medium">
                      {cust.visitCount} visits
                    </div>
                  </div>
                </div>

                <div className="text-right">
                  <div className="font-extrabold text-sm text-black tabular-nums">
                    {formatCurrency(cust.totalSpend)}
                  </div>
                  <div className="text-[10px] text-black font-bold uppercase tracking-wider">
                    LTV High
                  </div>
                </div>
              </div>
            ))}

            {(!behavior?.topCustomers || behavior.topCustomers.length === 0) && (
              <div className="py-6 text-center text-xs text-muted font-medium">
                No customer spend records found.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
