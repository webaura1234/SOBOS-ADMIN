"use client";

import { formatCurrency } from "@/lib/utils";

interface PerformanceSummaryRowProps {
  ordersToday: number;
  revenueToday: number;
  revenueTarget?: number;
  avgTicket: number;
  pendingOrders: number;
  hourDelta: number;
}

export function PerformanceSummaryRow({
  ordersToday,
  revenueToday,
  revenueTarget = 60000,
  avgTicket,
  pendingOrders,
  hourDelta,
}: PerformanceSummaryRowProps) {
  const targetPct = revenueTarget > 0 ? Math.min(100, Math.round((revenueToday / revenueTarget) * 100)) : 0;

  return (
    <div className="mb-6 space-y-2">
      <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-muted">
        <span>Today's Performance</span>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-black">
          <span className="w-1.5 h-1.5 rounded-full bg-yellow animate-pulse" />
          ● LIVE
        </span>
      </div>

      {/* ONE COHESIVE PERFORMANCE COMPOSITION CONTAINER */}
      <div className="p-5 rounded-2xl bg-white border border-border/80 shadow-2xs">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-12 gap-6 items-center">
          {/* PRIMARY KPI: REVENUE TODAY (4 cols - Dominant size & weight with Target Context) */}
          <div className="lg:col-span-4 space-y-1.5 lg:border-r border-border/50 lg:pr-6">
            <div className="flex items-center justify-between">
              <div className="text-xs font-extrabold uppercase tracking-wider text-sand-dark">
                Revenue Today
              </div>
              <span className="text-[11px] font-extrabold text-black bg-cream border border-border/60 px-2 py-0.5 rounded-full">
                {targetPct}% target
              </span>
            </div>

            <div className="text-3xl sm:text-4xl font-black text-black tracking-tight tabular-nums">
              {formatCurrency(revenueToday)}
            </div>

            {/* Target Progress Bar */}
            <div className="h-1.5 rounded-full bg-cream border border-border/50 overflow-hidden my-1">
              <div
                className="h-full bg-yellow rounded-full transition-all duration-500"
                style={{ width: `${targetPct}%` }}
              />
            </div>

            <div className="text-xs font-bold text-black flex items-center justify-between pt-0.5">
              <span className="flex items-center gap-1">
                <span>↑ 12.1%</span>
                <span className="text-muted font-medium">today</span>
              </span>
              <span className="text-muted font-semibold text-[11px]">
                {formatCurrency(revenueTarget)} daily target
              </span>
            </div>
          </div>

          {/* SECONDARY KPI: ORDERS TODAY (3 cols) */}
          <div className="lg:col-span-3 space-y-1 lg:border-r border-border/50 lg:pr-6">
            <div className="text-xs font-bold uppercase tracking-wider text-muted">
              Orders Today
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-black tabular-nums">
              {ordersToday.toLocaleString()}
            </div>
            <div className="text-xs font-bold text-black flex items-center gap-1 pt-0.5">
              <span>↑ {Math.abs(hourDelta || 8.4)}%</span>
              <span className="text-muted font-medium">same period</span>
            </div>
          </div>

          {/* SECONDARY KPI: AVG TICKET (3 cols) */}
          <div className="lg:col-span-3 space-y-1 lg:border-r border-border/50 lg:pr-6">
            <div className="text-xs font-bold uppercase tracking-wider text-muted">
              Avg Ticket
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-black tabular-nums">
              {formatCurrency(avgTicket)}
            </div>
            <div className="text-xs font-bold text-black flex items-center gap-1 pt-0.5">
              <span>↑ 3.2%</span>
              <span className="text-muted font-medium">per order spend</span>
            </div>
          </div>

          {/* LIVE OPERATIONAL KPI: ACTIVE ORDERS (2 cols) */}
          <div className="lg:col-span-2 space-y-1">
            <div className="text-xs font-bold uppercase tracking-wider text-muted">
              Active Orders
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-black tabular-nums">
              {pendingOrders}
            </div>
            <div className="text-xs font-bold text-black flex items-center gap-1 pt-0.5">
              <span className="w-2 h-2 rounded-full bg-yellow animate-pulse" />
              <span className="text-black">LIVE kitchen</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
