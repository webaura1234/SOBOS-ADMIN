"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch, useToast } from "@/lib/toast";
import { useApp } from "@/lib/context";
import { useInterval } from "@/lib/use-interval";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { QuickActionsToolbar } from "@/components/dashboard/QuickActionsToolbar";
import { TodaysHighlights } from "@/components/dashboard/TodaysHighlights";
import { PerformanceSummaryRow } from "@/components/dashboard/PerformanceSummaryRow";
import { OrdersTrendSection, type HourlyBucket, type RecentOrderRow } from "@/components/dashboard/OrdersTrendSection";
import { NeedsAttentionPanel, type AlertItem } from "@/components/dashboard/NeedsAttentionPanel";
import { LiveOperationsWatch, type LowStockItem } from "@/components/dashboard/LiveOperationsWatch";

interface DashboardData {
  kpis: {
    ordersToday: number;
    revenueToday: number;
    revenueTarget?: number;
    avgTicket: number;
    hourDelta: number;
    pendingOrders: number;
    occupiedTables: number;
    lowStockCount: number;
  };
  hourlyBuckets: HourlyBucket[];
  alerts: AlertItem[];
  lowStock: LowStockItem[];
  recentOrders: RecentOrderRow[];
  sparklines: { orders: number[]; revenue: number[] };
}

export default function DashboardPage() {
  const { toast } = useToast();
  const { locationId } = useApp();

  const [data, setData] = useState<DashboardData | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = locationId ? `?locationId=${locationId}` : "";
      const result = await apiFetch<DashboardData>(`/api/dashboard${params}`);
      setData(result);
      setLastRefresh(new Date());
    } catch (e: any) {
      toast(e.message || "Failed to load dashboard", "error");
    } finally {
      setLoading(false);
    }
  }, [locationId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  // Poll every 60 seconds for live updates
  useInterval(() => {
    load();
  }, 60000);

  const handleDismissAlert = async (id: string) => {
    try {
      await apiFetch("/api/dashboard", {
        method: "PATCH",
        body: JSON.stringify({ id, isRead: true }),
      });
      load();
    } catch (e: any) {
      toast(e.message || "Failed to dismiss alert", "error");
    }
  };

  // Skeleton loading state
  if (!data && loading) {
    return (
      <div className="p-4 sm:p-6 max-w-[1600px] mx-auto space-y-6 animate-pulse">
        <div className="h-10 bg-cream/60 rounded-xl w-64" />
        <div className="h-12 bg-cream/60 rounded-xl w-full" />
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="h-28 bg-cream/60 rounded-2xl" />
          ))}
        </div>
        <div className="h-64 bg-cream/60 rounded-2xl w-full" />
      </div>
    );
  }

  const { kpis, hourlyBuckets, alerts, lowStock, recentOrders } = data || {
    kpis: { ordersToday: 0, revenueToday: 0, revenueTarget: 60000, avgTicket: 0, hourDelta: 0, pendingOrders: 0, occupiedTables: 0, lowStockCount: 0 },
    hourlyBuckets: [],
    alerts: [],
    lowStock: [],
    recentOrders: [],
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* SECTION 1 — Top Header & Today's Pulse */}
      <DashboardHeader
        lastRefresh={lastRefresh}
        onRefresh={load}
        loading={loading}
        revenueToday={kpis.revenueToday}
        revenueTarget={kpis.revenueTarget ?? 60000}
        pendingOrders={kpis.pendingOrders}
        occupiedTables={kpis.occupiedTables}
      />

      {/* SECTION 2 — Quick Actions + Today's Highlights (Side-by-Side) */}
      <div className="mb-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
        <div className="lg:col-span-6">
          <QuickActionsToolbar />
        </div>
        <div className="lg:col-span-6">
          <TodaysHighlights
            peakPeriod="11 AM – 12 PM"
            revenueVsYesterday="+12.1%"
            operationsStatus="All Clear"
          />
        </div>
      </div>

      {/* SECTION 2 — Today's Performance Summary Row */}
      <PerformanceSummaryRow
        ordersToday={kpis.ordersToday}
        revenueToday={kpis.revenueToday}
        revenueTarget={kpis.revenueTarget ?? 60000}
        avgTicket={kpis.avgTicket}
        pendingOrders={kpis.pendingOrders}
        hourDelta={kpis.hourDelta}
      />

      {/* SECTION 4 — Orders per Hour Chart + Recent Orders (70/30 Split) */}
      <OrdersTrendSection
        hourlyBuckets={hourlyBuckets}
        recentOrders={recentOrders}
        loading={loading}
      />

      {/* SECTION 5 — Needs Attention Panel */}
      <NeedsAttentionPanel
        alerts={alerts}
        onDismiss={handleDismissAlert}
      />

      {/* SECTION 6 — Live Operations + Low Stock Watch (5/7 Split) */}
      <LiveOperationsWatch
        pendingOrders={kpis.pendingOrders}
        occupiedTables={kpis.occupiedTables}
        lowStock={lowStock}
      />
    </div>
  );
}
