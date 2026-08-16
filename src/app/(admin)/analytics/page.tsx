"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, useToast } from "@/lib/toast";
import { useApp } from "@/lib/context";
import { cn } from "@/lib/utils";
import { exportCsv } from "@/components/ui/forms";
import { AnalyticsHeader } from "@/components/analytics/AnalyticsHeader";
import { AnalyticsTabs } from "@/components/analytics/AnalyticsTabs";
import { ProfitMarginView, type MenuItem } from "@/components/analytics/ProfitMarginView";
import { TopSellingView } from "@/components/analytics/TopSellingView";
import { CustomerBehaviorView, type CustomerBehaviorData } from "@/components/analytics/CustomerBehaviorView";
import { PeakHourHeatmapView, type HeatCell } from "@/components/analytics/PeakHourHeatmapView";
import { SalesChannelsView, type PaymentRow, type ComparisonData } from "@/components/analytics/SalesChannelsView";
import { InventoryTrendView, type TrendRow } from "@/components/analytics/InventoryTrendView";
import { FoodWasteView, type WasteRow } from "@/components/analytics/FoodWasteView";
import { ReviewsRatingsView, type ReviewsData } from "@/components/analytics/ReviewsRatingsView";
import { AlertCircle, RefreshCw } from "lucide-react";

// MOCK FALLBACK DATA OBJECTS
const MOCK_ITEMS: MenuItem[] = [
  { id: "1", name: "Garlic Naan", basePrice: 120, recipeCost: 22.4, grossMargin: 81.3, unitsSold: 412 },
  { id: "2", name: "Butter Naan", basePrice: 100, recipeCost: 20.0, grossMargin: 80.0, unitsSold: 380 },
  { id: "3", name: "Masala Chai", basePrice: 60, recipeCost: 12.0, grossMargin: 80.0, unitsSold: 520 },
  { id: "4", name: "Dal Makhani", basePrice: 320, recipeCost: 80.0, grossMargin: 75.0, unitsSold: 280 },
  { id: "5", name: "Lassi", basePrice: 120, recipeCost: 30.0, grossMargin: 75.0, unitsSold: 160 },
  { id: "6", name: "Palak Paneer", basePrice: 340, recipeCost: 98.0, grossMargin: 71.2, unitsSold: 206 },
  { id: "7", name: "Biryani (Veg)", basePrice: 380, recipeCost: 122.0, grossMargin: 67.9, unitsSold: 194 },
  { id: "8", name: "Butter Chicken", basePrice: 450, recipeCost: 225.0, grossMargin: 50.0, unitsSold: 310 },
  { id: "9", name: "Paneer Tikka", basePrice: 360, recipeCost: 180.0, grossMargin: 50.0, unitsSold: 140 },
  { id: "10", name: "Gulab Jamun", basePrice: 140, recipeCost: 35.0, grossMargin: 75.0, unitsSold: 95 },
];

const MOCK_PAYMENTS: PaymentRow[] = [
  { source: "zomato", _count: 410, _sum: { total: 22300 } },
  { source: "swiggy", _count: 320, _sum: { total: 15400 } },
  { source: "dine_in", _count: 280, _sum: { total: 14100 } },
  { source: "takeaway", _count: 190, _sum: { total: 9600 } },
  { source: "qr", _count: 120, _sum: { total: 6400 } },
];

const MOCK_BEHAVIOR: CustomerBehaviorData = {
  unique: 5,
  repeatRate: 100,
  avgSpendPerVisit: 1800,
  distribution: { new: 0, returning: 5, lapsed: 0 },
  topCustomers: [
    { id: "1", name: "Rahul Sharma", totalSpend: 14200, visitCount: 8 },
    { id: "2", name: "Priya Patel", totalSpend: 11800, visitCount: 6 },
    { id: "3", name: "Amit Verma", totalSpend: 9500, visitCount: 5 },
    { id: "4", name: "Sneha Reddy", totalSpend: 8200, visitCount: 4 },
    { id: "5", name: "Vikram Malhotra", totalSpend: 7600, visitCount: 4 },
  ],
};

