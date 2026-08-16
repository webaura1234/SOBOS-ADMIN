"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { ChevronRight, ArrowRight } from "lucide-react";

export interface StatusBreakdown {
  pending: number;
  preparing: number;
  ready: number;
}

interface RestaurantPulseProps {
  statusBreakdown: StatusBreakdown;
  longestWait: number;
  delayedOrders: number;
  activeOrders: number;
  loading?: boolean;
}

const STAGES = [
  {
    key: "pending",
    label: "Queued",
    hint: "Not started",
    href: "/orders?status=pending",
    color: "var(--text-muted)",
    glow: "var(--glow-yellow)",
  },
  {
    key: "preparing",
    label: "Preparing",
    hint: "In the kitchen",
    href: "/orders?status=preparing",
    color: "var(--warning)",
    glow: "var(--glow-warning)",
  },
  {
    key: "ready",
    label: "Ready",
    hint: "At the pass",
    href: "/orders?status=ready",
    color: "var(--success)",
    glow: "var(--glow-success)",
  },
] as const;

export function RestaurantPulse({
  statusBreakdown,
  longestWait,
  delayedOrders,
  activeOrders,
  loading = false,
}: RestaurantPulseProps) {
  const total = statusBreakdown.pending + statusBreakdown.preparing + statusBreakdown.ready;

  // Contradictory values must never render silently.
  if (process.env.NODE_ENV !== "production" && !loading && total !== activeOrders) {
    console.warn(`[OrderFlow] stages (${total}) != active orders (${activeOrders})`);
  }

  return (
    <section
      className="h-full rounded-[18px] border border-border-strong bg-surface-2 flex flex-col overflow-hidden"
      aria-label="Live order flow"
    >
      <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3">
        <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Live order flow</h2>
        <span className="text-[12px] text-text-muted tabular-nums">{activeOrders} active</span>
      </div>

      <div className="flex-1 px-6 pb-2">
        <div className="flex flex-col sm:flex-row sm:items-stretch">
          {STAGES.map((stage, i) => {
            const count = statusBreakdown[stage.key];
            const pct = total > 0 ? Math.round((count / total) * 100) : 0;

            return (
              <div key={stage.key} className="flex items-stretch sm:flex-1 min-w-0">
                <Link
                  href={stage.href}
                  className="group flex-1 min-w-0 rounded-[10px] px-3 py-3 -mx-1 transition-colors hover:bg-surface-3 focus-ring"
                >
                  {loading ? (
                    <div className="h-11 w-16 rounded-md bg-surface-3" />
                  ) : (
                    <div
                      className="text-[40px] leading-[44px] font-semibold tabular-nums tracking-tight transition-colors"
                      style={{
                        color: count === 0 ? "var(--text-muted)" : stage.key === "pending" ? "var(--text-primary)" : stage.color,
                      }}
                    >
                      {count}
                    </div>
                  )}

                  <div className="mt-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-text-secondary">
                    {stage.label}
                  </div>

                  {/* Share of the live pipeline */}
                  <div className="mt-2 h-2 rounded-full bg-surface-3 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-[width] duration-300"
                      style={{
                        width: `${pct}%`,
                        backgroundColor: stage.color,
                        backgroundImage: stage.glow,
                      }}
                    />
                  </div>

                  <div className="mt-1.5 text-[12px] leading-4 text-text-muted">{stage.hint}</div>
                </Link>

                {i < STAGES.length - 1 && (
                  <div className="flex items-center px-1 shrink-0" aria-hidden="true">
                    <ChevronRight size={18} className="text-text-disabled rotate-90 sm:rotate-0" />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 px-6 py-3.5 border-t border-border-strong/60">
        <div className="flex items-center gap-2 text-[12px] min-w-0">
          <span className="text-text-muted">Oldest ticket</span>
          <span
            className={cn(
              "font-semibold tabular-nums",
              delayedOrders > 0 ? "text-critical" : "text-text-primary"
            )}
          >
            {longestWait} min
          </span>
          {delayedOrders > 0 && (
            <span className="text-critical">· {delayedOrders} delayed</span>
          )}
        </div>

        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-primary hover:text-yellow transition-colors focus-ring rounded"
        >
          Live orders
          <ArrowRight size={13} />
        </Link>
      </div>
    </section>
  );
}
