"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { KPICard } from "@/components/ui/kpi-card";
import { StatusDot, StatCards } from "@/components/ui/shared";
import { formatCurrency } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { useApp } from "@/lib/context";
import { useInterval } from "@/lib/use-interval";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip } from "recharts";
import { ChartContainer } from "@/components/ui/chart-container";
import { format } from "date-fns";
import {
  Receipt, LayoutGrid, Package, Plus, Users, ArrowRight, RefreshCw,
} from "lucide-react";

interface DashboardData {
  kpis: {
    ordersToday: number;
    revenueToday: number;
    avgTicket: number;
    hourDelta: number;
    pendingOrders: number;
    occupiedTables: number;
    lowStockCount: number;
  };
  hourlyBuckets: { hour: number; count: number }[];
  alerts: { id: string; title: string; message: string; severity: string; isRead: boolean }[];
  lowStock: { id: string; name: string; quantity: number; unit: string; threshold: number }[];
  recentOrders: {
    id: string; number: string; status: string; total: number;
    tableLabel: string | null; source: string; createdAt: string;
  }[];
  sparklines: { orders: number[]; revenue: number[] };
}

const QUICK_LINKS = [
  { href: "/menu?action=create", label: "New menu item", icon: Plus },
  { href: "/orders", label: "Live orders", icon: Receipt },
  { href: "/tables", label: "Floor plan", icon: LayoutGrid },
  { href: "/staff?action=invite", label: "Invite staff", icon: Users },
];

