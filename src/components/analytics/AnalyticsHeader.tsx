"use client";

import { useState } from "react";
import { Printer, Download, Calendar, ArrowRightLeft, Check, X } from "lucide-react";
import { BtnPrimary, BtnSecondary } from "@/components/ui/shared";

interface AnalyticsHeaderProps {
  rangePreset: string;
  onRangeChange: (preset: string) => void;
  dateRangeDisplay: string;
  customFrom: string;
  customTo: string;
  onCustomDateApply: (from: string, to: string) => void;
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
  customFrom,
  customTo,
  onCustomDateApply,
  compareMode,
  onCompareChange,
  onPrint,
  onExport,
}: AnalyticsHeaderProps) {
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [tempFrom, setTempFrom] = useState(customFrom);
  const [tempTo, setTempTo] = useState(customTo);

  const handleApplyCustom = () => {
    if (!tempFrom || !tempTo) return;
    onCustomDateApply(tempFrom, tempTo);
    setShowDatePicker(false);
  };

  return (
    <div className="mb-6 space-y-4">
      {/* Title & Header Row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-3 border-b border-border">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-text-primary tracking-tight">
            Analytics &amp; Reports
          </h1>
          <p className="text-xs sm:text-sm font-medium text-text-muted mt-1">
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
      <div className="flex flex-wrap items-center justify-between gap-3 bg-surface-2 p-2.5 rounded-2xl border border-border">
        <div className="flex flex-wrap items-center gap-2 relative">
          {/* Preset Buttons */}
          <div className="inline-flex p-1 bg-surface-1 border border-border rounded-xl shadow-2xs">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                onClick={() => {
                  setShowDatePicker(false);
                  onRangeChange(p.id);
                }}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  rangePreset === p.id
                    ? "bg-yellow text-[var(--on-yellow)] shadow-xs"
                    : "text-text-secondary hover:text-text-primary hover:bg-surface-3"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Date Range Badge (Clickable Popover Trigger) */}
          <div className="relative">
            <button
              type="button"
              onClick={() => {
                setTempFrom(customFrom);
                setTempTo(customTo);
                setShowDatePicker((prev) => !prev);
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-1.5 border rounded-xl text-xs font-bold transition-all shadow-2xs ${
                rangePreset === "custom"
                  ? "bg-yellow/10 border-yellow text-yellow"
                  : "bg-surface-1 border-border text-text-primary hover:bg-surface-3"
              }`}
              title="Click to select custom date range"
            >
              <Calendar size={14} className={rangePreset === "custom" ? "text-yellow" : "text-text-muted"} />
              <span>{dateRangeDisplay}</span>
              {rangePreset === "custom" && (
                <span className="ml-1 text-[10px] px-1.5 py-0.5 rounded bg-yellow text-[var(--on-yellow)] font-extrabold uppercase">
                  Custom
                </span>
              )}
            </button>

            {/* Custom Date Range Picker Popover */}
            {showDatePicker && (
              <div className="absolute top-full left-0 mt-2 z-50 p-4 bg-surface-1 border border-border rounded-2xl shadow-xl w-72 space-y-3 animate-in fade-in zoom-in-95 duration-150">
                <div className="flex items-center justify-between pb-2 border-b border-border">
                  <span className="text-xs font-extrabold text-text-primary">Select Custom Range</span>
                  <button
                    onClick={() => setShowDatePicker(false)}
                    className="p-1 rounded-lg text-text-muted hover:text-text-primary hover:bg-surface-2"
                  >
                    <X size={14} />
                  </button>
                </div>
                <div className="space-y-2">
                  <div>
                    <label className="text-[11px] font-bold text-text-muted block mb-1">From Date</label>
                    <input
                      type="date"
                      value={tempFrom}
                      onChange={(e) => setTempFrom(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs font-semibold bg-surface-2 border border-border rounded-xl text-text-primary outline-none focus:border-yellow"
                    />
                  </div>
                  <div>
                    <label className="text-[11px] font-bold text-text-muted block mb-1">To Date</label>
                    <input
                      type="date"
                      value={tempTo}
                      onChange={(e) => setTempTo(e.target.value)}
                      className="w-full h-8 px-2.5 text-xs font-semibold bg-surface-2 border border-border rounded-xl text-text-primary outline-none focus:border-yellow"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border">
                  <BtnSecondary onClick={() => setShowDatePicker(false)} className="h-7 text-xs px-2.5 font-bold">
                    Cancel
                  </BtnSecondary>
                  <BtnPrimary onClick={handleApplyCustom} className="h-7 text-xs px-3 font-bold">
                    <Check size={13} /> Apply
                  </BtnPrimary>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Compare Dropdown */}
        <div className="flex items-center gap-2">
          <div className="inline-flex items-center h-9 bg-surface-1 border border-border rounded-xl overflow-hidden shadow-2xs px-2.5">
            <ArrowRightLeft size={13} className="text-text-muted mr-1.5" />
            <span className="text-[11px] font-bold text-text-muted uppercase mr-2 tracking-wider">
              Compare:
            </span>
            <select
              value={compareMode}
              onChange={(e) => onCompareChange(e.target.value)}
              className="text-xs font-bold text-text-primary bg-surface-1 outline-none cursor-pointer pr-1"
            >
              <option value="none" className="bg-surface-1 text-text-primary">No comparison</option>
              <option value="prev" className="bg-surface-1 text-text-primary">vs Previous period</option>
              <option value="year" className="bg-surface-1 text-text-primary">vs Same period last year</option>
            </select>
          </div>
        </div>
      </div>
    </div>
  );
}
