"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { Package, ArrowRight, Activity, CheckCircle2 } from "lucide-react";

export interface LowStockItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  threshold: number;
}

interface LiveOperationsWatchProps {
  pendingOrders: number;
  occupiedTables: number;
  lowStock: LowStockItem[];
}

export function LiveOperationsWatch({
  pendingOrders,
  occupiedTables,
  lowStock,
}: LiveOperationsWatchProps) {
  return (
    <div className="mb-6 space-y-2">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">
        Operations &amp; Stock Health
      </div>

      {/* Controlled Asymmetry Grid: 5 cols Restaurant Pulse + 7 cols Stock Health */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* LEFT 5 COLS: RESTAURANT PULSE SIGNATURE COMPONENT */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-black flex items-center gap-2 tracking-tight">
                  <Activity size={18} className="text-yellow-hover" />
                  <span>RESTAURANT PULSE</span>
                </h3>
                <p className="text-xs text-muted font-medium mt-0.5">
                  Real-time operational status across kitchen and floor
                </p>
              </div>

              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-yellow/20 text-black text-[11px] font-extrabold border border-yellow/40 shrink-0">
                <span className="w-1.5 h-1.5 rounded-full bg-yellow animate-pulse" />
                LIVE
              </span>
            </div>

            {/* Compact Metric Blocks with Subtle Dividers */}
            <div className="grid grid-cols-3 gap-2 text-center p-3 rounded-xl bg-cream/30 border border-border/50">
              <div className="space-y-1">
                <div className="text-2xl font-black text-black tabular-nums">
                  {pendingOrders}
                </div>
                <div className="text-[10px] font-extrabold text-muted uppercase tracking-wider">
                  ACTIVE ORDERS
                </div>
                <div className="h-1 rounded-full bg-yellow/40 w-8 mx-auto mt-1" />
              </div>

              <div className="space-y-1 border-x border-border/40 px-1">
                <div className="text-2xl font-black text-black tabular-nums">
                  {occupiedTables}
                </div>
                <div className="text-[10px] font-extrabold text-muted uppercase tracking-wider">
                  TABLES
                </div>
                <div className="h-1 rounded-full bg-yellow/40 w-8 mx-auto mt-1" />
              </div>

              <div className="space-y-1">
                <div className="text-2xl font-black text-black flex items-center justify-center">
                  <CheckCircle2 size={22} className="text-black" />
                </div>
                <div className="text-[10px] font-extrabold text-black uppercase tracking-wider">
                  KITCHEN
                </div>
                <div className="h-1 rounded-full bg-yellow w-8 mx-auto mt-1" />
              </div>
            </div>

            <div className="text-xs font-bold text-black flex items-center gap-1.5 pt-0.5">
              <span className="w-2 h-2 rounded-full bg-yellow animate-pulse" />
              <span>Kitchen operating normally</span>
            </div>
          </div>

          <div className="pt-3 border-t border-border/40 flex items-center justify-between">
            <Link
              href="/orders"
              className="text-xs font-extrabold text-black hover:text-yellow-hover flex items-center gap-1 transition-colors group"
            >
              <span>View live orders</span>
              <ArrowRight size={13} className="group-hover:translate-x-0.5 transition-transform" />
            </Link>
            <span className="text-[11px] font-bold text-muted">Updated real-time</span>
          </div>
        </div>

        {/* RIGHT 7 COLS: STOCK HEALTH VISUALIZATION */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs flex flex-col justify-between space-y-4">
          <div className="space-y-3.5">
            <div className="flex items-center justify-between border-b border-border/40 pb-3">
              <div>
                <h3 className="font-extrabold text-base text-black flex items-center gap-2 tracking-tight">
                  <Package size={18} className="text-sand-dark" />
                  <span>STOCK HEALTH</span>
                </h3>
                <p className="text-xs text-muted font-medium mt-0.5">
                  Current ingredient quantity vs reorder threshold
                </p>
              </div>

              <Link
                href="/inventory?filter=low"
                className="text-xs font-extrabold text-black hover:text-yellow-hover flex items-center gap-1 transition-colors shrink-0"
              >
                <span>Manage inventory →</span>
              </Link>
            </div>

            <div className="space-y-3 pt-0.5">
              {lowStock.map((item) => {
                const isCritical = item.quantity <= item.threshold / 2;
                const pct = Math.min(100, Math.max(12, (item.quantity / (item.threshold * 1.5)) * 100));

                return (
                  <div key={item.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs font-bold text-black">
                      <span>{item.name}</span>
                      <div className="flex items-center gap-2 font-semibold text-xs text-black tabular-nums">
                        <span>
                          {item.quantity} / {item.threshold} {item.unit}
                        </span>
                        <span
                          className={cn(
                            "px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-wider",
                            isCritical
                              ? "bg-red-100 text-red-700 border border-red-200"
                              : "bg-amber-100 text-amber-800 border border-amber-200"
                          )}
                        >
                          {isCritical ? "CRITICAL" : "LOW"}
                        </span>
                      </div>
                    </div>

                    {/* Horizontal Health Progress Bar */}
                    <div className="h-1.5 rounded-full bg-cream border border-border/50 overflow-hidden">
                      <div
                        className={cn(
                          "h-full rounded-full transition-all duration-500",
                          isCritical ? "bg-red-600" : "bg-yellow"
                        )}
                        style={{ width: `${pct}%` }}
                      />
                    </div>
                  </div>
                );
              })}

              {lowStock.length === 0 && (
                <div className="py-6 text-center text-xs font-semibold text-sand-dark">
                  ✓ All inventory items have healthy stock levels.
                </div>
              )}
            </div>
          </div>

          <div className="pt-2 border-t border-border/40 text-[11px] font-medium text-muted text-right">
            Auto-synced with inventory database
          </div>
        </div>
      </div>
    </div>
  );
}
