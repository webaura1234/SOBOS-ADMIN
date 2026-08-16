"use client";

import { useEffect, useState, useCallback } from "react";
import { apiFetch, useToast } from "@/lib/toast";
import { useApp } from "@/lib/context";
import { useInterval } from "@/lib/use-interval";
import { DashboardHeader } from "@/components/dashboard/DashboardHeader";
import { PerformanceSummaryRow } from "@/components/dashboard/PerformanceSummaryRow";
import { OrdersChartCard, RecentOrdersCard, type HourlyBucket, type RecentOrderRow } from "@/components/dashboard/OrdersTrendSection";
import { NeedsAttentionPanel, type AttentionItem, type AlertItem } from "@/components/dashboard/NeedsAttentionPanel";
import { RestaurantPulse, type StatusBreakdown } from "@/components/dashboard/RestaurantPulse";
import { LiveOperationsWatch, type LowStockItem } from "@/components/dashboard/LiveOperationsWatch";
import { PreServicePrepPanel } from "@/components/dashboard/PreServicePrepPanel";
import { CheckCircle2, AlertTriangle } from "lucide-react";

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
    delayedOrders: number;
    longestWait: number;
    staleOrders: number;
  };
  multiBranch: boolean;
  statusBreakdown: StatusBreakdown;
  attention: AttentionItem[];
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
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = locationId ? `?locationId=${locationId}` : "";
      const result = await apiFetch<DashboardData>(`/api/dashboard${params}`);
      setData(result);
      setError(null);
      setLastRefresh(new Date());
    } catch (e: any) {
      setError(e.message || "Failed to load dashboard");
    } finally {
      setLoading(false);
    }
  }, [locationId, toast]);

  useEffect(() => {
    load();
  }, [load]);

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

  const initialLoading = !data && loading;

  const {
    kpis, multiBranch, statusBreakdown, attention, hourlyBuckets, lowStock, recentOrders,
  } = data || {
    kpis: { ordersToday: 0, revenueToday: 0, revenueTarget: 60000, avgTicket: 0, hourDelta: 0, pendingOrders: 0, occupiedTables: 0, lowStockCount: 0, delayedOrders: 0, longestWait: 0, staleOrders: 0 },
    multiBranch: false,
    statusBreakdown: { pending: 0, preparing: 0, ready: 0 },
    attention: [],
    hourlyBuckets: [],
    alerts: [],
    lowStock: [],
    recentOrders: [],
    sparklines: { orders: [], revenue: [] },
  };

  const openAttention = attention ?? [];
  const healthy = !initialLoading && openAttention.length === 0;
  const isPreService = !initialLoading && kpis.ordersToday === 0;

  const peakPeriod = (() => {
    if (kpis.ordersToday === 0) return undefined;
    const day = (hourlyBuckets ?? []).filter((b) => b.hour >= 11 && b.hour <= 23);
    if (day.length === 0) return undefined;
    const peak = [...day].sort((a, b) => b.count - a.count)[0];
    if (!peak || peak.count === 0) return undefined;
    const fmt = (h: number) => `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`;
    return `${fmt(peak.hour)}–${fmt((peak.hour + 1) % 24)}`;
  })();

  if (error && !data) {
    return (
      <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
        <DashboardHeader lastRefresh={lastRefresh} onRefresh={load} loading={loading} />
        <div className="rounded-[14px] border border-[var(--border-critical)] bg-surface-1 p-8 text-center" style={{ backgroundImage: "var(--glow-critical)" }}>
          <AlertTriangle size={22} className="text-critical mx-auto mb-3" />
          <p className="text-[16px] font-semibold text-text-primary">Could not load the dashboard</p>
          <p className="text-[13px] text-text-muted mt-1">{error}</p>
          <button
            type="button"
            onClick={load}
            className="mt-4 inline-flex items-center gap-2 px-4 py-2 rounded-[10px] bg-yellow text-[var(--on-yellow)] text-[14px] font-semibold hover:bg-yellow-hover transition-colors focus-ring"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      <DashboardHeader lastRefresh={lastRefresh} onRefresh={load} loading={loading} />

      {/* ZONE 1 — TODAY (subtle background band) */}
      <PerformanceSummaryRow
        ordersToday={kpis.ordersToday}
        revenueToday={kpis.revenueToday}
        revenueTarget={kpis.revenueTarget ?? 60000}
        avgTicket={kpis.avgTicket}
        pendingOrders={kpis.pendingOrders}
        occupiedTables={kpis.occupiedTables}
        hourDelta={kpis.hourDelta}
        peakPeriod={peakPeriod}
        loading={initialLoading}
        preService={isPreService}
      />

      {/* Healthy state is a single line, never a permanent green card */}
      {healthy && (
        <p className="-mt-4 mb-7 flex items-center gap-2 text-[14px] text-success">
          <CheckCircle2 size={16} aria-hidden="true" />
          All clear · nothing needs attention
        </p>
      )}

      {/* ZONE 2 — LIVE (the hero) */}
      <div className={`mb-7 grid grid-cols-1 gap-4 items-stretch ${healthy ? "" : "xl:grid-cols-2"}`}>
        <RestaurantPulse
          statusBreakdown={statusBreakdown ?? { pending: 0, preparing: 0, ready: 0 }}
          longestWait={kpis.longestWait ?? 0}
          delayedOrders={kpis.delayedOrders ?? 0}
          activeOrders={kpis.pendingOrders ?? 0}
          loading={initialLoading}
        />
        {!healthy && (
          <NeedsAttentionPanel
            attention={openAttention}
            onDismiss={handleDismissAlert}
            loading={initialLoading}
          />
        )}
      </div>

      {/* ZONE 3 — CONTEXT OR PREP PANEL */}
      {isPreService ? (
        <PreServicePrepPanel lowStock={lowStock} multiBranch={multiBranch ?? false} />
      ) : (
        <div className="mb-7 grid grid-cols-1 xl:grid-cols-12 gap-4 items-stretch">
          <div className="xl:col-span-5">
            <OrdersChartCard hourlyBuckets={hourlyBuckets} loading={initialLoading} />
          </div>
          <div className="xl:col-span-4">
            <RecentOrdersCard recentOrders={recentOrders} loading={initialLoading} />
          </div>
          <div className="xl:col-span-3">
            <LiveOperationsWatch lowStock={lowStock} multiBranch={multiBranch ?? false} loading={initialLoading} />
          </div>
        </div>
      )}
    </div>
  );
}
