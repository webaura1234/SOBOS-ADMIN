"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn, NAV_ITEMS, NAV_GROUPS, SITE_NAME } from "@/lib/utils";
import { useApp } from "@/lib/context";
import { NavIcon } from "./command-palette";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function Sidebar() {
  const pathname = usePathname();
  const { sidebarCollapsed, setSidebarCollapsed, restaurantName, opsSummary, hasPermission, userName, userRole } = useApp();

  const expand = () => setSidebarCollapsed(false);
  const toggle = () => setSidebarCollapsed(!sidebarCollapsed);

  const initial = userName ? userName.trim().charAt(0).toUpperCase() : "N";

  return (
    <aside
      className={cn(
        "hidden lg:flex flex-col h-full border-r border-border shrink-0 transition-all duration-200 overflow-hidden",
        "bg-surface-1",
        sidebarCollapsed ? "w-[var(--sidebar-collapsed-w)] cursor-pointer" : "w-[var(--sidebar-w)]"
      )}
      onClick={sidebarCollapsed ? expand : undefined}
    >
      <div
        className={cn(
          "flex items-center border-b border-border bg-surface-1 shrink-0",
          sidebarCollapsed ? "justify-center px-2" : "justify-between px-4"
        )}
        style={{ height: "var(--header-h)" }}
      >
        {!sidebarCollapsed && (
          <div className="min-w-0">
            <span className="text-base font-bold text-text-primary tracking-wide block truncate">{SITE_NAME}</span>
            <span className="text-[13px] font-semibold text-text-muted block truncate">{restaurantName}</span>
          </div>
        )}
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            toggle();
          }}
          className={cn(
            "rounded-xl hover:bg-surface-3 text-text-muted hover:text-text-primary focus-ring",
            sidebarCollapsed ? "flex items-center justify-center w-full h-full min-h-[44px]" : "p-2 ml-auto"
          )}
          aria-label={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? <ChevronRight size={22} /> : <ChevronLeft size={20} />}
        </button>
      </div>

      <nav className="flex-1 min-h-0 overflow-y-auto pt-3 pb-8 px-2 scrollbar-thin" aria-label="Main navigation">
        {NAV_GROUPS.map((group) => {
          const items = NAV_ITEMS.filter(
            (item) => (group.hrefs as readonly string[]).includes(item.href) && hasPermission(item.permission)
          );
          if (items.length === 0) return null;
          return (
            <div key={group.label} className="mb-3">
              {!sidebarCollapsed && (
                <div className="px-3 py-2 text-[11px] font-extrabold uppercase tracking-[0.08em] text-text-muted">
                  {group.label}
                </div>
              )}
              {items.map((item) => {
                const active = pathname.startsWith(item.href);
                const badge =
                  item.href === "/orders" && opsSummary && opsSummary.activeOrders > 0
                    ? opsSummary.activeOrders
                    : item.href === "/inventory" && opsSummary && opsSummary.lowStockCount > 0
                      ? opsSummary.lowStockCount
                      : null;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => {
                      if (sidebarCollapsed) expand();
                    }}
                    className={cn(
                      "relative flex items-center gap-3 mx-1 px-3 py-2.5 rounded-xl text-base font-semibold transition-all focus-ring mb-1 min-h-[46px]",
                      active
                        ? "bg-yellow text-[var(--on-yellow)] font-bold shadow-sm"
                        : "text-text-secondary hover:bg-surface-3 hover:text-text-primary",
                      sidebarCollapsed && "justify-center px-2"
                    )}
                    title={sidebarCollapsed ? `${item.label} — click to open menu` : undefined}
                  >
                    <NavIcon name={item.icon} size={22} />
                    {!sidebarCollapsed && <span className="truncate flex-1">{item.label}</span>}
                    {badge !== null && (
                      <span
                        className={cn(
                          "min-w-[22px] h-[22px] px-1.5 rounded-full text-[11px] font-bold flex items-center justify-center",
                          item.href === "/inventory"
                            ? "bg-[var(--critical-surface)] text-critical border border-[var(--border-critical)]"
                            : "bg-yellow-surface text-yellow border border-[var(--border-yellow)]",
                          sidebarCollapsed && "absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] text-[10px]"
                        )}
                      >
                        {badge > 9 ? "9+" : badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          );
        })}
      </nav>

      {/* Non-overlapping anchored user footer block */}
      <div
        className={cn(
          "shrink-0 border-t border-border bg-surface-1 p-3 flex items-center gap-3",
          sidebarCollapsed && "justify-center px-2"
        )}
      >
        <div className="w-9 h-9 rounded-full bg-surface-2 text-text-primary border border-border font-bold text-sm flex items-center justify-center shrink-0 shadow-sm">
          {initial}
        </div>
        {!sidebarCollapsed && (
          <div className="min-w-0 flex-1">
            <span className="text-[14px] font-bold text-text-primary block truncate">{userName || "User"}</span>
            <span className="text-[12px] font-semibold text-text-muted block truncate capitalize">{userRole || "Manager"}</span>
          </div>
        )}
      </div>
    </aside>
  );
}
