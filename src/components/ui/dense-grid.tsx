"use client";

import { useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { EmptyState } from "./shared";

export interface Column<T> {
  key: string;
  header: string;
  width?: string;
  align?: "left" | "right" | "center";
  render?: (row: T, index: number) => React.ReactNode;
  sortable?: boolean;
}

interface DenseGridProps<T extends { id: string }> {
  columns: Column<T>[];
  data: T[];
  selectedIds?: Set<string>;
  onSelect?: (id: string) => void;
  onSelectAll?: () => void;
  onRowClick?: (row: T) => void;
  focusedIndex?: number;
  sortKey?: string;
  sortDir?: "asc" | "desc";
  onSort?: (key: string) => void;
  selectable?: boolean;
  emptyMessage?: string;
  emptyDescription?: string;
  className?: string;
  showRowHint?: boolean;
  virtualizeThreshold?: number;
}

export function DenseGrid<T extends { id: string }>({
  columns,
  data,
  selectedIds = new Set(),
  onSelect,
  onSelectAll,
  onRowClick,
  focusedIndex = 0,
  sortKey,
  sortDir,
  onSort,
  selectable = true,
  emptyMessage = "No records found",
  emptyDescription,
  className,
  showRowHint = true,
  virtualizeThreshold = 100,
}: DenseGridProps<T>) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(focusedIndex);
  const [scrollTop, setScrollTop] = useState(0);
  const rowHeight = 52;
  const viewportHeight = 620;
  const shouldVirtualize = data.length > virtualizeThreshold;

  const visibleRange = useMemo(() => {
    if (!shouldVirtualize) return { start: 0, end: data.length, topPad: 0, bottomPad: 0 };
    const start = Math.max(0, Math.floor(scrollTop / rowHeight) - 8);
    const visibleCount = Math.ceil(viewportHeight / rowHeight) + 16;
    const end = Math.min(data.length, start + visibleCount);
    return {
      start,
      end,
      topPad: start * rowHeight,
      bottomPad: Math.max(0, (data.length - end) * rowHeight),
    };
  }, [data.length, scrollTop, shouldVirtualize]);

  const visibleRows = data.slice(visibleRange.start, visibleRange.end);

  const focusRow = (index: number) => {
    const next = Math.max(0, Math.min(data.length - 1, index));
    setActiveIndex(next);
    if (shouldVirtualize) {
      containerRef.current?.scrollTo({ top: Math.max(0, next * rowHeight - rowHeight * 2), behavior: "smooth" });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLButtonElement) return;
    if (["ArrowDown", "j"].includes(e.key)) {
      e.preventDefault();
      focusRow(activeIndex + 1);
    }
    if (["ArrowUp", "k"].includes(e.key)) {
      e.preventDefault();
      focusRow(activeIndex - 1);
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = data[activeIndex];
      if (row) onRowClick?.(row);
    }
    if (e.key === " " && selectable) {
      e.preventDefault();
      const row = data[activeIndex];
      if (row) onSelect?.(row.id);
    }
  };

  if (data.length === 0) {
    return <EmptyState title={emptyMessage} description={emptyDescription} />;
  }

  const cols = showRowHint && onRowClick
    ? [...columns, { key: "_action", header: "", width: "72px", align: "right" as const, render: () => null }]
    : columns;

  return (
    <div
      ref={containerRef}
      className={cn("overflow-auto scrollbar-thin page-surface focus-ring", className)}
      role="grid"
      aria-rowcount={data.length}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      onScroll={(e) => shouldVirtualize && setScrollTop(e.currentTarget.scrollTop)}
      style={shouldVirtualize ? { maxHeight: viewportHeight } : undefined}
    >
      <div className="px-3 py-2 text-xs font-bold text-muted border-b border-border bg-white">
        {shouldVirtualize ? `Optimized grid: showing ${visibleRange.start + 1}-${visibleRange.end} of ${data.length}. ` : ""}
        Use ↑/↓ or j/k to move, Enter to open{selectable ? ", Space to select" : ""}.
      </div>
      <table className="w-full border-collapse" style={{ fontSize: "var(--fs)" }}>
        <thead className="sticky top-0 z-10 bg-cream/95 backdrop-blur-sm border-b-2 border-border">
          <tr role="row">
            {selectable && (
              <th className="grid-cell w-12 text-left" role="columnheader">
                <input
                  type="checkbox"
                  aria-label="Select all"
                  checked={selectedIds.size === data.length && data.length > 0}
                  onChange={onSelectAll}
                  className="rounded w-5 h-5 accent-[#F4B315]"
                />
              </th>
            )}
            {cols.map((col) => (
              <th
                key={col.key}
                role="columnheader"
                aria-sort={sortKey === col.key ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                className={cn(
                  "grid-cell font-bold text-black text-left whitespace-nowrap",
                  col.align === "right" && "text-right",
                  col.sortable && "cursor-pointer hover:text-primary select-none"
                )}
                style={{ width: col.width }}
                onClick={() => col.sortable && onSort?.(col.key)}
              >
                {col.header}
                {sortKey === col.key && (sortDir === "asc" ? " ▲" : " ▼")}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {shouldVirtualize && visibleRange.topPad > 0 && (
            <tr aria-hidden>
              <td colSpan={cols.length + (selectable ? 1 : 0)} style={{ height: visibleRange.topPad, padding: 0 }} />
            </tr>
          )}
          {visibleRows.map((row, visibleIdx) => {
            const idx = visibleRange.start + visibleIdx;
            return (
            <tr
              key={row.id}
              role="row"
              aria-rowindex={idx + 1}
              aria-selected={selectedIds.has(row.id)}
              className={cn(
                "group border-b border-border/80 transition-colors",
                onRowClick && "cursor-pointer hover:bg-primary/10",
                idx % 2 === 1 ? "bg-cream/25" : "bg-white",
                activeIndex === idx && "bg-cream outline outline-2 outline-primary/50",
                selectedIds.has(row.id) && "bg-primary/20"
              )}
              onClick={() => {
                setActiveIndex(idx);
                onRowClick?.(row);
              }}
            >
              {selectable && (
                <td className="grid-cell" role="gridcell" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select row ${idx + 1}`}
                    checked={selectedIds.has(row.id)}
                    onChange={() => onSelect?.(row.id)}
                    className="rounded w-5 h-5 accent-[#F4B315]"
                  />
                </td>
              )}
              {cols.map((col) => (
                <td
                  key={col.key}
                  role="gridcell"
                  className={cn(
                    "grid-cell whitespace-nowrap font-semibold text-black",
                    col.align === "right" && "text-right tabular-nums",
                    (col.key === "name" || col.key === "label") && "font-bold",
                    col.key === "_action" && "text-right"
                  )}
                >
                  {col.key === "_action" ? (
                    <span className="inline-flex items-center justify-end gap-1 text-base font-bold text-muted opacity-70 group-hover:opacity-100 group-hover:text-black transition-all">
                      View →
                    </span>
                  ) : col.render ? (
                    col.render(row, idx)
                  ) : (
                    (row as Record<string, unknown>)[col.key] as React.ReactNode
                  )}
                </td>
              ))}
            </tr>
          );})}
          {shouldVirtualize && visibleRange.bottomPad > 0 && (
            <tr aria-hidden>
              <td colSpan={cols.length + (selectable ? 1 : 0)} style={{ height: visibleRange.bottomPad, padding: 0 }} />
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
