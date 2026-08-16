"use client";

import { RefreshCw } from "lucide-react";
import { format } from "date-fns";
import { QuickActionsToolbar } from "./QuickActionsToolbar";

interface DashboardHeaderProps {
  lastRefresh: Date | null;
  onRefresh: () => void;
  loading?: boolean;
  restaurantName?: string;
}

export function DashboardHeader({
  lastRefresh,
  onRefresh,
  loading = false,
  restaurantName,
}: DashboardHeaderProps) {
  return (
    <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[28px] leading-8 font-semibold tracking-tight text-text-primary">
          Dashboard
          {restaurantName && (
            <span className="text-text-muted font-normal"> · {restaurantName}</span>
          )}
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-4 ml-auto">
        <QuickActionsToolbar />

        <div className="flex items-center gap-3 shrink-0 text-[12px] border-l border-border/70 pl-4">
          <span className="text-text-muted">{format(new Date(), "EEE d MMM")}</span>

          {/* The one LIVE indicator on the page */}
          <span className="inline-flex items-center gap-1.5 font-semibold text-success">
            <span className="w-1.5 h-1.5 rounded-full bg-success animate-pulse" aria-hidden="true" />
            Live
            {lastRefresh && <span className="text-text-muted font-normal">{format(lastRefresh, "HH:mm")}</span>}
          </span>

          <button
            type="button"
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh dashboard"
            className="p-1.5 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors disabled:opacity-50 focus-ring"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-yellow" : ""} />
          </button>
        </div>
      </div>
    </div>
  );
}