export default function DashboardPage() {
  const { toast } = useToast();
  const { locationId } = useApp();
  const [data, setData] = useState<DashboardData | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date | null>(null);

  const load = useCallback(async () => {
    const params = locationId ? `?locationId=${locationId}` : "";
    setData(await apiFetch(`/api/dashboard${params}`));
    setLastRefresh(new Date());
  }, [locationId]);

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [load, toast]);
  useInterval(() => { load().catch(() => {}); }, 60000);

  const dismissAlert = async (id: string) => {
    try {
      await apiFetch("/api/dashboard", { method: "PATCH", body: JSON.stringify({ id, isRead: true }) });
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  if (!data) return <div className="animate-pulse h-32 bg-cream rounded-xl" />;
  const { kpis, hourlyBuckets, alerts, sparklines, lowStock, recentOrders } = data;
  const chartData = hourlyBuckets.filter((b) => b.hour >= 11 && b.hour <= 23);
  const unreadAlerts = alerts.filter((a) => !a.isRead);

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold text-black">Dashboard</h1>
          <span className="text-muted font-medium">· Today · Live</span>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted font-medium">
          {lastRefresh && <span>Updated {format(lastRefresh, "HH:mm")}</span>}
          <button type="button" onClick={() => load()} className="inline-flex items-center gap-1.5 h-9 px-3 rounded-xl border-2 border-border bg-white font-bold text-black hover:bg-cream focus-ring">
            <RefreshCw size={16} /> Refresh
          </button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
        {QUICK_LINKS.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className="flex items-center gap-3 p-4 rounded-xl border-2 border-border bg-white hover:border-primary hover:bg-primary/5 transition-colors focus-ring"
          >
            <link.icon size={20} className="text-black shrink-0" />
            <span className="font-bold text-sm text-black">{link.label}</span>
          </Link>
        ))}
      </div>

      <StatCards
        stats={[
          { label: "Active orders", value: kpis.pendingOrders, tone: kpis.pendingOrders > 0 ? "warning" : "default", onClick: () => window.location.assign("/orders") },
          { label: "Tables occupied", value: kpis.occupiedTables, tone: "default", onClick: () => window.location.assign("/tables") },
          { label: "Low stock items", value: kpis.lowStockCount, tone: kpis.lowStockCount > 0 ? "danger" : "success", onClick: () => window.location.assign("/inventory?filter=low") },
          { label: "Revenue today", value: formatCurrency(kpis.revenueToday), tone: "active" },
        ]}
      />

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        <KPICard label="Orders Today" value={kpis.ordersToday} sparkline={sparklines.orders} onClick={() => window.location.assign("/orders")} />
        <KPICard label="Revenue Today" value={formatCurrency(kpis.revenueToday)} sparkline={sparklines.revenue} />
        <KPICard label="Avg Ticket" value={formatCurrency(kpis.avgTicket)} />
        <KPICard label="This hour vs last week" value={`${kpis.hourDelta >= 0 ? "▲" : "▼"} ${Math.abs(kpis.hourDelta)}%`} delta={kpis.hourDelta} deltaLabel="same hour" />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 bg-white border-2 border-border rounded-xl p-5">
          <h2 className="font-bold mb-4">Orders per Hour</h2>
          <ChartContainer height={192}>
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="hour" tickFormatter={(h) => `${h}:00`} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="count" stroke="#F4B315" strokeWidth={3} dot={false} />
            </LineChart>
          </ChartContainer>
        </div>

        <div className="bg-white border-2 border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold">Recent Orders</h2>
            <Link href="/orders" className="text-sm font-bold text-muted hover:text-black inline-flex items-center gap-1">
              View all <ArrowRight size={14} />
            </Link>
          </div>
          <ul className="space-y-2">
            {recentOrders.map((o) => (
              <li key={o.id}>
                <Link href={`/orders?open=${o.id}`} className="flex items-center justify-between gap-2 p-3 rounded-xl border border-border hover:bg-cream focus-ring">
                  <div className="min-w-0">
                    <div className="font-bold text-black truncate">{o.number}</div>
                    <div className="text-xs text-muted font-medium">{o.tableLabel ?? o.source} · {format(new Date(o.createdAt), "HH:mm")}</div>
                  </div>
                  <div className="text-right shrink-0">
                    <StatusDot status={o.status} />
                    <div className="text-sm font-bold tabular-nums mt-1">{formatCurrency(o.total)}</div>
                  </div>
                </Link>
              </li>
            ))}
            {recentOrders.length === 0 && <p className="text-muted text-center py-6 font-medium">No orders yet</p>}
          </ul>
        </div>

        <div className="bg-white border-2 border-border rounded-xl p-5">
          <h2 className="font-bold mb-4">Live Alerts</h2>
          <ul className="space-y-2">
            {unreadAlerts.map((alert) => (
              <li key={alert.id} className="flex items-start justify-between gap-2 p-3 bg-cream rounded-xl">
                <div>
                  <div className="font-bold">{alert.title}</div>
                  <div className="text-sm text-muted">{alert.message}</div>
                </div>
                <button type="button" onClick={() => dismissAlert(alert.id)} className="text-xs font-bold px-2 py-1 bg-primary rounded-lg shrink-0">Dismiss</button>
              </li>
            ))}
          </ul>
          {unreadAlerts.length === 0 && <p className="text-muted font-medium text-center py-8">All clear!</p>}
        </div>

        <div className="lg:col-span-2 bg-white border-2 border-border rounded-xl p-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-bold inline-flex items-center gap-2">
              <Package size={18} /> Low Stock Watch
            </h2>
            <Link href="/inventory?filter=low" className="text-sm font-bold text-muted hover:text-black">Manage inventory →</Link>
          </div>
          {lowStock.length === 0 ? (
            <p className="text-muted font-medium text-center py-8">Stock levels look healthy</p>
          ) : (
            <ul className="grid sm:grid-cols-2 gap-2">
              {lowStock.map((item) => (
                <li key={item.id} className="flex items-center justify-between p-3 rounded-xl border-2 border-red-200 bg-red-50/50">
                  <span className="font-bold text-black">{item.name}</span>
                  <span className="text-sm font-bold text-red-700 tabular-nums">{item.quantity} {item.unit}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
