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
      className={`p-4 rounded-xl border border-sand/40 bg-gradient-to-r from-cream via-cream/60 to-white flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-sm transition-all ${className}`}
    >
      <div className="flex items-start sm:items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-yellow/20 text-yellow-hover flex items-center justify-center shrink-0 mt-0.5 sm:mt-0 font-bold">
          <Lightbulb size={18} className="text-yellow-700" />
        </div>
        <div>
          <span className="inline-block text-[11px] font-bold tracking-wider text-sand-dark uppercase mr-2">
            💡 {title}
          </span>
          <span className="font-medium text-black">{insight}</span>
        </div>
      </div>

      {actionLabel && (
        <button
          onClick={onAction}
          className="self-end sm:self-center inline-flex items-center gap-1.5 text-xs font-bold text-black hover:text-yellow-hover hover:underline shrink-0"
        >
          {actionLabel}
          <ArrowRight size={14} />
        </button>
      )}
    </div>
  );
}
