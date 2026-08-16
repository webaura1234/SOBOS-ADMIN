"use client";

import Link from "next/link";
import { LowStockItem } from "./LiveOperationsWatch";
import { Calendar, Users, Package, CheckSquare, ArrowRight, ShieldCheck } from "lucide-react";
import { cn } from "@/lib/utils";

interface PreServicePrepPanelProps {
  lowStock: LowStockItem[];
  multiBranch?: boolean;
}

export function PreServicePrepPanel({ lowStock, multiBranch = false }: PreServicePrepPanelProps) {
  const reservations = [
    { time: "12:30 PM", name: "Sharma Party", guests: 6, table: "T-04" },
    { time: "01:15 PM", name: "Dr. Kapoor", guests: 4, table: "T-08" },
    { time: "02:00 PM", name: "Corporate Lunch", guests: 8, table: "T-12" },
    { time: "07:30 PM", name: "Mehta VIP", guests: 4, table: "T-01" },
  ];

  const staffScheduled = [
    { role: "Kitchen Lead", name: "Chef Ramesh", status: "On Duty" },
    { role: "Sous Chef", name: "Anil Kumar", status: "On Duty" },
    { role: "Floor Manager", name: "Priya S.", status: "On Duty" },
    { role: "Service Staff", name: "4 Servers", status: "Scheduled 11:30" },
  ];

  const prepChecklist = [
    { label: "POS Terminals & KDS Synced", done: true },
    { label: "Thermal Receipt Printers Ready", done: true },
    { label: "Low-Stock Ingredients Reordered", done: lowStock.length === 0 },
    { label: "Table Sanitation & Tableware Prepped", done: true },
  ];

  return (
    <div className="grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch mb-7">
      {/* 1. Reservations & Expected Covers (5 cols) */}
      <section className="xl:col-span-5 rounded-[14px] border border-border bg-surface-1 p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-[16px] font-semibold text-text-primary flex items-center gap-2">
              <Calendar size={17} className="text-yellow" />
              Booked Reservations
            </h2>
            <span className="text-[12px] font-semibold text-text-secondary bg-surface-2 px-2.5 py-0.5 rounded-full border border-border">
              42 expected covers
            </span>
          </div>

          <div className="space-y-2.5">
            {reservations.map((res, i) => (
              <div
                key={i}
                className="flex items-center justify-between gap-3 p-2.5 rounded-[10px] bg-surface-2/60 border border-border/50 text-[13px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span className="font-semibold text-yellow tabular-nums text-[12px] px-2 py-0.5 rounded bg-yellow-surface border border-border-yellow shrink-0">
                    {res.time}
                  </span>
                  <span className="font-semibold text-text-primary truncate">{res.name}</span>
                </div>
                <div className="flex items-center gap-2 text-[12px] text-text-muted shrink-0">
                  <span>{res.guests} guests</span>
                  <span>·</span>
                  <span className="text-text-secondary font-medium">{res.table}</span>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/70 flex items-center justify-between text-[12px]">
          <span className="text-text-muted">Lunch Service: 12:00 – 15:30</span>
          <Link
            href="/tables"
            className="inline-flex items-center gap-1 font-semibold text-text-secondary hover:text-yellow transition-colors"
          >
            Floor plan <ArrowRight size={13} />
          </Link>
        </div>
      </section>

      {/* 2. Low-Stock Reorder Alerts (4 cols) */}
      <section className="xl:col-span-4 rounded-[14px] border border-border bg-surface-1 p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-[16px] font-semibold text-text-primary flex items-center gap-2">
              <Package size={17} className="text-warning" />
              Low-Stock Prep Reorder
            </h2>
            <Link href="/inventory?filter=low" className="text-[12px] text-text-secondary hover:text-yellow">
              View all ({lowStock.length})
            </Link>
          </div>

          <div className="space-y-2.5">
            {lowStock.slice(0, 3).map((item) => {
              const isCritical = item.quantity <= item.threshold / 2;
              return (
                <div key={item.id} className="p-2.5 rounded-[10px] bg-surface-2/60 border border-border/50">
                  <div className="flex items-baseline justify-between text-[13px]">
                    <span className="font-semibold text-text-primary truncate">
                      {item.name}
                      {multiBranch && item.branch && (
                        <span className="ml-1 text-[11px] text-text-muted">({item.branch})</span>
                      )}
                    </span>
                    <span
                      className={cn(
                        "text-[11px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border",
                        isCritical
                          ? "text-critical border-[var(--border-critical)] bg-[var(--critical-surface)]"
                          : "text-warning border-[var(--border-warning)] bg-[var(--warning-surface)]"
                      )}
                    >
                      {item.quantity} {item.unit} left
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-text-muted">
                    Threshold: {item.threshold} {item.unit} · Needs reorder before service
                  </div>
                </div>
              );
            })}

            {lowStock.length === 0 && (
              <div className="py-8 text-center text-[13px] text-text-muted flex flex-col items-center gap-2">
                <ShieldCheck size={24} className="text-success" />
                All stock levels healthy for shift start
              </div>
            )}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/70 text-[12px] text-text-muted flex items-center justify-between">
          <span>Inventory check complete</span>
          <Link href="/inventory" className="font-semibold text-text-secondary hover:text-yellow">
            Reorder items →
          </Link>
        </div>
      </section>

      {/* 3. Shift Roster & Kitchen Readiness (3 cols) */}
      <section className="xl:col-span-3 rounded-[14px] border border-border bg-surface-1 p-5 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between gap-3 mb-4">
            <h2 className="text-[16px] font-semibold text-text-primary flex items-center gap-2">
              <Users size={17} className="text-info" />
              Staff Scheduled
            </h2>
          </div>

          <div className="space-y-2 mb-4">
            {staffScheduled.map((s, i) => (
              <div key={i} className="flex items-center justify-between text-[12px]">
                <span className="text-text-muted">{s.role}</span>
                <span className="font-medium text-text-primary">{s.name}</span>
              </div>
            ))}
          </div>

          <h3 className="text-[12px] font-semibold uppercase tracking-wider text-text-muted mb-2 flex items-center gap-1.5 border-t border-border/60 pt-3">
            <CheckSquare size={14} className="text-success" /> Pre-Service Readiness
          </h3>
          <div className="space-y-1.5 text-[12px]">
            {prepChecklist.map((c, i) => (
              <div key={i} className="flex items-center gap-2 text-text-secondary">
                <span className={cn("w-2 h-2 rounded-full", c.done ? "bg-success" : "bg-warning")} />
                <span>{c.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-4 pt-3 border-t border-border/70 text-[12px] text-text-muted">
          Shift readiness: <span className="text-success font-semibold">100% Ready</span>
        </div>
      </section>
    </div>
  );
}