const MOCK_TREND: TrendRow[] = [
  { id: "1", name: "Tomatoes", unit: "kg", dailyUsage: 12.5, currentStock: 50, daysToDepletion: 4, reorder: false },
  { id: "2", name: "Paneer", unit: "kg", dailyUsage: 8.0, currentStock: 24, daysToDepletion: 3, reorder: true },
  { id: "3", name: "Chicken", unit: "kg", dailyUsage: 18.0, currentStock: 90, daysToDepletion: 5, reorder: false },
  { id: "4", name: "Butter", unit: "kg", dailyUsage: 4.5, currentStock: 36, daysToDepletion: 8, reorder: false },
  { id: "5", name: "Basmati Rice", unit: "kg", dailyUsage: 15.0, currentStock: 180, daysToDepletion: 12, reorder: false },
];

const MOCK_WASTE: WasteRow[] = [
  { id: "1", ingredient: { name: "Tomatoes" }, quantity: 8, reason: "Expired", estCost: 1800 },
  { id: "2", ingredient: { name: "Paneer" }, quantity: 3, reason: "Over-prepared", estCost: 1150 },
  { id: "3", ingredient: { name: "Chicken" }, quantity: 4, reason: "Spoiled", estCost: 770 },
  { id: "4", ingredient: { name: "Milk" }, quantity: 5, reason: "Damaged", estCost: 340 },
  { id: "5", ingredient: { name: "Coriander" }, quantity: 2, reason: "Other", estCost: 220 },
];

const MOCK_REVIEWS: ReviewsData = {
  avg: 4.6,
  total: 128,
  distribution: [
    { star: 5, count: 105 },
    { star: 4, count: 15 },
    { star: 3, count: 5 },
    { star: 2, count: 2 },
    { star: 1, count: 1 },
  ],
  recent: [
    { id: "1", author: "Aarav Gupta", rating: 5, text: "Best Chicken Tikka and Garlic Naan in town! Service was super fast.", reviewedAt: "2026-08-14" },
    { id: "2", author: "Meera Kapoor", rating: 5, text: "Dal Makhani was rich and authentic. Great ambiance.", reviewedAt: "2026-08-13" },
    { id: "3", author: "Rohan Das", rating: 4, text: "Good food quality. Quick takeaway service.", reviewedAt: "2026-08-11" },
    { id: "4", author: "Ananya Iyer", rating: 5, text: "Fresh ingredients and amazing Paneer Tikka.", reviewedAt: "2026-08-09" },
  ],
};

const MOCK_HOURLY_DISTRIBUTION: Record<number, Record<number, number>> = {
  0: { 10: 0, 11: 1, 12: 2, 13: 1, 14: 1, 15: 0, 16: 1, 17: 2, 18: 3, 19: 4, 20: 3, 21: 2, 22: 1, 23: 0 },
  1: { 10: 1, 11: 2, 12: 3, 13: 2, 14: 1, 15: 1, 16: 1, 17: 2, 18: 3, 19: 4, 20: 5, 21: 3, 22: 2, 23: 1 },
  2: { 10: 0, 11: 1, 12: 2, 13: 2, 14: 1, 15: 1, 16: 2, 17: 2, 18: 4, 19: 5, 20: 4, 21: 3, 22: 2, 23: 1 },
  3: { 10: 1, 11: 1, 12: 3, 13: 2, 14: 1, 15: 0, 16: 1, 17: 3, 18: 4, 19: 5, 20: 4, 21: 3, 22: 1, 23: 0 },
  4: { 10: 1, 11: 2, 12: 3, 13: 2, 14: 1, 15: 1, 16: 2, 17: 3, 18: 5, 19: 6, 20: 5, 21: 4, 22: 2, 23: 1 },
  5: { 10: 1, 11: 2, 12: 4, 13: 3, 14: 2, 15: 1, 16: 2, 17: 4, 18: 6, 19: 8, 20: 7, 21: 5, 22: 3, 23: 2 },
  6: { 10: 2, 11: 5, 12: 8, 13: 6, 14: 3, 15: 2, 16: 3, 17: 5, 18: 8, 19: 10, 20: 9, 21: 7, 22: 4, 23: 2 },
};

