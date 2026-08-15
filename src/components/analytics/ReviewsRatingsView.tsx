"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { InsightCard } from "./InsightCard";
import { AnalyticsEmptyState } from "./AnalyticsEmptyState";
import { Star, MessageSquare, ExternalLink } from "lucide-react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

export interface ReviewItem {
  id: string;
  author: string;
  rating: number;
  text: string | null;
  reviewedAt: string;
}

export interface ReviewsData {
  avg: number;
  total: number;
  distribution: { star: number; count: number }[];
  recent: ReviewItem[];
}

interface ReviewsRatingsViewProps {
  reviews: ReviewsData | null;
  loading?: boolean;
}

export function ReviewsRatingsView({
  reviews,
  loading = false,
}: ReviewsRatingsViewProps) {
  const fiveStarCount = useMemo(() => {
    return reviews?.distribution.find((d) => d.star === 5)?.count ?? 0;
  }, [reviews]);

  const fiveStarRate = useMemo(() => {
    if (!reviews || reviews.total === 0) return 0;
    return Math.round((fiveStarCount / reviews.total) * 100);
  }, [reviews, fiveStarCount]);

  // Rating trajectory line chart over time sample data
  const ratingTrendData = useMemo(() => {
    const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul"];
    const baseAvg = reviews ? reviews.avg : 4.6;
    return months.map((m, i) => ({
      month: m,
      rating: Math.min(5, Math.max(3.5, Math.round((baseAvg + Math.sin(i * 0.8) * 0.2) * 10) / 10)),
    }));
  }, [reviews]);

  // STRUCTURAL EMPTY STATE (Section 19 requirement)
  if (!loading && (!reviews || reviews.total === 0)) {
    return (
      <div className="space-y-6">
        {/* Preserved Header KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 opacity-70">
          <div className="p-4 rounded-2xl bg-white border border-border/80">
            <div className="text-xs font-bold text-muted uppercase">Avg Rating</div>
            <div className="text-2xl font-extrabold text-black mt-1">— ★</div>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-border/80">
            <div className="text-xs font-bold text-muted uppercase">Total Reviews</div>
            <div className="text-2xl font-extrabold text-black mt-1">0</div>
          </div>
          <div className="p-4 rounded-2xl bg-white border border-border/80">
            <div className="text-xs font-bold text-muted uppercase">5-Star Rate</div>
            <div className="text-2xl font-extrabold text-black mt-1">— %</div>
          </div>
        </div>

        {/* Actionable Empty State for Reviews */}
        <AnalyticsEmptyState
          icon={<Star size={32} className="text-yellow-hover fill-yellow-hover" />}
          title="No reviews connected yet"
          description="Connect Google Business to automatically sync customer ratings, sentiment, and review previews into your dashboard."
          actionLabel="Connect Google Business"
          onAction={() => alert("Open Integrations Tab")}
        />
      </div>
    );
  }

  return (
    <div className={cn("space-y-6 transition-opacity", loading && "opacity-60")}>
      {/* RATING SUMMARY KPIS */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              Average Rating
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-black tabular-nums mt-1 flex items-center gap-1.5">
              <span>{reviews?.avg.toFixed(1)}</span>
              <span className="text-amber-500 text-xl">★</span>
            </div>
            <div className="text-xs font-semibold text-sand-dark mt-1">Excellent reputation</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-yellow/20 text-yellow-hover flex items-center justify-center font-bold">
            <Star size={22} className="fill-yellow-hover" />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              Total Reviews
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-black tabular-nums mt-1">
              {reviews?.total.toLocaleString()}
            </div>
            <div className="text-xs font-semibold text-sand-dark mt-1">Synced diner feedback</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-cream text-sand-dark flex items-center justify-center font-bold">
            <MessageSquare size={20} />
          </div>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-border/80 shadow-2xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-muted uppercase tracking-wider">
              5-Star Satisfaction
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-black tabular-nums mt-1">
              {fiveStarRate}%
            </div>
            <div className="text-xs font-semibold text-sand-dark mt-1">Top-tier ratings</div>
          </div>
          <div className="w-10 h-10 rounded-xl bg-yellow/20 text-yellow-hover flex items-center justify-center font-bold">
            <Star size={22} className="fill-yellow-hover text-yellow-hover" />
          </div>
        </div>
      </div>

      {/* Insight */}
      <InsightCard
        title="REPUTATION INSIGHT"
        insight={`Your restaurant holds a strong rating of ${reviews?.avg.toFixed(1)} ★ with ${fiveStarRate}% 5-star customer ratings. Continue highlighting top bestsellers to maintain high guest satisfaction.`}
      />

      {/* MAIN VISUALIZATION: RATING DISTRIBUTION & RATING TREND */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* RATING DISTRIBUTION PROGRESS BARS (5 cols) */}
        <div className="lg:col-span-5 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-black">Rating Distribution</h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Star breakdown across all diner reviews
            </p>
          </div>

          <div className="space-y-3 pt-1">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = reviews?.distribution.find((d) => d.star === star)?.count ?? 0;
              const pct = reviews?.total ? Math.round((count / reviews.total) * 100) : 0;

              return (
                <div key={star} className="flex items-center gap-3 text-xs font-bold text-black">
                  <div className="flex items-center gap-1 w-10 shrink-0">
                    <Star size={13} className="text-amber-500 fill-amber-500" />
                    <span>{star} ★</span>
                  </div>

                  <div className="flex-1 h-2.5 rounded-full bg-cream border border-border/50 overflow-hidden">
                    <div
                      className="h-full rounded-full bg-yellow transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>

                  <span className="w-10 text-right tabular-nums text-muted font-medium">
                    {count}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* RATING TREND LINE CHART (7 cols) */}
        <div className="lg:col-span-7 p-5 rounded-2xl bg-white border border-border/80 shadow-2xs space-y-4">
          <div>
            <h3 className="font-bold text-base text-black">Rating Trajectory Over Time</h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Average star rating trend across recent months
            </p>
          </div>

          <div className="h-[250px] w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={ratingTrendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8DFC8" />
                <XAxis dataKey="month" tick={{ fontSize: 11, fill: "#8B7355" }} />
                <YAxis domain={[3, 5]} tick={{ fontSize: 11, fill: "#8B7355" }} />
                <Tooltip
                  contentStyle={{ backgroundColor: "#1A141A", borderRadius: "12px", color: "#fff", fontSize: "12px" }}
                  formatter={(val: any) => [`${val} ★`, "Average Rating"]}
                />
                <Line
                  type="monotone"
                  dataKey="rating"
                  stroke="#F4B315"
                  strokeWidth={3}
                  dot={{ r: 5, fill: "#F4B315", stroke: "#1A141A", strokeWidth: 2 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* RECENT REVIEWS CARDS */}
      <div className="space-y-4 pt-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-bold text-base text-black">Recent Diner Feedback</h3>
            <p className="text-xs text-muted font-medium mt-0.5">
              Latest reviews synced from verified customer transactions
            </p>
          </div>

          <button
            onClick={() => alert("Open All Reviews Modal")}
            className="text-xs font-bold text-black hover:text-yellow-hover flex items-center gap-1"
          >
            <span>View All</span>
            <ExternalLink size={13} />
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {(reviews?.recent ?? []).slice(0, 6).map((rev) => (
            <div
              key={rev.id}
              className="p-4 rounded-2xl border border-border/80 bg-white shadow-2xs space-y-2 hover:border-primary/60 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div className="font-bold text-sm text-black">{rev.author}</div>
                <div className="flex items-center gap-0.5 text-amber-500 text-xs font-extrabold">
                  {Array.from({ length: rev.rating }).map((_, i) => (
                    <Star key={i} size={13} className="fill-amber-500 text-amber-500" />
                  ))}
                </div>
              </div>

              {rev.text && (
                <p className="text-xs text-muted font-medium leading-relaxed italic line-clamp-3">
                  "{rev.text}"
                </p>
              )}

              <div className="text-[10px] text-sand-dark font-bold text-right pt-1">
                {rev.reviewedAt.slice(0, 10)}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
