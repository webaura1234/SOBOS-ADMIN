"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { cn, formatCurrency } from "@/lib/utils";
import { ArrowRight } from "lucide-react";
import { format } from "date-fns";
import { ChartContainer } from "@/components/ui/chart-container";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ReferenceDot,
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

const SOURCE_LABELS: Record<string, string> = {
  dine_in: "Dine-In",
  takeaway: "Takeaway",
  swiggy: "Swiggy",
  zomato: "Zomato",
  qr: "QR Order",
  counter: "Counter",
};

const hourLabel = (h: number) => `${h % 12 || 12} ${h >= 12 ? "PM" : "AM"}`;

export function OrdersChartCard({
  hourlyBuckets,
  loading = false,
}: {
  hourlyBuckets: HourlyBucket[];
  loading?: boolean;
}) {
  const [metric, setMetric] = useState<"orders" | "revenue">("orders");

  const chartData = useMemo(
    () => hourlyBuckets.filter((b) => b.hour >= 11 && b.hour <= 23),
    [hourlyBuckets]
  );

  const peak = useMemo(() => {
    if (chartData.length === 0) return null;
    const key = metric === "orders" ? "count" : "revenue";
    const top = [...chartData].sort((a, b) => ((b as any)[key] ?? 0) - ((a as any)[key] ?? 0))[0];
    if (!top || (top as any)[key] === 0) return null;
    return top;
  }, [chartData, metric]);

  const insight = useMemo(() => {
    if (chartData.every((b) => b.count === 0)) {
      return "Pre-service state · No live orders recorded yet today.";
    }
    if (!peak || chartData.length === 0) return null;
    if (metric === "orders") {
      const total = chartData.reduce((s, b) => s + b.count, 0);
      const avg = total / chartData.length;
      return `Peak ${hourLabel(peak.hour)}–${hourLabel((peak.hour + 1) % 24)} · ${peak.count} orders · avg ${avg.toFixed(1)}/hr`;
    }
    const total = chartData.reduce((s, b) => s + (b.revenue ?? 0), 0);
    const share = total > 0 ? Math.round(((peak.revenue ?? 0) / total) * 100) : 0;
    return `Peak ${hourLabel(peak.hour)}–${hourLabel((peak.hour + 1) % 24)} · ${formatCurrency(peak.revenue ?? 0)} · ${share}% of today`;
  }, [peak, chartData, metric]);

  const dataKey = metric === "orders" ? "count" : "revenue";

  return (
    <section className="h-full rounded-[14px] border border-border bg-surface-1 flex flex-col overflow-hidden" aria-label="Order activity">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Order activity</h2>

        <div className="flex items-center gap-0.5 p-0.5 rounded-[10px] bg-surface-2 border border-border" role="tablist">
          {(["orders", "revenue"] as const).map((m) => (
            <button
              key={m}
              type="button"
              role="tab"
              aria-selected={metric === m}
              onClick={() => setMetric(m)}
              className={cn(
                "px-2.5 py-1 rounded-md text-[12px] font-semibold capitalize transition-colors focus-ring",
                metric === m
                  ? "bg-yellow text-[var(--on-yellow)]"
                  : "text-text-muted hover:text-text-primary"
              )}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="mx-4 mb-4 h-[165px] rounded-md bg-surface-3" />
      ) : (
        <div className="h-[165px] w-full px-2 min-w-0">
          <ChartContainer height={165}>
            <AreaChart data={chartData} margin={{ top: 8, right: 14, left: -12, bottom: 0 }}>
              <defs>
                <linearGradient id="sobosTrendFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#FED500" stopOpacity={0.18} />
                  <stop offset="100%" stopColor="#FED500" stopOpacity={0.00} />
                </linearGradient>
              </defs>

              {/* Three horizontal rules only */}
              <CartesianGrid stroke="#1F1F1F" vertical={false} horizontalPoints={undefined} strokeDasharray="0" />

              <XAxis
                dataKey="hour"
                ticks={[11, 14, 17, 20, 23]}
                tickFormatter={hourLabel}
                tick={{ fontSize: 12, fill: "#B8AA96" }}
                tickLine={false}
                axisLine={{ stroke: "#1F1F1F" }}
                dy={6}
              />
              <YAxis
                domain={metric === "orders" ? [0, 12] : undefined}
                ticks={metric === "orders" ? [0, 6, 12] : undefined}
                tick={{ fontSize: 12, fill: "#B8AA96" }}
                tickLine={false}
                axisLine={false}
                width={36}
                tickFormatter={(v) => (metric === "revenue" ? formatCurrency(v) : String(v))}
              />
              <Tooltip
                cursor={{ stroke: "#2A2A2A" }}
                contentStyle={{
                  backgroundColor: "#101010",
                  borderRadius: "10px",
                  border: "1px solid #2A2A2A",
                  color: "#F5F1E8",
                  fontSize: "13px",
                }}
                labelStyle={{ color: "#B8AA96" }}
                formatter={(val: any) => [
                  metric === "revenue" ? formatCurrency(Number(val)) : `${val} orders`,
                  metric === "revenue" ? "Revenue" : "Orders",
                ]}
                labelFormatter={(h) => hourLabel(Number(h))}
              />
              <Area
                type="monotone"
                dataKey={dataKey}
                stroke="#FED500"
                strokeWidth={2}
                fill="url(#sobosTrendFill)"
                dot={false}
                activeDot={{ r: 4, fill: "#FED500", stroke: "#0A0A0A", strokeWidth: 2 }}
                isAnimationActive={false}
              />
              {peak && (
                <ReferenceDot
                  x={peak.hour}
                  y={(peak as any)[dataKey] ?? 0}
                  r={4}
                  fill="#FED500"
                  stroke="#0A0A0A"
                  strokeWidth={2}
                  label={{ value: "Peak", position: "right", fill: "#B8AA96", fontSize: 11, dx: 4, dy: -2 }}
                />
              )}
            </AreaChart>
          </ChartContainer>
        </div>
      )}

      {insight && !loading && (
        <p className="px-4 py-3 text-[12px] leading-4 text-text-muted border-t border-border/70">
          {insight}
        </p>
      )}
    </section>
  );
}

/** Problems before routine work: cancelled → pending → preparing → ready → done. */
const STATUS_PRIORITY: Record<string, number> = {
  cancelled: 0,
  pending: 1,
  confirmed: 1,
  preparing: 2,
  ready: 3,
  served: 4,
  done: 4,
};

const STATUS_TONE: Record<string, string> = {
  cancelled: "var(--critical)",
  pending: "var(--warning)",
  confirmed: "var(--warning)",
  preparing: "var(--warning)",
  ready: "var(--success)",
  served: "var(--text-muted)",
  done: "var(--text-muted)",
};

export function RecentOrdersCard({
  recentOrders,
  loading = false,
}: {
  recentOrders: RecentOrderRow[];
  loading?: boolean;
}) {
  const sorted = useMemo(
    () =>
      [...recentOrders].sort((a, b) => {
        const rank = (s: string) => STATUS_PRIORITY[s] ?? 5;
        if (rank(a.status) !== rank(b.status)) return rank(a.status) - rank(b.status);
        // within a severity band, oldest first — it has been waiting longest
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }),
    [recentOrders]
  );

  return (
    <section className="h-full rounded-[14px] border border-border bg-surface-1 flex flex-col overflow-hidden" aria-label="Orders needing action">
      <div className="flex items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="text-[16px] font-semibold leading-6 text-text-primary">Recent Orders</h2>
        <Link
          href="/orders"
          className="inline-flex items-center gap-1 text-[12px] font-semibold text-text-secondary hover:text-yellow transition-colors focus-ring rounded"
        >
          View all
          <ArrowRight size={13} />
        </Link>
      </div>

      <div className="flex-1 px-4 pb-3">
        {loading
          ? [0, 1, 2, 3].map((i) => <div key={i} className="h-11 my-2 rounded-md bg-surface-3" />)
          : sorted.slice(0, 5).map((o) => (
              <Link
                key={o.id}
                href={`/orders?open=${o.id}`}
                className="group flex items-center gap-3 py-2.5 -mx-2 px-2 rounded-[10px] border-t border-border/60 first:border-t-0 hover:bg-surface-3 transition-colors focus-ring"
              >
                <span
                  className="w-2.5 h-2.5 rounded-full shrink-0"
                  style={{ backgroundColor: STATUS_TONE[o.status] ?? "var(--text-muted)" }}
                  aria-hidden="true"
                />

                <span className="min-w-0 flex-1">
                  <span className="block text-[14px] leading-5 text-text-primary group-hover:text-yellow transition-colors truncate">
                    {o.number}
                  </span>
                  <span className="block text-[12px] leading-4 text-text-muted truncate">
                    {SOURCE_LABELS[o.source] ?? o.tableLabel ?? o.source} · {format(new Date(o.createdAt), "HH:mm")}
                  </span>
                </span>

                <span className="text-[14px] font-semibold tabular-nums text-text-primary shrink-0">
                  {formatCurrency(o.total)}
                </span>

                <span
                  className="shrink-0 text-[11px] font-semibold uppercase tracking-[0.06em] px-2 py-0.5 rounded-md border capitalize"
                  style={{
                    color: STATUS_TONE[o.status] ?? "var(--text-muted)",
                    borderColor: "var(--border)",
                    backgroundColor: "var(--surface-2)",
                  }}
                >
                  {o.status}
                </span>
              </Link>
            ))}

        {!loading && sorted.length === 0 && (
          <p className="py-8 text-center text-[13px] text-text-muted">No orders yet today.</p>
        )}
      </div>
    </section>
  );
}
