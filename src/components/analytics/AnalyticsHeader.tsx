"use client";

import { Printer, Download, Calendar, ArrowRightLeft } from "lucide-react";
import { BtnSecondary } from "@/components/ui/shared";

interface AnalyticsHeaderProps {
  rangePreset: string;
  onRangeChange: (preset: string) => void;
  dateRangeDisplay: string;
  compareMode: string;
  onCompareChange: (mode: string) => void;
  onPrint: () => void;
  onExport: () => void;
}

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "week", label: "7 Days" },
  { id: "month", label: "30 Days" },
  { id: "quarter", label: "Quarter" },
];

export function AnalyticsHeader({
  rangePreset,
  onRangeChange,
  dateRangeDisplay,
  compareMode,
  onCompareChange,
  onPrint,
  onExport,
}: AnalyticsHeaderProps) {
  return (
    <div className="mb-6 space-y-4">
      {/* Title & Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border/50">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-black tracking-tight">
            Analytics &amp; Reports
          </h1>
          <p className="text-xs sm:text-sm font-medium text-muted mt-1">
            Margin, sales, customer behavior, peak hours, channels, inventory, waste, and reviews
          </p>
        </div>

        {/* Global Quick Action PDF & Export */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          <BtnSecondary onClick={onPrint} className="h-9 text-xs px-3 font-semibold">
            <Printer size={15} />
            <span>PDF</span>
          </BtnSecondary>
          <BtnSecondary onClick={onExport} className="h-9 text-xs px-3 font-semibold">
            <Download size={15} />
            <span>Export</span>
          </BtnSecondary>
        </div>
      </div>

      {/* Period Controls Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-cream/40 p-2.5 rounded-2xl border border-border/60">
        <div className="flex flex-wrap items-center gap-2">
          {/* Preset Buttons */}
          <div className="inline-flex p-1 bg-white border border-border rounded-xl shadow-2xs">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => onRangeChange(p.id)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  rangePreset === p.id
                    ? "bg-yellow text-black shadow-xs"
                    : "text-muted hover:text-black hover:bg-cream/60"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date Range Badge */}
          <div className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-border rounded-xl text-xs font-semibold text-black shadow-2xs">
            <Calendar size={14} className="text-sand-dark" />
            <span>{dateRangeDisplay}</span>
          </div>
        </div>

        {/* Compare Dropdown */}
        <div className="inline-flex items-center h-9 bg-white border border-border rounded-xl overflow-hidden shadow-2xs px-2.5">
          <ArrowRightLeft size={13} className="text-muted mr-1.5" />
          <span className="text-[11px] font-bold text-muted uppercase mr-2 tracking-wider">
            Compare:
          </span>
          <select
            value={compareMode}
            onChange={(e) => onCompareChange(e.target.value)}
            className="text-xs font-bold text-black bg-transparent outline-none cursor-pointer pr-1"
          >
            <option value="none">No comparison</option>
            <option value="prev">vs Previous period</option>
            <option value="year">vs Same period last year</option>
          </select>
        </div>
      </div>
    </div>
  );
}
