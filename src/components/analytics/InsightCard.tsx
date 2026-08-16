"use client";

import { Lightbulb, ArrowRight } from "lucide-react";

interface InsightCardProps {
  title?: string;
  insight: string;
  actionLabel?: string;
  onAction?: () => void;
  className?: string;
}

export function InsightCard({
  title = "INSIGHT",
  insight,
  actionLabel,
  onAction,
  className = "",
}: InsightCardProps) {
  return (
    <div
      className={`p-4 rounded-2xl border border-[var(--border-yellow)] bg-gradient-to-r from-[var(--yellow-surface)] via-surface-1 to-surface-2 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm transition-all shadow-2xs ${className}`}
    >
      <div className="flex items-start sm:items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-yellow/20 text-yellow flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 font-bold border border-yellow/30">
          <Lightbulb size={18} className="text-yellow" />
        </div>
        <div>
          <span className="inline-block text-[11px] font-bold tracking-wider text-yellow uppercase mr-2">
            💡 {title}
          </span>
          <span className="font-medium text-text-primary">{insight}</span>
        </div>
      </div>

      {actionLabel && (
        <button
          onClick={onAction}
          className="self-end sm:self-center inline-flex items-center gap-1.5 text-xs font-bold text-yellow hover:text-yellow-hover hover:underline shrink-0"
        >
          {actionLabel}
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
