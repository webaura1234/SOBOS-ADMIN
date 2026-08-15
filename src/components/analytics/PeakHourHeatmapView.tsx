"use client";

import { useMemo, useState } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { InsightCard } from "./InsightCard";
import { Flame, Clock, Calendar, TrendingUp } from "lucide-react";

export interface HeatCell {
  count: number;
  revenue: number;
}

interface PeakHourHeatmapViewProps {
  heatmap: HeatCell[][]; // 7 days x 24 hours
  loading?: boolean;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const FULL_DAYS = [
  "Sunday",
  "Monday",
  "Tuesday",
  "Wednesday",
  "Thursday",
  "Friday",
  "Saturday",
];

// Display hours: Focus on restaurant peak hours 10 AM to 11 PM (10 to 23)
const PEAK_HOURS = Array.from({ length: 14 }, (_, i) => i + 10); // 10:00 to 23:00

export function PeakHourHeatmapView({
  heatmap,
  loading = false,
}: PeakHourHeatmapViewProps) {
  // State for rich hover tooltip
  const [hoverCell, setHoverCell] = useState<{
    day: string;
    hourStr: string;
    count: number;
    revenue: number;
  } | null>(null);

  // Find maximum orders in any single cell for intensity mapping
  const maxCount = useMemo(() => {
    if (!heatmap || heatmap.length === 0) return 1;
    let m = 0;
    for (const row of heatmap) {
      for (const cell of row) {
        if (cell.count > m) m = cell.count;
      }
    }
    return Math.max(1, m);
  }, [heatmap]);

  // Compute Busiest Day & Peak Hour dynamically from data
  const summary = useMemo(() => {
    if (!heatmap || heatmap.length === 0) return null;

    let busiestDayIdx = 6; // Saturday default
    let maxDayOrders = 0;

    let peakHour = 19; // 7 PM default
    let maxCellCount = 0;
    let peakCellRev = 0;
    let peakDayIdx = 6;

    heatmap.forEach((dayRow, dayIdx) => {
      const dayTotal = dayRow.reduce((s, c) => s + c.count, 0);
      if (dayTotal > maxDayOrders) {
        maxDayOrders = dayTotal;
        busiestDayIdx = dayIdx;
      }

      dayRow.forEach((cell, hIdx) => {
        if (cell.count > maxCellCount) {
          maxCellCount = cell.count;
          peakHour = hIdx;
          peakDayIdx = dayIdx;
          peakCellRev = cell.revenue;
        }
      });
    });

    const start12 = peakHour % 12 || 12;
    const startAmpm = peakHour >= 12 ? "PM" : "AM";
    const endHour = (peakHour + 1) % 24;
    const end12 = endHour % 12 || 12;
    const endAmpm = endHour >= 12 ? "PM" : "AM";
    const hourStr = `${start12}:00 ${startAmpm} – ${end12}:00 ${endAmpm}`;

    return {
      busiestDay: FULL_DAYS[busiestDayIdx],
      peakHourStr: hourStr,
      peakOrders: maxCellCount,
      peakRevenue: peakCellRev,
      peakDayName: DAYS[peakDayIdx],
    };
  }, [heatmap]);

  const isEmpty = !heatmap || heatmap.length === 0;

  return (
    <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
      {/* SUMMARY KPIS ABOVE HEATMAP */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow/20 text-yellow-hover flex items-center justify-center font-bold shrink-0">
            <Calendar size={20} className="text-yellow-hover" />
          </div>
          <div>
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              Busiest Day
            </div>
            <div className="text-xl font-extrabold text-black mt-0.5">
              {summary ? summary.busiestDay : "Saturday"}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-red-50 text-red-600 border border-red-200/60 flex items-center justify-center font-bold shrink-0">
            <Flame size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              Peak Hour
            </div>
            <div className="text-xl font-extrabold text-black mt-0.5">
              {summary ? summary.peakHourStr : "7:00 PM – 8:00 PM"}
            </div>
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-yellow/20 text-yellow-hover flex items-center justify-center font-bold shrink-0">
            <TrendingUp size={20} />
          </div>
          <div>
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              Peak Orders / Hour
            </div>
            <div className="text-xl font-extrabold text-black mt-0.5 tabular-nums">
              {summary ? `${summary.peakOrders} orders` : "10 orders"}
            </div>
          </div>
        </div>
      </div>

      {/* Dynamic Insight Card */}
      {summary && (
        <InsightCard
          title="PEAK-HOUR INSIGHT"
          insight={`Demand peaks on ${summary.busiestDay} around ${summary.peakHourStr} with up to ${summary.peakOrders} orders per hour (${formatCurrency(summary.peakRevenue)} revenue). Schedule kitchen staff shifts accordingly.`}
        />
      )}

      {/* MAIN HEATMAP CONTAINER (FULL WIDTH) */}
      <div className="p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-4">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-border/50 pb-3">
          <div>
            <h3 className="font-bold text-base text-black flex items-center gap-2">
              <Clock size={18} className="text-yellow-hover" />
              <span>Orders &amp; Revenue Concentration by Day &amp; Hour</span>
            </h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Hover over cells to view exact hourly order volume and earnings
            </p>
          </div>

          {/* Hover Tooltip or Intensity Legend */}
          {hoverCell ? (
            <div className="flex items-center gap-2.5 px-3.5 py-1.5 rounded-xl bg-black text-white text-xs font-bold shadow-md animate-in fade-in duration-150 self-start md:self-auto">
              <span className="text-yellow font-extrabold">{hoverCell.day} · {hoverCell.hourStr}</span>
              <span className="text-muted/60">·</span>
              <span>{hoverCell.count} {hoverCell.count === 1 ? "order" : "orders"}</span>
              <span className="text-muted/60">·</span>
              <span className="text-yellow-hover">{formatCurrency(hoverCell.revenue)}</span>
              {hoverCell.count > 0 && (
                <>
                  <span className="text-muted/60">·</span>
                  <span className="text-sand text-[11px] font-normal">
                    Avg: {formatCurrency(Math.round(hoverCell.revenue / hoverCell.count))}
                  </span>
                </>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-xs font-bold text-muted self-start md:self-auto">
              <span>Low</span>
              <div className="flex items-center gap-1">
                <span className="w-5 h-5 rounded-md bg-cream border border-border/60 flex items-center justify-center text-[10px] text-muted/40 font-semibold" title="0 orders">·</span>
                <span className="w-5 h-5 rounded-md bg-yellow/20 border border-yellow/40 flex items-center justify-center text-[10px] text-black font-bold" title="1-2 orders">1</span>
                <span className="w-5 h-5 rounded-md bg-yellow/45 border border-yellow/60 flex items-center justify-center text-[10px] text-black font-bold" title="3-4 orders">3</span>
                <span className="w-5 h-5 rounded-md bg-yellow/75 border border-yellow-hover flex items-center justify-center text-[10px] text-black font-extrabold" title="5-7 orders">6</span>
                <span className="w-5 h-5 rounded-md bg-yellow border border-yellow-hover shadow-2xs flex items-center justify-center text-[10px] text-black font-black" title="8-10+ orders">10</span>
              </div>
              <span className="text-black font-extrabold">High</span>
            </div>
          )}
        </div>

        {/* HEATMAP MATRIX TABLE */}
        <div className="overflow-x-auto scrollbar-thin py-2">
          {isEmpty ? (
            <div className="py-12 text-center text-muted font-medium">
              No peak-hour order data available for this range.
            </div>
          ) : (
            <table className="w-full border-separate border-spacing-1.5 min-w-[700px]">
              <thead>
                <tr>
                  <th className="w-14"></th>
                  {PEAK_HOURS.map((h) => {
                    const formatted = `${h % 12 || 12}${h >= 12 ? "pm" : "am"}`;
                    return (
                      <th
                        key={h}
                        className="text-[11px] font-extrabold text-muted uppercase tracking-wider text-center pb-2 select-none"
                      >
                        {formatted}
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {DAYS.map((dayLabel, dayIdx) => {
                  const dayRow = heatmap[dayIdx] ?? [];
                  return (
                    <tr key={dayLabel}>
                      <td className="text-xs font-extrabold text-black pr-2 text-right select-none">
                        {dayLabel}
                      </td>
                      {PEAK_HOURS.map((hourIdx) => {
                        const cell = dayRow[hourIdx] ?? { count: 0, revenue: 0 };
                        const intensity = Math.min(1, cell.count / maxCount);
                        const hasOrders = cell.count > 0;

                        // Calculate data-driven cell style
                        let bgStyle: React.CSSProperties = {
                          backgroundColor: "#FDF6E3",
                          borderColor: "#E8DFC8",
                        };

                        if (hasOrders) {
                          const alpha = 0.22 + intensity * 0.78;
                          bgStyle = {
                            backgroundColor: `rgba(244, 179, 21, ${alpha.toFixed(2)})`,
                            borderColor: intensity > 0.6 ? "#E0A000" : "rgba(244, 179, 21, 0.6)",
                            boxShadow: intensity > 0.7 ? "0 2px 5px rgba(244, 179, 21, 0.35)" : "none",
                          };
                        }

                        const start12 = hourIdx % 12 || 12;
                        const ampm = hourIdx >= 12 ? "PM" : "AM";
                        const hourStr = `${start12}:00 ${ampm}`;

                        return (
                          <td key={hourIdx} className="p-0">
                            <div
                              style={bgStyle}
                              onMouseEnter={() =>
                                setHoverCell({
                                  day: FULL_DAYS[dayIdx],
                                  hourStr,
                                  count: cell.count,
                                  revenue: cell.revenue,
                                })
                              }
                              onMouseLeave={() => setHoverCell(null)}
                              className={cn(
                                "h-10 rounded-lg flex flex-col items-center justify-center transition-all duration-150 hover:scale-110 hover:z-20 cursor-pointer border select-none",
                                hasOrders ? "font-extrabold" : "font-normal"
                              )}
                            >
                              {hasOrders ? (
                                <span
                                  className={cn(
                                    "text-xs font-extrabold tabular-nums",
                                    intensity > 0.7 ? "text-black" : "text-black/90"
                                  )}
                                >
                                  {cell.count}
                                </span>
                              ) : (
                                <span className="text-[10px] text-muted/30 font-medium">·</span>
                              )}
                            </div>
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
