"use client";

import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import {
  type Density,
  readStoredDensity,
  applyDensity,
  persistDensity,
} from "@/lib/density";

export type { Density };
export type UserRole = "owner" | "manager";

interface AppContextValue {
  density: Density;
  setDensity: (d: Density) => void;
  locationId: string | null;
  setLocationId: (id: string | null) => void;
  locations: { id: string; name: string }[];
  setLocations: (locs: { id: string; name: string }[]) => void;
  userRole: UserRole;
  setUserRole: (role: UserRole) => void;
  userName: string;
  setUserName: (name: string) => void;
  restaurantName: string;
  setRestaurantName: (name: string) => void;
  permissions: string[];
  setPermissions: (permissions: string[]) => void;
  hasPermission: (permission: string) => boolean;
  sidebarCollapsed: boolean;
  setSidebarCollapsed: (v: boolean) => void;
  mobileMenuOpen: boolean;
  setMobileMenuOpen: (v: boolean) => void;
  commandPaletteOpen: boolean;
  setCommandPaletteOpen: (v: boolean) => void;
  globalSearchOpen: boolean;
  setGlobalSearchOpen: (v: boolean) => void;
  shortcutsOpen: boolean;
  setShortcutsOpen: (v: boolean) => void;
  opsSummary: { activeOrders: number; lowStockCount: number } | null;
  setOpsSummary: (v: { activeOrders: number; lowStockCount: number } | null) => void;
}

const AppContext = createContext<AppContextValue | null>(null);

export function AppProvider({ children }: { children: ReactNode }) {
  const [density, setDensityState] = useState<Density>("compact");
  const [locationId, setLocationId] = useState<string | null>(null);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [globalSearchOpen, setGlobalSearchOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [opsSummary, setOpsSummary] = useState<{ activeOrders: number; lowStockCount: number } | null>(null);
  const [userRole, setUserRole] = useState<UserRole>("owner");
  const [userName, setUserName] = useState("Admin");
  const [restaurantName, setRestaurantName] = useState("Restaurant");
  const [permissions, setPermissions] = useState<string[]>([]);

  const setDensity = useCallback((d: Density) => {
    setDensityState(d);
    applyDensity(d);
    persistDensity(d);
  }, []);

  useEffect(() => {
    const d = readStoredDensity();
    setDensityState(d);
    applyDensity(d);
  }, []);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandPaletteOpen((v) => !v);
      }
      if (e.key === "/" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        const pageSearch = document.getElementById("global-search");
        if (pageSearch) pageSearch.focus();
        else setGlobalSearchOpen(true);
      }
      if (e.key === "Escape") {
        setGlobalSearchOpen(false);
        setCommandPaletteOpen(false);
        setShortcutsOpen(false);
      }
      if (e.key === "?" && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLTextAreaElement)) {
        e.preventDefault();
        setShortcutsOpen((v) => !v);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  const hasPermission = useCallback(
    (permission: string) => userRole === "owner" || permissions.includes(permission),
    [permissions, userRole]
  );

  return (
    <AppContext.Provider
      value={{
        density,
        setDensity,
        locationId,
        setLocationId,
        locations,
        setLocations,
        userRole,
        setUserRole,
        userName,
        setUserName,
        restaurantName,
        setRestaurantName,
        permissions,
        setPermissions,
        hasPermission,
        sidebarCollapsed,
        setSidebarCollapsed,
        mobileMenuOpen,
        setMobileMenuOpen,
        commandPaletteOpen,
        setCommandPaletteOpen,
        globalSearchOpen,
        setGlobalSearchOpen,
        shortcutsOpen,
        setShortcutsOpen,
        opsSummary,
        setOpsSummary,
      }}
    >
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error("useApp must be used within AppProvider");
  return ctx;
}
