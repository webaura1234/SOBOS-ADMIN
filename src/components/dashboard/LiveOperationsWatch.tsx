"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";

export interface LowStockItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  threshold: number;
  branch: string | null;
}

interface LiveOperationsWatchProps {
  lowStock: LowStockItem[];
  /** True when the current scope spans more than one outlet — rows must name their branch. */
  multiBranch?: boolean;
  loading?: boolean;
}

/** Dashboard shows only the worst few; the full table lives in Inventory. */
const MAX_ROWS = 5;

export function LiveOperationsWatch({ lowStock, multiBranch = false, loading = false }: LiveOperationsWatchProps) {
  const rows = lowStock.slice(0, MAX_ROWS);

  return (
    <section className="h-full rounded-[14px] border border-border bg-surface-1 flex flex-col overflow-hidden" aria-label="Stock levels">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Stock levels</h2>
        <Link
          href="/inventory?filter=low"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-secondary hover:text-yellow transition-colors focus-ring rounded"
        >
          View inventory
          <ArrowRight size={13} />
        </Link>
      </div>

      <div className="flex-1 px-4 pb-4 pt-1 space-y-3">
        {loading &&
          [0, 1, 2, 3].map((i) => <div key={i} className="h-9 rounded-md bg-surface-3" />)}

        {!loading &&
          rows.map((item) => {
            const isCritical = item.quantity <= item.threshold / 2;
            const pct = Math.min(100, Math.max(6, (item.quantity / item.threshold) * 100));
            const tone = isCritical ? "var(--critical)" : "var(--warning)";

            return (
              <div key={item.id}>
                <div className="flex items-baseline justify-between gap-3 text-[14px] leading-5">
                  <span className="text-text-primary truncate">
                    {item.name}
                    {multiBranch && item.branch && (
                      <span className="ml-1.5 text-[12px] text-text-muted">· {item.branch}</span>
                    )}
                  </span>
                  <span className="shrink-0 text-[12px] font-semibold tabular-nums" style={{ color: tone }}>
                    {isCritical ? "Critical" : "Low"}
                  </span>
                </div>

                <div className="mt-1.5 flex items-center gap-2.5">
                  <span className="h-2 flex-1 rounded-full bg-surface-3 overflow-hidden">
                    <span
                      className="block h-full rounded-full transition-[width] duration-300"
                      style={{ width: `${pct}%`, backgroundColor: tone }}
                    />
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-text-muted w-[92px] text-right">
                    {item.quantity} / {item.threshold} {item.unit}
                  </span>
                </div>
              </div>
            );
          })}

        {!loading && rows.length === 0 && (
          <p className="py-8 text-center text-[13px] text-text-muted">
            All ingredients above threshold.
          </p>
        )}
      </div>
    </section>
  );
}
