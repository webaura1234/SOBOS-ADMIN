"use client";

import { cn } from "@/lib/utils";

interface KPICardProps {
  label: string;
  value: string | number;
  delta?: number;
  deltaLabel?: string;
  sparkline?: number[];
  onClick?: () => void;
  className?: string;
}

function MiniSparkline({ data }: { data: number[] }) {
  const max = Math.max(...data, 1);
  const points = data
    .map((v, i) => `${(i / (data.length - 1)) * 56},${20 - (v / max) * 16}`)
    .join(" ");
  return (
    <svg className="sparkline" viewBox="0 0 56 20" aria-hidden="true">
      <polyline
        fill="none"
        stroke="#FED500"
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
}

export function KPICard({ label, value, delta, deltaLabel, sparkline, onClick, className }: KPICardProps) {
  const isPositive = delta !== undefined && delta >= 0;
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "bg-surface-1 border border-border rounded-2xl p-5 text-left w-full shadow-2xs",
        "hover:border-border-strong transition-all focus-ring",
        className
      )}
    >
      <div className="text-text-muted text-xs font-extrabold uppercase tracking-wide mb-2">{label}</div>
      <div className="flex items-end justify-between gap-2">
        <span className="text-3xl font-extrabold tabular-nums text-text-primary">{value}</span>
        {sparkline && <MiniSparkline data={sparkline} />}
      </div>
      {delta !== undefined && (
        <div className="mt-3 flex items-center gap-2 text-xs">
          <span className={cn("tabular-nums font-extrabold", isPositive ? "text-green" : "text-red")}>
            {isPositive ? "▲" : "▼"} {Math.abs(delta).toFixed(1)}%
          </span>
          {deltaLabel && <span className="text-text-muted font-medium">{deltaLabel}</span>}
        </div>
      )}
    </button>
  );
}