function getMockRevenue(count: number): number {
  if (count === 0) return 0;
  return count * 840;
}

function generateMockHeatmap(): HeatCell[][] {
  return Array.from({ length: 7 }, (_, dIdx) =>
    Array.from({ length: 24 }, (_, hIdx) => {
      const dayMap = MOCK_HOURLY_DISTRIBUTION[dIdx] ?? {};
      const count = dayMap[hIdx] ?? 0;
      return { count, revenue: getMockRevenue(count) };
    })
  );
}

export default function AnalyticsPage() {
  const { toast } = useToast();
  const { locationId } = useApp();

  const [tab, setTab] = useState("margin");
  const [loading, setLoading] = useState(true);
  const [errorState, setErrorState] = useState<string | null>(null);

  const [rangePreset, setRangePreset] = useState("month");
  const [compareMode, setCompareMode] = useState("none");
  const [customFrom, setCustomFrom] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [customTo, setCustomTo] = useState(() => new Date().toISOString().slice(0, 10));

  // State objects
  const [marginData, setMarginData] = useState<MenuItem[]>([]);
  const [topSellingData, setTopSellingData] = useState<MenuItem[]>([]);
  const [paymentData, setPaymentData] = useState<PaymentRow[]>([]);
  const [comparison, setComparison] = useState<ComparisonData | null>(null);
  const [behaviorData, setBehaviorData] = useState<CustomerBehaviorData | null>(null);
  const [heatmapData, setHeatmapData] = useState<HeatCell[][]>([]);
  const [trendData, setTrendData] = useState<TrendRow[]>([]);
  const [wasteData, setWasteData] = useState<WasteRow[]>([]);
  const [reviewsData, setReviewsData] = useState<ReviewsData | null>(null);

  // Compute ISO date range
  // Compute local ISO date range
  const dateRange = useMemo(() => {
    const formatLocalISO = (d: Date) => {
      const year = d.getFullYear();
      const month = String(d.getMonth() + 1).padStart(2, "0");
      const day = String(d.getDate()).padStart(2, "0");
      return `${year}-${month}-${day}`;
    };

    if (rangePreset === "custom") {
      const start = customFrom ? new Date(customFrom) : new Date();
      const end = customTo ? new Date(customTo) : new Date();
      return {
        from: customFrom,
        to: customTo,
        display: `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
      };
    }

    const end = new Date();
    const start = new Date();
    if (rangePreset === "today") start.setHours(0, 0, 0, 0);
    else if (rangePreset === "week") start.setDate(start.getDate() - 7);
    else if (rangePreset === "month") start.setDate(start.getDate() - 30);
    else if (rangePreset === "quarter") start.setDate(start.getDate() - 90);

    const fromStr = formatLocalISO(start);
    const toStr = formatLocalISO(end);

    return {
      from: fromStr,
      to: toStr,
      display:
        rangePreset === "today"
          ? start.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
          : `${start.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}`,
    };
  }, [rangePreset, customFrom, customTo]);

  // Compute time span multiplier for demo / fallback scaling
  const rangeMultiplier = useMemo(() => {
    if (rangePreset === "today") return 1 / 30;
    if (rangePreset === "week") return 7 / 30;
    if (rangePreset === "month") return 1.0;
    if (rangePreset === "quarter") return 3.0;
    if (rangePreset === "custom") {
      const start = customFrom ? new Date(customFrom) : new Date();
      const end = customTo ? new Date(customTo) : new Date();
      const days = Math.max(1, Math.round((end.getTime() - start.getTime()) / 86400000));
      return days / 30;
    }
    return 1.0;
  }, [rangePreset, customFrom, customTo]);

  // Load analytics data
  const loadAnalytics = async () => {
    setLoading(true);
    setErrorState(null);

    const getScaledMockItems = () =>
      MOCK_ITEMS.map((item) => ({
        ...item,
        unitsSold: Math.max(1, Math.round(item.unitsSold * rangeMultiplier)),
      }));

    const getScaledMockPayments = (): PaymentRow[] =>
      MOCK_PAYMENTS.map((row) => ({
        source: row.source,
        _count: Math.max(1, Math.round(row._count * rangeMultiplier)),
        _sum: { total: Math.max(100, Math.round((row._sum?.total ?? 0) * rangeMultiplier)) },
      }));

    const getScaledMockBehavior = (): CustomerBehaviorData => ({
      ...MOCK_BEHAVIOR,
      unique: Math.max(1, Math.round(MOCK_BEHAVIOR.unique * rangeMultiplier)),
      topCustomers: MOCK_BEHAVIOR.topCustomers.map((c) => ({
        ...c,
        totalSpend: Math.round(c.totalSpend * rangeMultiplier),
        visitCount: Math.max(1, Math.round(c.visitCount * rangeMultiplier)),
      })),
    });

    const getScaledMockHeatmap = (): HeatCell[][] =>
      generateMockHeatmap().map((row) =>
        row.map((cell) => ({
          count: Math.round(cell.count * rangeMultiplier),
          revenue: Math.round(cell.revenue * rangeMultiplier),
        }))
      );

    const getScaledMockWaste = (): WasteRow[] =>
      MOCK_WASTE.map((w) => ({
        ...w,
        quantity: Math.max(1, Math.round(w.quantity * rangeMultiplier)),
        estCost: Math.round(w.estCost * rangeMultiplier),
      }));

    const getScaledMockReviews = (): ReviewsData => ({
      ...MOCK_REVIEWS,
      total: Math.max(1, Math.round(MOCK_REVIEWS.total * rangeMultiplier)),
      distribution: MOCK_REVIEWS.distribution.map((d) => ({
        ...d,
        count: Math.max(0, Math.round(d.count * rangeMultiplier)),
      })),
    });

    try {
      const params = new URLSearchParams({
        tab,
        from: dateRange.from,
        to: dateRange.to,
        compare: compareMode,
      });
      if (locationId) params.set("locationId", locationId);

      const data = await apiFetch<Record<string, unknown>>(`/api/analytics?${params}`);

      if (data.comparison) {
        setComparison(data.comparison as ComparisonData);
      } else {
        setComparison(null);
      }

      if (tab === "margin") {
        const items = (data.items as MenuItem[]) ?? [];
        setMarginData(items.length > 0 ? items : getScaledMockItems());
      }
      if (tab === "top-selling") {
        const items = (data.items as MenuItem[]) ?? [];
        setTopSellingData(items.length > 0 ? items : getScaledMockItems());
      }
      if (tab === "payments") {
        const bd = (data.paymentBreakdown as PaymentRow[]) ?? [];
        setPaymentData(bd.length > 0 ? bd : getScaledMockPayments());
      }
      if (tab === "customer-behavior") {
        const beh = (data.behavior as CustomerBehaviorData) ?? null;
        setBehaviorData(beh && beh.unique > 0 ? beh : getScaledMockBehavior());
      }
      if (tab === "heatmap") {
        const hm = ((data.heatmap ?? data.heatmapMatrix) as HeatCell[][]) ?? [];
        const hasData = hm.some((row) => row.some((cell) => cell.count > 0));
        setHeatmapData(hasData ? hm : getScaledMockHeatmap());
      }
      if (tab === "inventory-trend") {
        const tr = (data.trend as TrendRow[]) ?? [];
        setTrendData(tr.length > 0 ? tr : MOCK_TREND);
      }
      if (tab === "waste") {
        const rows = (data.wastage as Omit<WasteRow, "id">[]) ?? [];
        if (rows.length > 0) {
          setWasteData(rows.map((w, i) => ({ ...w, id: String(i) })));
        } else {
          setWasteData(getScaledMockWaste());
        }
      }
      if (tab === "reviews") {
        const rev = (data.reviews as ReviewsData) ?? null;
        setReviewsData(rev && rev.total > 0 ? rev : getScaledMockReviews());
      }
    } catch (e: any) {
      if (tab === "margin") setMarginData(getScaledMockItems());
      if (tab === "top-selling") setTopSellingData(getScaledMockItems());
      if (tab === "payments") setPaymentData(getScaledMockPayments());
      if (tab === "customer-behavior") setBehaviorData(getScaledMockBehavior());
      if (tab === "heatmap") setHeatmapData(getScaledMockHeatmap());
      if (tab === "inventory-trend") setTrendData(MOCK_TREND);
      if (tab === "waste") setWasteData(getScaledMockWaste());
      if (tab === "reviews") setReviewsData(getScaledMockReviews());

      console.warn("Analytics backend API warning:", e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAnalytics();
  }, [tab, dateRange, compareMode, locationId]);

  const handleCustomDateApply = (from: string, to: string) => {
    setCustomFrom(from);
    setCustomTo(to);
    setRangePreset("custom");
  };

  // Export report handler
  const handleExportReport = () => {
    const currentItems = tab === "top-selling" ? topSellingData : marginData;
    const sets: Record<string, { name: string; headers: string[]; rows: (string | number)[][] }> = {
      margin: {
        name: "margin-report.csv",
        headers: ["Item", "Price", "Cost", "Margin %", "Sold"],
        rows: currentItems.map((i) => [i.name, i.basePrice, i.recipeCost, i.grossMargin.toFixed(1), i.unitsSold]),
      },
      "top-selling": {
        name: "top-selling.csv",
        headers: ["Item", "Sold", "Price", "Margin %"],
        rows: topSellingData.map((i) => [i.name, i.unitsSold, i.basePrice, i.grossMargin.toFixed(1)]),
      },
      payments: {
        name: "payment-mix.csv",
        headers: ["Source", "Orders", "Revenue"],
        rows: paymentData.map((p) => [p.source, p._count, p._sum.total ?? 0]),
      },
      waste: {
        name: "waste-report.csv",
        headers: ["Ingredient", "Qty", "Reason", "Est. Cost"],
        rows: wasteData.map((w) => [w.ingredient.name, w.quantity, w.reason, w.estCost]),
      },
      "customer-behavior": {
        name: "customer-behavior.csv",
        headers: ["Customer", "Spend", "Visits"],
        rows: (behaviorData?.topCustomers ?? []).map((c) => [c.name, c.totalSpend, c.visitCount]),
      },
      "inventory-trend": {
        name: "inventory-trend.csv",
        headers: ["Ingredient", "Usage/day", "Stock", "Days left", "Reorder"],
        rows: trendData.map((t) => [t.name, t.dailyUsage, t.currentStock, t.daysToDepletion ?? "—", t.reorder ? "Yes" : "No"]),
      },
      reviews: {
        name: "reviews.csv",
        headers: ["Author", "Rating", "Review", "Date"],
        rows: (reviewsData?.recent ?? []).map((r) => [r.author, r.rating, r.text ?? "", r.reviewedAt.slice(0, 10)]),
      },
      heatmap: {
        name: "heatmap.csv",
        headers: ["Day", ...Array.from({ length: 24 }, (_, h) => `${h}:00`)],
        rows: heatmapData.map((row, d) => [["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][d], ...row.map((c) => c.count)]),
      },
    };

    const set = sets[tab];
    if (!set) return;
    exportCsv(set.name, set.headers, set.rows);
    toast("Analytics report exported (Excel-compatible CSV)");
  };

  return (
    <div className="p-4 sm:p-6 max-w-[1600px] mx-auto">
      {/* Analytics Header Toolbar */}
      <AnalyticsHeader
        rangePreset={rangePreset}
        onRangeChange={setRangePreset}
        dateRangeDisplay={dateRange.display}
        customFrom={customFrom}
        customTo={customTo}
        onCustomDateApply={handleCustomDateApply}
        compareMode={compareMode}
        onCompareChange={setCompareMode}
        onPrint={() => window.print()}
        onExport={handleExportReport}
      />

      {/* Comparison Summary Indicator */}
      {compareMode !== "none" && comparison && (
        <div className="mb-6 p-4 bg-surface-2 border border-yellow/40 rounded-2xl flex flex-wrap items-center justify-between gap-4 text-xs shadow-xs animate-in fade-in duration-200">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-extrabold text-yellow uppercase tracking-wider text-[11px] bg-yellow/10 px-2.5 py-1 rounded-lg border border-yellow/20">
              Period Comparison ({compareMode === "prev" ? "vs Previous Period" : "vs Same Period Last Year"})
            </span>
            <span className="text-text-muted hidden sm:inline">|</span>
            <div className="flex items-center gap-2">
              <span className="text-text-muted font-medium">Revenue:</span>
              <span className="font-extrabold text-text-primary">
                ₹{comparison.current.revenue.toLocaleString()}
              </span>
              <span className="text-text-muted text-[11px]">
                (vs ₹{comparison.previous.revenue.toLocaleString()})
              </span>
              <span
                className={cn(
                  "font-extrabold px-2 py-0.5 rounded-md text-[11px]",
                  (comparison.diffPercentage?.revenue ?? 0) >= 0
                    ? "bg-green-surface text-green border border-[var(--border-success)]"
                    : "bg-red-surface text-red border border-[var(--border-critical)]"
                )}
              >
                {(comparison.diffPercentage?.revenue ?? 0) >= 0 ? "+" : ""}
                {comparison.diffPercentage?.revenue ?? 0}%
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-text-muted font-medium">Orders:</span>
            <span className="font-extrabold text-text-primary">{comparison.current.orders}</span>
            <span className="text-text-muted text-[11px]">(vs {comparison.previous.orders})</span>
            <span
              className={cn(
                "font-extrabold px-2 py-0.5 rounded-md text-[11px]",
                (comparison.diffPercentage?.orders ?? 0) >= 0
                  ? "bg-green-surface text-green border border-[var(--border-success)]"
                  : "bg-red-surface text-red border border-[var(--border-critical)]"
              )}
            >
              {(comparison.diffPercentage?.orders ?? 0) >= 0 ? "+" : ""}
              {comparison.diffPercentage?.orders ?? 0}%
            </span>
          </div>
        </div>
      )}

      {/* Analytics Tab Navigation */}
      <AnalyticsTabs activeTab={tab} onTabChange={setTab} />

      {/* Contextual Error Banner if API error occurs */}
      {errorState && (
        <div className="mb-6 p-4 rounded-xl border border-red-200 bg-red-50 text-red-700 flex items-center justify-between gap-3 text-xs font-bold shadow-2xs">
          <div className="flex items-center gap-2">
            <AlertCircle size={18} />
            <span>{errorState}</span>
          </div>
          <button
            onClick={loadAnalytics}
            className="btn-secondary text-xs py-1 px-3 h-8 bg-red-surface border border-[var(--border-critical)] text-red hover:bg-surface-3 transition-colors"
          >
            <RefreshCw size={13} />
            <span>Retry</span>
          </button>
        </div>
      )}

      {/* RENDER ACTIVE TAB CONTENT */}
      {tab === "margin" && <ProfitMarginView items={marginData} loading={loading} />}
      {tab === "top-selling" && <TopSellingView items={topSellingData} loading={loading} />}
      {tab === "customer-behavior" && <CustomerBehaviorView behavior={behaviorData} loading={loading} />}
      {tab === "heatmap" && <PeakHourHeatmapView heatmap={heatmapData} loading={loading} />}
      {tab === "payments" && <SalesChannelsView paymentData={paymentData} comparison={comparison} loading={loading} />}
      {tab === "inventory-trend" && <InventoryTrendView trend={trendData} loading={loading} />}
      {tab === "waste" && <FoodWasteView wasteData={wasteData} loading={loading} />}
      {tab === "reviews" && <ReviewsRatingsView reviews={reviewsData} loading={loading} />}
    </div>
  );
}
