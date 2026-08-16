"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { AlertTriangle, ArrowRight, X } from "lucide-react";

export interface AttentionItem {
  id: string;
  severity: "critical" | "warning";
  /** How many underlying problems this row represents — the badge sums these. */
  count: number;
  title: string;
  detail?: string;
  href: string;
  /** Computed conditions clear themselves; only Alert rows can be dismissed by hand. */
  dismissible?: boolean;
}

/** Retained for the /api/dashboard PATCH contract on Alert rows. */
export interface AlertItem {
  id: string;
  title: string;
  message: string;
  severity: string;
  isRead: boolean;
}

interface NeedsAttentionPanelProps {
  attention: AttentionItem[];
  onDismiss: (id: string) => void;
  loading?: boolean;
}

const MAX_VISIBLE = 4;

export function NeedsAttentionPanel({ attention, onDismiss, loading = false }: NeedsAttentionPanelProps) {
  const criticalCount = attention.filter((a) => a.severity === "critical").length;
  // Sum the underlying problems, not the number of rules that matched.
  const issueCount = attention.reduce((sum, a) => sum + (a.count ?? 1), 0);
  const visible = attention.slice(0, MAX_VISIBLE);
  const hidden = attention.length - visible.length;
  const worst = criticalCount > 0 ? "critical" : "warning";

  if (loading) {
    return (
      <section className="h-full rounded-[18px] border border-border bg-surface-1 p-5 space-y-3">
        <div className="h-5 w-40 rounded-md bg-surface-3" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-12 rounded-md bg-surface-3" />
        ))}
      </section>
    );
  }

  return (
    <section
      className={cn(
        "h-full rounded-[18px] border flex flex-col overflow-hidden",
        worst === "critical" ? "border-[var(--border-critical)]" : "border-[var(--border-warning)]"
      )}
      style={{
        backgroundColor: "var(--surface-1)",
        backgroundImage: worst === "critical" ? "var(--red-panel-gradient)" : "linear-gradient(180deg, #1D1509 0%, #0F0F0F 100%)",
      }}
      aria-label="Needs attention"
      aria-live="polite"
    >
      <div className="flex items-center justify-between gap-3 px-6 pt-6 pb-3">
        <h2 className="text-[16px] font-semibold leading-6 text-text-primary flex items-center gap-2">
          <AlertTriangle
            size={17}
            className={worst === "critical" ? "text-critical" : "text-warning"}
            aria-hidden="true"
          />
          Needs attention
        </h2>
        <span
          className={cn(
            "text-[12px] font-semibold tabular-nums",
            worst === "critical" ? "text-critical" : "text-warning"
          )}
        >
          {issueCount} {issueCount === 1 ? "issue" : "issues"}
        </span>
      </div>

      <div className="flex-1 px-6 pb-3">
        {visible.map((item) => {
          const isCritical = item.severity === "critical";
          return (
            <div key={item.id} className="flex items-center gap-2 border-t border-border/60 first:border-t-0">
              <Link
                href={item.href}
                className="group flex items-center gap-3 flex-1 min-w-0 py-2.5 -mx-2 px-2 rounded-[10px] hover:bg-surface-3 transition-colors focus-ring"
              >
                {/* Fixed-width number column so the counts align vertically */}
                <span
                  className={cn(
                    "w-10 shrink-0 text-right text-[28px] leading-8 font-semibold tabular-nums",
                    isCritical ? "text-critical" : "text-warning"
                  )}
                >
                  {item.count}
                </span>

                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-5 text-text-primary group-hover:text-yellow transition-colors">
                    {item.title}
                  </span>
                  {item.detail && (
                    <span className="block text-[12px] leading-4 text-text-muted truncate">
                      {item.detail}
                    </span>
                  )}
                </span>

                {/* Severity in text as well as colour — never colour alone */}
                <span
                  className={cn(
                    "shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] px-2 py-0.5 rounded-md border",
                    isCritical
                      ? "text-critical border-[var(--border-critical)] bg-[var(--critical-surface)]"
                      : "text-warning border-[var(--border-warning)] bg-[var(--warning-surface)]"
                  )}
                >
                  {isCritical ? "Critical" : "Warning"}
                </span>

                <ArrowRight
                  size={15}
                  className="shrink-0 text-text-muted group-hover:text-text-primary transition-colors"
                  aria-hidden="true"
                />
              </Link>

              {item.dismissible && (
                <button
                  type="button"
                  onClick={() => onDismiss(item.id)}
                  aria-label={`Dismiss ${item.title}`}
                  className="p-1 rounded-md text-text-muted hover:text-text-primary hover:bg-surface-3 transition-colors shrink-0 focus-ring"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          );
        })}

        {hidden > 0 && (
          <Link
            href="/orders"
            className="block border-t border-border/60 py-2.5 text-[12px] font-semibold text-text-secondary hover:text-yellow transition-colors focus-ring"
          >
            +{hidden} more
          </Link>
        )}
      </div>
    </section>
  );
}
