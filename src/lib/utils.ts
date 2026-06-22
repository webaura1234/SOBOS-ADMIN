import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export const SITE_NAME = "Sobos";

export function formatCurrency(amount: number): string {
  if (amount >= 100000) return `₹${(amount / 100000).toFixed(1)}L`;
  if (amount >= 1000) return `₹${(amount / 1000).toFixed(1)}K`;
  return `₹${amount.toLocaleString("en-IN", { maximumFractionDigits: 0 })}`;
}

export function formatPercent(value: number): string {
  const sign = value >= 0 ? "+" : "";
  return `${sign}${value.toFixed(1)}%`;
}

export function parseJsonArray<T = string>(json: string): T[] {
  try {
    return JSON.parse(json) as T[];
  } catch {
    return [];
  }
}

export function stockStatus(qty: number, threshold: number): "healthy" | "warning" | "critical" {
  if (qty <= 0) return "critical";
  if (qty <= threshold) return "warning";
  return "healthy";
}

/** Sort labels like T1, T2, … T10 in human order */
export function naturalSortLabel(a: string, b: string): number {
  return a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" });
}

export const NAV_GROUPS = [
  { label: "Overview", hrefs: ["/dashboard", "/analytics"] as const },
  { label: "Operations", hrefs: ["/menu", "/tables", "/inventory", "/orders"] as const },
  { label: "Business", hrefs: ["/payments", "/staff", "/customers"] as const },
  { label: "System", hrefs: ["/setup", "/integrations", "/settings", "/audit"] as const },
] as const;

export const NAV_ITEMS = [
  { href: "/dashboard", label: "Dashboard", icon: "Home", permission: "reports.view" },
  { href: "/menu", label: "Menu & Recipe", icon: "UtensilsCrossed", permission: "menu.edit" },
  { href: "/tables", label: "Tables & Floor", icon: "LayoutGrid", permission: "tables.manage" },
  { href: "/inventory", label: "Inventory", icon: "Package", permission: "inventory.view" },
  { href: "/orders", label: "Orders", icon: "Receipt", permission: "reports.view" },
  { href: "/payments", label: "Payments", icon: "CreditCard", permission: "settings.restaurant" },
  { href: "/staff", label: "Staff & Labor", icon: "Users", permission: "staff.manage" },
  { href: "/analytics", label: "Analytics", icon: "BarChart3", permission: "reports.view" },
  { href: "/customers", label: "Customers", icon: "Gift", permission: "reports.view" },
  { href: "/setup", label: "Setup", icon: "Sparkles", permission: "settings.restaurant" },
  { href: "/integrations", label: "Integrations", icon: "Plug", permission: "settings.integrations" },
  { href: "/settings", label: "Settings", icon: "Settings", permission: "settings.restaurant" },
  { href: "/audit", label: "Audit", icon: "Shield", permission: "settings.restaurant" },
] as const;

export const MOBILE_NAV = [
  { href: "/dashboard", label: "Home", icon: "Home" },
  { href: "/tables", label: "Floor", icon: "LayoutGrid" },
  { href: "/menu", label: "Menu", icon: "Plus", isAction: true },
  { href: "/inventory", label: "Alerts", icon: "Bell" },
  { href: "#menu", label: "More", icon: "Menu" },
] as const;
