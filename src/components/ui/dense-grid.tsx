"use client";

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
}: DenseGridProps<T>) {
  if (data.length === 0) {
    return <EmptyState title={emptyMessage} description={emptyDescription} />;
  }

  const cols = showRowHint && onRowClick
    ? [...columns, { key: "_action", header: "", width: "72px", align: "right" as const, render: () => null }]
    : columns;

  return (
    <div className={cn("overflow-auto scrollbar-thin page-surface", className)} role="grid" aria-rowcount={data.length}>
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
          {data.map((row, idx) => (
            <tr
              key={row.id}
              role="row"
              aria-rowindex={idx + 1}
              aria-selected={selectedIds.has(row.id)}
              className={cn(
                "group border-b border-border/80 transition-colors",
                onRowClick && "cursor-pointer hover:bg-primary/10",
                idx % 2 === 1 ? "bg-cream/25" : "bg-white",
                focusedIndex === idx && "bg-cream",
                selectedIds.has(row.id) && "bg-primary/20"
              )}
              onClick={() => onRowClick?.(row)}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
