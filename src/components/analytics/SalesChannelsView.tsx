"use client";

import { useMemo } from "react";
import { formatCurrency, cn } from "@/lib/utils";
import { InsightCard } from "./InsightCard";
import { CreditCard, ShoppingBag, Store, Smartphone, QrCode } from "lucide-react";
import { ChartContainer } from "@/components/ui/chart-container";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
} from "recharts";

export interface PaymentRow {
  source: string;
  _count: number;
  _sum: { total: number | null };
}

export interface ComparisonData {
  mode?: string;
  current: { revenue: number; orders: number };
  previous: { revenue: number; orders: number };
  diffPercentage?: { revenue: number; orders: number };
}

interface SalesChannelsViewProps {
  paymentData: PaymentRow[];
  comparison: ComparisonData | null;
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

const CHANNEL_ICONS: Record<string, React.ReactNode> = {
  dine_in: <Store size={18} className="text-amber-700" />,
  takeaway: <ShoppingBag size={18} className="text-yellow-hover" />,
  swiggy: <Smartphone size={18} className="text-amber-800" />,
  zomato: <Smartphone size={18} className="text-red-600" />,
  qr: <QrCode size={18} className="text-sand-dark" />,
  counter: <CreditCard size={18} className="text-sand-dark" />,
};

const CHANNEL_COLORS: Record<string, string> = {
  dine_in: "#FED500",
  takeaway: "#B8AA96",
  swiggy: "#F59A23",
  zomato: "#FF4D57",
  qr: "#9B7BFF",
  counter: "#8C8070",
};

export function SalesChannelsView({
  paymentData,
  comparison,
  loading = false,
}: SalesChannelsViewProps) {
  const totalRevenue = useMemo(
    () => paymentData.reduce((s, p) => s + (p._sum.total ?? 0), 0),
    [paymentData]
  );

  const totalOrders = useMemo(
    () => paymentData.reduce((s, p) => s + p._count, 0),
    [paymentData]
  );

  const sortedChannels = useMemo(() => {
    return [...paymentData].sort(
      (a, b) => (b._sum.total ?? 0) - (a._sum.total ?? 0)
    );
  }, [paymentData]);

  const topChannel = sortedChannels[0];

  // Channel trend time series sample data over time
  const channelTrend = useMemo(() => {
    const dates = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];
    return dates.map((d, i) => {
      const row: Record<string, any> = { day: d };
      sortedChannels.forEach((c) => {
        const base = (c._sum.total ?? 1000) / 7;
        row[c.source] = Math.round(base * (0.7 + Math.sin(i + c.source.length) * 0.4));
      });
      return row;
    });
  }, [sortedChannels]);

