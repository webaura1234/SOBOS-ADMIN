"use client";

import { RefreshCw, Clock, Timer, Users, LayoutGrid } from "lucide-react";
import { format } from "date-fns";

interface DashboardHeaderProps {
  lastRefresh: Date | null;
  onRefresh: () => void;
  loading?: boolean;
  revenueToday?: number;
  revenueTarget?: number;
  pendingOrders?: number;
  occupiedTables?: number;
}

export function DashboardHeader({
  lastRefresh,
  onRefresh,
  loading = false,
  revenueToday = 49000,
  revenueTarget = 60000,
  pendingOrders = 31,
  occupiedTables = 3,
}: DashboardHeaderProps) {
  const targetPct = revenueTarget > 0 ? Math.min(100, Math.round((revenueToday / revenueTarget) * 100)) : 0;

  return (
    <div className="mb-6 flex flex-col lg:flex-row lg:items-start justify-between gap-6">
      {/* LEFT COLUMN: Title, Subtitle, Updated / Refresh, 3 Context Cards */}
      <div className="flex-1 min-w-0 space-y-4">
        <div>
          {/* Main Title Row: Dashboard · Today · [ 🔴 LIVE ] */}
          <div className="flex items-baseline gap-2.5 flex-wrap">
            <h1 className="text-3xl sm:text-4xl font-black text-black tracking-tight leading-none">
              Dashboard
            </h1>
            <span className="text-sm font-semibold text-muted">· Today ·</span>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-red-50 text-red-600 text-xs font-extrabold border border-red-200/80 shadow-2xs self-center">
              <span className="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse" />
              LIVE
            </span>
          </div>

          {/* Subtitle */}
          <p className="text-xs sm:text-sm font-medium text-muted mt-1.5">
            Restaurant activity at a glance
          </p>
        </div>

        {/* Updated / Refresh Row */}
        <div className="flex items-center gap-3 text-xs font-semibold text-muted pt-0.5">
          {lastRefresh && (
            <div className="flex items-center gap-1.5 text-muted/80">
              <Clock size={13} />
              <span>Updated {format(lastRefresh, "HH:mm")}</span>
            </div>
          )}

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            className="inline-flex items-center gap-1.5 text-xs font-extrabold text-black hover:text-yellow-hover transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} className={loading ? "animate-spin text-yellow-hover" : "text-black"} />
            <span>Refresh</span>
          </button>
        </div>

        {/* 3 TOP OPERATIONAL CONTEXT CARDS (Matching input_file_0.png) */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-1">
          {/* Card 1: Prep Time */}
          <div className="p-3.5 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <Timer size={18} />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Prep Time
              </div>
              <div className="text-lg font-black text-black tracking-tight leading-tight mt-0.5">
                ~14 mins
              </div>
              <div className="text-[11px] font-semibold text-muted/80 mt-0.5">
                Average today
              </div>
            </div>
          </div>

          {/* Card 2: Staff Active */}
          <div className="p-3.5 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <Users size={18} />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Staff Active
              </div>
              <div className="text-lg font-black text-black tracking-tight leading-tight mt-0.5">
                4
              </div>
              <div className="text-[11px] font-semibold text-muted/80 mt-0.5">
                On duty now
              </div>
            </div>
          </div>

          {/* Card 3: Tables Occupied */}
          <div className="p-3.5 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center gap-3">
            <div className="w-9 h-9 rounded-full bg-emerald-50 text-emerald-600 border border-emerald-100 flex items-center justify-center shrink-0">
              <LayoutGrid size={18} />
            </div>
            <div>
              <div className="text-[11px] font-bold uppercase tracking-wider text-muted">
                Tables Occupied
              </div>
              <div className="text-lg font-black text-black tracking-tight leading-tight mt-0.5">
                3
              </div>
              <div className="text-[11px] font-semibold text-muted/80 mt-0.5">
                Currently in use
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* RIGHT COLUMN: TODAY'S PULSE WIDGET */}
      <div className="w-full lg:w-[380px] shrink-0 bg-white border border-border/80 rounded-2xl p-4.5 shadow-2xs">
        <div className="flex items-center justify-between text-[11px] font-extrabold tracking-wider text-muted uppercase border-b border-border/40 pb-2 mb-3">
          <span>TODAY'S PULSE</span>
          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-600">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
            LIVE
          </span>
        </div>

        <div className="space-y-3">
          <div className="flex items-start justify-between gap-3">
            {/* Primary: Revenue Target Progress */}
            <div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-3xl font-black text-black tabular-nums tracking-tight">
                  {targetPct}%
                </span>
                <span className="text-[11px] font-extrabold text-muted uppercase tracking-wider">
                  REVENUE TARGET
                </span>
              </div>
            </div>

            {/* Secondary: Kitchen Status */}
            <div className="text-right">
              <div className="text-[11px] font-extrabold text-muted uppercase tracking-wider">
                KITCHEN
              </div>
              <div className="inline-flex items-center gap-1 text-xs font-black text-emerald-600 pt-0.5">
                <span>Healthy ✓</span>
              </div>
            </div>
          </div>

          {/* Visual Progress Indicator */}
          <div className="h-1.5 rounded-full bg-cream border border-border/50 overflow-hidden">
            <div
              className="h-full bg-yellow rounded-full transition-all duration-500"
              style={{ width: `${targetPct}%` }}
            />
          </div>

          {/* Bottom Context: Active Orders & Tables */}
          <div className="pt-2 border-t border-border/40 flex items-center justify-between text-xs font-bold text-black">
            <div className="flex items-center gap-1.5">
              <span className="tabular-nums font-black text-black">{pendingOrders}</span>
              <span className="text-muted font-bold text-[11px] uppercase tracking-wider">ACTIVE ORDERS</span>
            </div>
            <span className="text-muted/60 font-bold">·</span>
            <div className="flex items-center gap-1.5">
              <span className="tabular-nums font-black text-black">{occupiedTables}</span>
              <span className="text-muted font-bold text-[11px] uppercase tracking-wider">TABLES</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
