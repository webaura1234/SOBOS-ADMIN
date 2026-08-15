"use client";

import Link from "next/link";
import { ArrowRight, X, CheckCircle2 } from "lucide-react";

export interface AlertItem {
  id: string;
  title: string;
  message: string;
  severity: string; // 'critical' | 'warning' | 'info'
  isRead: boolean;
}

interface NeedsAttentionPanelProps {
  alerts: AlertItem[];
  onDismiss: (id: string) => void;
}

export function NeedsAttentionPanel({
  alerts,
  onDismiss,
}: NeedsAttentionPanelProps) {
  const unreadAlerts = alerts.filter((a) => !a.isRead);

  // ADAPTIVE STATUS COMPONENT — 0 ISSUES CLEAR SURFACE
  if (unreadAlerts.length === 0) {
    return (
      <div className="mb-6 p-4 rounded-2xl border border-border/80 bg-white shadow-2xs flex items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-3">
          <div className="w-7 h-7 rounded-xl bg-cream border border-border/60 text-black flex items-center justify-center font-extrabold shrink-0">
            ✓
          </div>
          <div>
            <div className="font-extrabold text-black uppercase tracking-wider text-xs">
              ALL OPERATIONS CLEAR
            </div>
            <div className="text-muted font-medium text-xs mt-0.5">
              No active operational issues requiring immediate action.
            </div>
          </div>
        </div>

        <span className="px-2.5 py-1 rounded-full bg-cream border border-border text-[11px] font-extrabold text-black shrink-0">
          0 ISSUES
        </span>
      </div>
    );
  }

  return (
    <div className="mb-6 space-y-2">
      <div className="flex items-center justify-between text-[11px] font-extrabold uppercase tracking-wider text-muted">
        <span>⚠ Needs Attention</span>
        <span className="text-black font-extrabold">{unreadAlerts.length} ISSUES</span>
      </div>

      <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs divide-y divide-border/50">
        {unreadAlerts.map((item) => {
          let dotColor = "bg-amber-500";
          let actionHref = "/orders";

          if (item.severity === "critical" || item.title.toLowerCase().includes("stock")) {
            dotColor = "bg-red-600";
            actionHref = "/inventory?filter=low";
          } else if (item.severity === "warning" || item.title.toLowerCase().includes("kds")) {
            dotColor = "bg-amber-500";
            actionHref = "/orders";
          } else if (item.title.toLowerCase().includes("payment") || item.title.toLowerCase().includes("refund")) {
            dotColor = "bg-sand-dark";
            actionHref = "/payments";
          }

          return (
            <div
              key={item.id}
              className="py-3 first:pt-0 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className={`w-2.5 h-2.5 rounded-full ${dotColor} shrink-0`} />
                <div className="min-w-0">
                  <div className="font-extrabold text-black uppercase tracking-wider text-[11px]">
                    {item.title}
                  </div>
                  <div className="text-muted font-medium text-xs truncate">
                    {item.message}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-3 self-end sm:self-auto shrink-0">
                <Link
                  href={actionHref}
                  className="font-bold text-xs text-black hover:text-yellow-hover flex items-center gap-1 transition-colors"
                >
                  <span>Resolve →</span>
                </Link>

                <button
                  type="button"
                  onClick={() => onDismiss(item.id)}
                  title="Dismiss alert"
                  className="p-1 rounded-lg text-muted hover:text-black hover:bg-cream transition-colors"
                >
                  <X size={14} />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
