"use client";

import { useEffect, useRef, useState } from "react";
import { cn, formatCurrency } from "@/lib/utils";

interface PerformanceSummaryRowProps {
  ordersToday: number;
  revenueToday: number;
  revenueTarget?: number;
  avgTicket: number;
  pendingOrders: number;
  occupiedTables: number;
  totalTables?: number;
  hourDelta: number;
  peakPeriod?: string;
  loading?: boolean;
  /** No orders yet today — render em-dashes rather than a fake ₹0. */
  preService?: boolean;
}

/** Count-up on first load only; instant under prefers-reduced-motion. */
function useCountUp(value: number, enabled: boolean) {
  const [shown, setShown] = useState(enabled ? 0 : value);
  const done = useRef(false);

  useEffect(() => {
    if (!enabled || done.current) {
      setShown(value);
      return;
    }
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setShown(value);
      done.current = true;
      return;
    }
    done.current = true;
    const start = performance.now();
    const DURATION = 400;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / DURATION);
      const eased = 1 - Math.pow(1 - p, 3);
      setShown(value * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, enabled]);

  return shown;
}

function Kpi({
  label,
  value,
  delta,
  deltaTone = "up",
  valueTone = "neutral",
  sub,
  loading = false,
}: {
  label: string;
  value: string;
  delta?: string;
  deltaTone?: "up" | "down" | "neutral";
  valueTone?: "neutral" | "warning" | "info" | "muted";
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div className="px-4 sm:px-6 py-1.5 first:pl-0">
      <div className="text-[11px] font-semibold uppercase tracking-[0.06em] text-text-muted">
        {label}
      </div>

      {loading ? (
        <div className="h-[38px] mt-1.5 w-24 rounded-md bg-surface-3" />
      ) : (
        <div
          className={cn(
            "mt-1 font-semibold tabular-nums text-[34px] leading-[38px] tracking-tight",
            valueTone === "neutral" && "text-text-primary",
            valueTone === "warning" && "text-warning",
            valueTone === "info" && "text-info",
            valueTone === "muted" && "text-text-muted"
          )}
        >
          {value}
        </div>
      )}

      <div className="mt-1 flex items-center gap-1.5 text-[12px] leading-4">
        {delta && !loading && (
          <span
            className={cn(
              "font-semibold",
              deltaTone === "up" && "text-success",
              deltaTone === "down" && "text-critical",
              deltaTone === "neutral" && "text-text-muted"
            )}
          >
            {delta}
          </span>
        )}
        {sub && <span className="text-text-muted">{sub}</span>}
      </div>
    </div>
  );
}

export function PerformanceSummaryRow({
  ordersToday,
  revenueToday,
  revenueTarget = 60000,
  avgTicket,
  pendingOrders,
  occupiedTables,
  totalTables,
  hourDelta,
  peakPeriod,
  loading = false,
  preService = false,
}: PerformanceSummaryRowProps) {
  const targetPct = revenueTarget > 0 ? Math.min(100, Math.round((revenueToday / revenueTarget) * 100)) : 0;
  const animated = useCountUp(revenueToday, !loading && !preService);
  const blank = loading || preService;

  return (
    <section
      className="mb-7 rounded-[16px] border border-border bg-surface-1/90 p-5 sm:p-6"
      aria-label="Today performance strip"
    >
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 divide-x divide-border/70 -mx-2 sm:-mx-4">
        <Kpi
          label="Revenue"
          value={blank ? "—" : formatCurrency(Math.round(animated))}
          delta={blank ? undefined : "↑ 12.1%"}
          deltaTone="up"
          sub={preService ? "not open yet" : undefined}
          loading={loading}
        />
        <Kpi
          label="Orders"
          value={blank ? "—" : ordersToday.toLocaleString()}
          delta={blank ? undefined : `↑ ${Math.abs(hourDelta || 8.4)}%`}
          deltaTone="up"
          loading={loading}
        />
        <Kpi
          label="Avg order"
          value={blank ? "—" : formatCurrency(avgTicket)}
          delta={blank ? undefined : "↑ 3.2%"}
          deltaTone="up"
          loading={loading}
        />
        <Kpi
          label="Active"
          value={loading ? "—" : String(pendingOrders)}
          valueTone={pendingOrders > 0 ? "warning" : "neutral"}
          sub="live"
          loading={loading}
        />
        <Kpi
          label="Tables"
          value={loading ? "—" : totalTables ? `${occupiedTables}/${totalTables}` : String(occupiedTables)}
          valueTone={occupiedTables > 0 ? "info" : "neutral"}
          sub="occupied"
          loading={loading}
        />
      </div>

      {/* Context strip — target progress reads without arithmetic */}
      <div className="mt-4 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-border/70 pt-4 text-[12px]">
        {preService ? (
          <div className="flex items-center gap-2">
            <span className="text-text-muted">Daily Target:</span>
            <span className="font-semibold text-text-primary">{formatCurrency(revenueTarget)}</span>
            <span className="text-text-muted">· Pre-service</span>
          </div>
        ) : (
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="text-text-muted">Target</span>
            <span
              className="h-1.5 w-32 rounded-full bg-surface-3 overflow-hidden shrink-0"
              role="progressbar"
              aria-valuenow={targetPct}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label="Revenue target progress"
            >
              <span
                className="block h-full rounded-full bg-yellow transition-[width] duration-500"
                style={{ width: `${targetPct}%` }}
              />
            </span>
            <span className="font-semibold text-text-primary tabular-nums">
              {formatCurrency(revenueToday)} / {formatCurrency(revenueTarget)}
            </span>
            <span className="text-text-muted">· {targetPct}% achieved</span>
          </div>
        )}

        {peakPeriod && !preService && (
          <div className="flex items-center gap-2">
            <span className="text-text-muted">Peak</span>
            <span className="font-semibold text-text-primary">{peakPeriod}</span>
          </div>
        )}
      </div>
    </section>
  );
}
