"use client";

import {
  TrendingUp,
  Award,
  Users,
  Flame,
  CreditCard,
  Package,
  Trash2,
  Star,
} from "lucide-react";

export interface TabOption {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const TABS: TabOption[] = [
  { id: "margin", label: "Profit Margin", icon: <TrendingUp size={16} /> },
  { id: "top-selling", label: "Top Selling", icon: <Award size={16} /> },
  { id: "customer-behavior", label: "Customer Behavior", icon: <Users size={16} /> },
  { id: "heatmap", label: "Peak-Hour Heatmap", icon: <Flame size={16} /> },
  { id: "payments", label: "Payment Mix & Channels", icon: <CreditCard size={16} /> },
  { id: "inventory-trend", label: "Inventory Trend", icon: <Package size={16} /> },
  { id: "waste", label: "Food Waste", icon: <Trash2 size={16} /> },
  { id: "reviews", label: "Reviews & Ratings", icon: <Star size={16} /> },
];

interface AnalyticsTabsProps {
  activeTab: string;
  onTabChange: (tabId: string) => void;
}

export function AnalyticsTabs({ activeTab, onTabChange }: AnalyticsTabsProps) {
  return (
    <div className="mb-6 overflow-x-auto scrollbar-thin pb-1">
      <nav className="flex gap-1.5 p-1.5 bg-cream/30 border border-border/70 rounded-2xl min-w-max">
        {TABS.map((tab) => {
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex items-center gap-2 px-3.5 py-2 text-xs sm:text-sm font-bold rounded-xl transition-all duration-200 ${
                isActive
                  ? "bg-yellow text-black shadow-xs ring-2 ring-yellow/40"
                  : "text-muted hover:text-black hover:bg-white/80"
              }`}
            >
              <span className={isActive ? "text-black" : "text-sand-dark"}>
                {tab.icon}
              </span>
              <span>{tab.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