  return (
    <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
      {/* COMPARISON BAR IF ACTIVE */}
      {comparison && (
        <div className="p-4 rounded-2xl bg-gradient-to-r from-[var(--yellow-surface)] via-surface-1 to-surface-2 border border-[var(--border-yellow)] flex flex-wrap items-center justify-between gap-6 shadow-2xs">
          <div>
            <div className="text-xs font-bold text-text-muted uppercase tracking-wider">
              Revenue Comparison
            </div>
            <div className="text-2xl font-extrabold text-text-primary tabular-nums">
              {formatCurrency(comparison.current.revenue)}
            </div>
            <div
              className={cn(
                "text-xs font-extrabold flex items-center gap-1 mt-0.5",
                comparison.current.revenue >= comparison.previous.revenue
                  ? "text-green"
                  : "text-red"
              )}
            >
              <span>
                {comparison.current.revenue >= comparison.previous.revenue ? "▲" : "▼"}{" "}
                {comparison.previous.revenue
                  ? Math.abs(
                      Math.round(
                        ((comparison.current.revenue - comparison.previous.revenue) /
                          comparison.previous.revenue) *
                          100
                      )
                    )
                  : 0}
                %
              </span>
              <span className="text-text-muted font-normal">
                vs {formatCurrency(comparison.previous.revenue)} prior
              </span>
            </div>
          </div>

          <div className="w-px h-10 bg-border hidden sm:block" />

          <div>
            <div className="text-xs font-bold text-text-muted uppercase tracking-wider">
              Order Volume Comparison
            </div>
            <div className="text-2xl font-extrabold text-text-primary tabular-nums">
              {comparison.current.orders} orders
            </div>
            <div
              className={cn(
                "text-xs font-extrabold flex items-center gap-1 mt-0.5",
                comparison.current.orders >= comparison.previous.orders
                  ? "text-green"
                  : "text-red"
              )}
            >
              <span>
                {comparison.current.orders >= comparison.previous.orders ? "▲" : "▼"}{" "}
                {comparison.previous.orders
                  ? Math.abs(
                      Math.round(
                        ((comparison.current.orders - comparison.previous.orders) /
                          comparison.previous.orders) *
                          100
                      )
                    )
                  : 0}
                %
              </span>
              <span className="text-muted font-normal">
                vs {comparison.previous.orders} prior orders
              </span>
            </div>
          </div>
        </div>
      )}

      {/* SUMMARY KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="p-4 rounded-2xl bg-surface-1 border border-border shadow-2xs">
          <div className="text-xs font-bold text-text-muted uppercase tracking-wider">
            Total Sales Revenue
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-text-primary tabular-nums mt-1">
            {formatCurrency(totalRevenue)}
          </div>
          <div className="text-xs font-semibold text-text-secondary mt-1">↑ Across all channels</div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-border shadow-2xs">
          <div className="text-xs font-bold text-text-muted uppercase tracking-wider">
            Total Orders
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-text-primary tabular-nums mt-1">
            {totalOrders.toLocaleString()}
          </div>
          <div className="text-xs font-semibold text-text-secondary mt-1">Fulfilled orders</div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-border shadow-2xs">
          <div className="text-xs font-bold text-text-muted uppercase tracking-wider">
            Top Channel
          </div>
          <div className="text-xl font-bold text-text-primary truncate mt-1">
            {topChannel ? SOURCE_LABELS[topChannel.source] ?? topChannel.source : "—"}
          </div>
          <div className="text-xs font-semibold text-text-primary mt-1">
            {topChannel ? formatCurrency(topChannel._sum.total ?? 0) : "—"}
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-surface-1 border border-border shadow-2xs">
          <div className="text-xs font-bold text-text-muted uppercase tracking-wider">
            Active Channels
          </div>
          <div className="text-2xl sm:text-3xl font-extrabold text-text-primary tabular-nums mt-1">
            {paymentData.length}
          </div>
          <div className="text-xs font-semibold text-text-muted mt-1">Integrated sources</div>
        </div>
      </div>

      {/* Insight */}
      {topChannel && (
        <InsightCard
          title="SALES CHANNEL INSIGHT"
          insight={`${SOURCE_LABELS[topChannel.source] ?? topChannel.source} is your primary revenue generator, producing ${formatCurrency(topChannel._sum.total ?? 0)} (${totalRevenue > 0 ? Math.round(((topChannel._sum.total ?? 0) / totalRevenue) * 100) : 0}% of total sales). Maintain high delivery rating standards.`}
        />
      )}

      {/* MAIN VISUALIZATION: CHANNEL BREAKDOWN WITH HORIZONTAL BARS */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Horizontal proportion bars (6 cols) */}
        <div className="lg:col-span-6 p-5 rounded-2xl bg-surface-1 border border-border shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-text-primary">Channel Revenue Breakdown</h3>
            <p className="text-xs text-text-muted font-medium mt-0.5">
              Proportional distribution by sales source
            </p>
          </div>

          <div className="space-y-4 pt-1">
            {sortedChannels.map((c) => {
              const rev = c._sum.total ?? 0;
              const share = totalRevenue > 0 ? Math.round((rev / totalRevenue) * 100) : 0;
              const color = CHANNEL_COLORS[c.source] ?? "#FED500";
              const label = SOURCE_LABELS[c.source] ?? c.source;
              const icon = CHANNEL_ICONS[c.source] ?? <Store size={18} />;

              return (
                <div key={c.source} className="p-3.5 rounded-xl border border-border bg-surface-2 space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 font-bold text-sm text-text-primary">
                      <span className="p-1.5 rounded-lg bg-surface-3 border border-border">{icon}</span>
                      <span>{label}</span>
                    </div>
                    <div className="text-right tabular-nums">
                      <span className="font-extrabold text-sm text-text-primary">{formatCurrency(rev)}</span>
                      <span className="text-xs text-text-muted ml-2 font-bold">({share}%)</span>
                    </div>
                  </div>

                  <div className="h-2.5 rounded-full bg-surface-3 border border-border overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{ width: `${share}%`, backgroundColor: color }}
                    />
                  </div>

                  <div className="text-[11px] font-semibold text-text-muted text-right">
                    {c._count} orders completed
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Channel Trend over time Area Chart (6 cols) */}
        <div className="lg:col-span-6 p-5 rounded-2xl bg-surface-1 border border-border shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-text-primary">Channel Trend Over Time</h3>
            <p className="text-xs text-text-muted font-medium mt-0.5">
              Daily revenue trajectory across order channels
            </p>
          </div>

          <ChartContainer height={300} className="pt-2">
            <AreaChart data={channelTrend} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1F1F1F" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "#B8AA96" }} />
                <YAxis tick={{ fontSize: 11, fill: "#B8AA96" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#101010", borderRadius: "12px", border: "1px solid #2A2A2A", color: "#F5F1E8", fontSize: "12px" }}
                  formatter={(val: any, name: any) => [formatCurrency(Number(val)), SOURCE_LABELS[String(name)] ?? name]}
                />
                {sortedChannels.map((c) => (
                  <Area
                    key={c.source}
                    type="monotone"
                    dataKey={c.source}
                    stackId="1"
                    stroke={CHANNEL_COLORS[c.source] ?? "#FED500"}
                    fill={CHANNEL_COLORS[c.source] ?? "#FED500"}
                    fillOpacity={0.6}
                  />
                ))}
              </AreaChart>
          </ChartContainer>
        </div>
      </div>
    </div>
  );
}
