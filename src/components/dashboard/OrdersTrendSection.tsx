"use client";

import { useMemo } from "react";
import Link from "next/link";
import { formatCurrency, cn } from "@/lib/utils";
import { StatusDot } from "@/components/ui/shared";
import { ArrowRight, Flame, Clock } from "lucide-react";
import { format } from "date-fns";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface HourlyBucket {
  hour: number;
  count: number;
  revenue?: number;
}

export interface RecentOrderRow {
  id: string;
  number: string;
  status: string;
  total: number;
  tableLabel: string | null;
  source: string;
  createdAt: string;
}

interface OrdersTrendSectionProps {
  hourlyBuckets: HourlyBucket[];
  recentOrders: RecentOrderRow[];
  loading?: boolean;
}

const SOURCE_LABELS: Record<string, string> = {
  dine_in: "Dine-In",
  takeaway: "Takeaway",
  swiggy: "Swiggy",
  zomato: "Zomato",
  qr: "QR Order",
  counter: "Counter",
};

export function OrdersTrendSection({
  hourlyBuckets,
  recentOrders,
  loading = false,
}: OrdersTrendSectionProps) {
  // Operating hours (11 AM to 11 PM)
  const chartData = useMemo(() => {
    return hourlyBuckets.filter((b) => b.hour >= 11 && b.hour <= 23);
  }, [hourlyBuckets]);

  // Compute peak hour string
  const peakHourStr = useMemo(() => {
    if (chartData.length === 0) return "11 AM–12 PM";
    const peak = [...chartData].sort((a, b) => b.count - a.count)[0];
    if (!peak || peak.count === 0) return "11 AM–12 PM";
    const h = peak.hour;
    const endH = (h + 1) % 24;
    return `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}–${endH % 12 || 12} ${endH >= 12 ? "PM" : "AM"}`;
  }, [chartData]);

  return (
    <div className="mb-6 space-y-2">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">
        Orders &amp; Activity
      </div>

      {/* 70/30 Desktop Layout: 8 columns Chart + 4 columns Recent Orders Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* LEFT 8 COLS: ORDERS PER HOUR VISUALIZATION */}
        <div className="lg:col-span-8 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-4 flex flex-col justify-between">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/40 pb-3">
            <div>
              <h3 className="font-bold text-base text-black flex items-center gap-2">
                <Clock size={18} className="text-yellow-hover" />
                <span>Orders per Hour</span>
              </h3>
              <p className="text-xs text-muted font-medium mt-0.5">
                Today's order activity across operating hours
              </p>
            </div>

            <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-cream border border-border text-xs font-bold text-black shadow-2xs">
              <Flame size={14} className="text-yellow-hover" />
              <span>Peak period · {peakHourStr}</span>
            </div>
          </div>

          {/* Compact visual chart surface without dead space */}
          <div className="h-[220px] w-full pt-1">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 12, right: 12, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="dashOrdersGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#F4B315" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#F4B315" stopOpacity={0.0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" vertical={false} />
                <XAxis
                  dataKey="hour"
                  tickFormatter={(h) => `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`}
                  tick={{ fontSize: 11, fill: "#8B7355" }}
                  dy={4}
                />
                <YAxis
                  allowDecimals={false}
                  domain={[0, 12]}
                  ticks={[0, 3, 6, 9, 12]}
                  tick={{ fontSize: 11, fill: "#8B7355" }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: "#1A141A",
                    borderRadius: "12px",
                    border: "none",
                    color: "#fff",
                    fontSize: "12px",
                    boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                  }}
                  formatter={(val: any, name: any, item: any) => [
                    `${val} orders (${formatCurrency(item.payload.revenue || val * 850)})`,
                    "Orders",
                  ]}
                  labelFormatter={(h) => `${h % 12 || 12}:00 ${h >= 12 ? "PM" : "AM"}`}
                />
                <Area
                  type="monotone"
                  dataKey="count"
                  stroke="#F4B315"
                  strokeWidth={3}
                  fillOpacity={1}
                  fill="url(#dashOrdersGrad)"
                  dot={{ r: 3.5, fill: "#F4B315", stroke: "#1A141A", strokeWidth: 1.5 }}
                  activeDot={{ r: 6, fill: "#F4B315", stroke: "#1A141A", strokeWidth: 2 }}
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* RIGHT 4 COLS: RECENT ORDERS LIVE FEED */}
        <div className="lg:col-span-4 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-3 flex flex-col">
          <div className="flex items-center justify-between border-b border-border/40 pb-3">
            <h3 className="font-bold text-base text-black">Recent Orders</h3>
            <Link
              href="/orders"
              className="text-xs font-bold text-black hover:text-yellow-hover flex items-center gap-1 transition-colors"
            >
              <span>View all</span>
              <ArrowRight size={13} />
            </Link>
          </div>

          <div className="flex-1 divide-y divide-border/50 overflow-y-auto scrollbar-thin max-h-[250px]">
            {recentOrders.map((o) => (
              <Link
                key={o.id}
                href={`/orders?open=${o.id}`}
                className="group flex items-start justify-between py-2.5 px-1 hover:bg-cream/40 rounded-xl transition-all focus-ring"
              >
                <div className="space-y-0.5 min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-xs text-black group-hover:text-yellow-hover transition-colors">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow shrink-0" />
                    <span className="truncate">{o.number}</span>
                  </div>
                  <div className="text-[11px] text-muted font-medium pl-3">
                    {SOURCE_LABELS[o.source] ?? o.tableLabel ?? o.source} · {format(new Date(o.createdAt), "HH:mm")}
                  </div>
                </div>

                <div className="text-right shrink-0 space-y-1">
                  <div className="font-extrabold text-xs text-black tabular-nums">
                    {formatCurrency(o.total)}
                  </div>
                  <StatusDot status={o.status} />
                </div>
              </Link>
            ))}

            {recentOrders.length === 0 && (
              <div className="py-12 text-center text-xs font-semibold text-muted">
                No recent orders placed yet.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
