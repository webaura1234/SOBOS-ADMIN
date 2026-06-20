"use client";

import { useEffect, useCallback } from "react";
import { AppProvider, useApp } from "@/lib/context";
import { ToastProvider, apiFetch } from "@/lib/toast";
import { Sidebar } from "./sidebar";
import { Header } from "./header";
import { MobileNav } from "./mobile-nav";
import { CommandPalette } from "./command-palette";
import { GlobalSearch } from "./global-search";
import { KeyboardShortcuts } from "./keyboard-shortcuts";
import { useInterval } from "@/lib/use-interval";

function ShellInner({ children }: { children: React.ReactNode }) {
  const { setLocations, setLocationId, locationId, setOpsSummary } = useApp();

  useEffect(() => {
    fetch("/api/locations")
      .then((r) => {
        if (!r.ok) throw new Error("Failed to load locations");
        return r.json();
      })
      .then((data) => {
        const locs = Array.isArray(data) ? data : [];
        setLocations(locs);
        if (locs.length > 0) setLocationId(null);
      })
      .catch(console.error);
  }, [setLocations, setLocationId]);

  const loadOps = useCallback(() => {
    const params = locationId ? `?locationId=${locationId}` : "";
    apiFetch<{ activeOrders: number; lowStockCount: number }>(`/api/ops-summary${params}`)
      .then((d) => setOpsSummary({ activeOrders: d.activeOrders, lowStockCount: d.lowStockCount }))
      .catch(() => setOpsSummary(null));
  }, [locationId, setOpsSummary]);

  useEffect(() => { loadOps(); }, [loadOps]);
  useInterval(loadOps, 30000);

  return (
    <div className="flex h-screen overflow-hidden">
      <Sidebar />
      <div className="flex flex-col flex-1 min-w-0">
        <Header />
        <main className="flex-1 overflow-auto p-5 lg:p-6 pb-24 lg:pb-6 scrollbar-thin bg-white">
          {children}
        </main>
      </div>
      <MobileNav />
      <CommandPalette />
      <GlobalSearch />
      <KeyboardShortcuts />
    </div>
  );
}

export function AdminShell({ children }: { children: React.ReactNode }) {
  return (
    <AppProvider>
      <ToastProvider>
        <ShellInner>{children}</ShellInner>
      </ToastProvider>
    </AppProvider>
  );
}
