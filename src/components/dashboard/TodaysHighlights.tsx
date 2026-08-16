"use client";

import { Flame, TrendingUp, CheckCircle2 } from "lucide-react";

interface TodaysHighlightsProps {
  peakPeriod?: string;
  revenueVsYesterday?: string;
  operationsStatus?: string;
}

export function TodaysHighlights({
  peakPeriod = "11 AM – 12 PM",
  revenueVsYesterday = "+12.1%",
  operationsStatus = "All Clear",
}: TodaysHighlightsProps) {
  return (
    <div className="h-full bg-surface-1 border border-border rounded-2xl p-4 shadow-2xs flex flex-col text-text-primary">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-text-muted">
        Today&apos;s Highlights
      </div>

      <div className="flex-1 grid grid-cols-3 gap-2 divide-x divide-border/40 text-left content-center mt-3">
        {/* Highlight 1: Peak Period */}
        <div className="space-y-1 pr-1">
          <div className="flex items-center gap-1.5 text-amber-600">
            <Flame size={15} className="shrink-0 text-amber-500" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted truncate">
              Peak Period
            </span>
          </div>
          <div className="text-xs sm:text-sm font-black text-text-primary tracking-tight truncate">
            {peakPeriod}
          </div>
        </div>

        {/* Highlight 2: Revenue vs Yesterday */}
        <div className="space-y-1 pl-3 pr-1">
          <div className="flex items-center gap-1.5 text-emerald-600">
            <TrendingUp size={15} className="shrink-0 text-emerald-600" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted truncate">
              Revenue
            </span>
          </div>
          <div className="text-xs sm:text-sm font-black text-emerald-600 tracking-tight truncate">
            {revenueVsYesterday}
          </div>
        </div>

        {/* Highlight 3: Operations */}
        <div className="space-y-1 pl-3">
          <div className="flex items-center gap-1.5 text-emerald-600">
            <CheckCircle2 size={15} className="shrink-0 text-emerald-600" />
            <span className="text-[11px] font-extrabold uppercase tracking-wider text-muted truncate">
              Operations
            </span>
          </div>
          <div className="text-xs sm:text-sm font-black text-emerald-600 tracking-tight truncate">
            {operationsStatus}
          </div>
        </div>
      </div>
    </div>
  );
}
