"use client";

import { useEffect, useState, useRef } from "react";
import { useApp, type Density } from "@/lib/context";
import { DENSITY_OPTIONS } from "@/lib/density";
import { Bell, User, Search, LogOut, Settings, MapPin, ChevronDown, Type, Check } from "lucide-react";
import { cn } from "@/lib/utils";
import { apiFetch } from "@/lib/toast";
import { format } from "date-fns";
import Link from "next/link";

interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: string;
  isRead: boolean;
  createdAt: string;
}

export function Header() {
  const {
    density, setDensity, locationId, setLocationId, locations,
    userName, userRole, setCommandPaletteOpen, setGlobalSearchOpen,
  } = useApp();

  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [showNotifs, setShowNotifs] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [showDensity, setShowDensity] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const densityRef = useRef<HTMLDivElement>(null);

  const activeLocation = locationId
    ? locations.find((l) => l.id === locationId)?.name ?? "Location"
    : "All Locations";

  const activeDensity = DENSITY_OPTIONS.find((d) => d.id === density) ?? DENSITY_OPTIONS[0];

  const pickDensity = (id: Density) => {
    setDensity(id);
    setShowDensity(false);
  };

  const loadNotifications = async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationItem[]; unreadCount: number }>("/api/notifications");
      setNotifications(data.notifications);
      setUnreadCount(data.unreadCount);
    } catch {
      setUnreadCount(0);
    }
  };

  useEffect(() => {
    loadNotifications();
    const interval = setInterval(loadNotifications, 30000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setShowNotifs(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setShowProfile(false);
      if (densityRef.current && !densityRef.current.contains(e.target as Node)) setShowDensity(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setShowDensity(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const markRead = async (id: string) => {
    try {
      await apiFetch("/api/notifications", { method: "PATCH", body: JSON.stringify({ id }) });
      loadNotifications();
    } catch { /* ignore — non-critical */ }
  };

  const markAllRead = async () => {
    try {
      await apiFetch("/api/notifications", { method: "PATCH", body: JSON.stringify({ markAllRead: true }) });
      loadNotifications();
    } catch { /* ignore */ }
  };

  const openQuickFind = () => {
    const pageSearch = document.getElementById("global-search") as HTMLInputElement | null;
    if (pageSearch) {
      pageSearch.focus();
      pageSearch.scrollIntoView({ behavior: "smooth", block: "center" });
    } else {
      setGlobalSearchOpen(true);
    }
  };

  const signOut = async () => {
    await apiFetch("/api/auth/logout", { method: "POST" }).catch(() => {});
    window.localStorage.removeItem("demoUserRole");
    window.location.href = "/login";
  };

  return (
    <header className="shrink-0 border-b-2 border-border bg-cream/40 shadow-sm">
      <div
        className="flex items-center gap-4 px-4 lg:px-6"
        style={{ minHeight: "var(--header-h)" }}
      >
        {/* Location — primary context */}
        <div className="flex items-center gap-2 shrink-0">
          <div className="relative">
            <MapPin size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
            <select
              value={locationId ?? "all"}
              onChange={(e) => setLocationId(e.target.value === "all" ? null : e.target.value)}
              className="appearance-none h-11 pl-10 pr-10 text-base font-bold bg-white border-2 border-border rounded-2xl cursor-pointer focus-ring text-black min-w-[150px] max-w-[200px] truncate"
              aria-label="Choose location"
            >
              <option value="all">All Locations</option>
              {locations.map((loc) => (
                <option key={loc.id} value={loc.id}>{loc.name}</option>
              ))}
            </select>
            <ChevronDown size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
          </div>
          <span className="hidden lg:inline text-sm font-semibold text-muted truncate max-w-[120px]" title={activeLocation}>
            {activeLocation}
          </span>
        </div>

        {/* Unified search — one clear entry point */}
        <button
          type="button"
          onClick={openQuickFind}
          className="flex-1 max-w-xl hidden sm:flex items-center gap-3 h-11 px-4 bg-white border-2 border-border rounded-2xl hover:border-primary hover:bg-white transition-colors focus-ring text-left"
          aria-label="Search pages and data"
        >
          <Search size={22} className="text-muted shrink-0" />
          <span className="flex-1 text-base font-semibold text-muted truncate">Search menu, orders, inventory…</span>
          <kbd className="hidden md:inline shrink-0 bg-cream px-2.5 py-1 rounded-lg text-sm font-bold text-black border border-border">/</kbd>
          <kbd className="hidden md:inline shrink-0 bg-cream px-2.5 py-1 rounded-lg text-sm font-bold text-black border border-border">⌘K</kbd>
        </button>

        <button
          type="button"
          onClick={() => setCommandPaletteOpen(true)}
          className="sm:hidden flex items-center justify-center h-11 w-11 bg-white border-2 border-border rounded-2xl focus-ring"
          aria-label="Quick find"
        >
          <Search size={22} />
        </button>

        <div className="flex-1 sm:hidden" />

        {/* Right toolbar */}
        <div className="flex items-center gap-2 p-1.5 bg-white border-2 border-border rounded-2xl shrink-0">
          {/* Text size — clearer than Co/St/Cp */}
          <div className="relative" ref={densityRef}>
            <button
              type="button"
              onClick={() => { setShowDensity((v) => !v); setShowNotifs(false); setShowProfile(false); }}
              className="flex items-center gap-2 h-10 px-3 rounded-xl hover:bg-cream focus-ring font-bold text-black"
              aria-label="Text size"
              aria-expanded={showDensity}
            >
              <Type size={20} className="text-muted" />
              <span className="hidden md:inline text-base">{activeDensity.label}</span>
              <ChevronDown size={16} className="text-muted" />
            </button>
            {showDensity && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border-2 border-border rounded-2xl shadow-xl z-50 overflow-hidden py-1" role="menu">
                <p className="px-4 py-2 text-xs font-bold uppercase tracking-wide text-muted">Text size</p>
                {DENSITY_OPTIONS.map((opt) => {
                  const active = density === opt.id;
                  return (
                    <button
                      key={opt.id}
                      type="button"
                      role="menuitemradio"
                      aria-checked={active}
                      onClick={() => pickDensity(opt.id)}
                      className={cn(
                        "w-full text-left px-4 py-3 focus-ring border-b border-border last:border-0 flex items-start gap-3",
                        active ? "bg-primary/25" : "hover:bg-cream"
                      )}
                    >
                      <span className={cn("mt-0.5 w-5 h-5 rounded-full border-2 flex items-center justify-center shrink-0", active ? "border-primary bg-primary" : "border-border bg-white")}>
                        {active && <Check size={12} className="text-black" strokeWidth={3} />}
                      </span>
                      <span>
                        <div className="font-bold text-black">{opt.label}</div>
                        <div className="text-sm text-muted font-medium">{opt.desc}</div>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="w-px h-8 bg-border hidden sm:block" aria-hidden />

          <div className="relative" ref={notifRef}>
            <button
              type="button"
              onClick={() => { setShowNotifs((v) => !v); setShowProfile(false); setShowDensity(false); }}
              className="relative flex items-center justify-center h-10 w-10 rounded-xl hover:bg-cream focus-ring"
              aria-label={`Notifications${unreadCount ? `, ${unreadCount} unread` : ""}`}
              aria-expanded={showNotifs}
            >
              <Bell size={22} className="text-black" />
              {unreadCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[20px] h-5 px-1 bg-red-500 rounded-full border-2 border-white text-[11px] text-white font-bold flex items-center justify-center">
                  {unreadCount > 9 ? "9+" : unreadCount}
                </span>
              )}
            </button>
            {showNotifs && (
              <div className="absolute right-0 top-full mt-2 w-80 max-w-[calc(100vw-2rem)] bg-white border-2 border-border rounded-2xl shadow-xl z-50 overflow-hidden">
                <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-cream">
                  <span className="font-bold text-lg text-black">Notifications</span>
                  {unreadCount > 0 && (
                    <button type="button" onClick={markAllRead} className="text-sm font-bold text-black hover:underline focus-ring">
                      Mark all read
                    </button>
                  )}
                </div>
                <ul className="max-h-80 overflow-auto">
                  {notifications.length === 0 ? (
                    <li className="p-6 text-center text-muted font-semibold">No notifications</li>
                  ) : notifications.map((n) => (
                    <li key={n.id}>
                      <button
                        type="button"
                        onClick={() => markRead(n.id)}
                        className={cn(
                          "w-full text-left px-4 py-4 border-b border-border hover:bg-cream focus-ring",
                          !n.isRead && "bg-primary/15"
                        )}
                      >
                        <div className="font-bold text-base text-black">{n.title}</div>
                        <div className="text-sm text-muted mt-1 font-medium">{n.message}</div>
                        <div className="text-xs text-muted mt-1.5">{format(new Date(n.createdAt), "dd MMM HH:mm")}</div>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <div className="relative" ref={profileRef}>
            <button
              type="button"
              onClick={() => { setShowProfile((v) => !v); setShowNotifs(false); setShowDensity(false); }}
              className="flex items-center gap-2 h-10 pl-1.5 pr-2.5 rounded-xl hover:bg-cream focus-ring"
              aria-label="Account menu"
              aria-expanded={showProfile}
            >
              <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shrink-0">
                <User size={18} className="text-black" />
              </div>
              <span className="text-base font-bold hidden lg:block max-w-[100px] truncate text-black">{userName.split(" ")[0]}</span>
              <ChevronDown size={16} className="text-muted hidden lg:block" />
            </button>
            {showProfile && (
              <div className="absolute right-0 top-full mt-2 w-56 bg-white border-2 border-border rounded-2xl shadow-xl z-50 overflow-hidden py-1">
                <div className="px-4 py-3 border-b border-border bg-cream">
                  <div className="font-bold text-black text-base">{userName}</div>
                  <div className="text-sm text-muted font-medium capitalize">{userRole}</div>
                </div>
                <Link href="/settings" onClick={() => setShowProfile(false)} className="flex items-center gap-3 px-4 py-3 text-base font-semibold hover:bg-cream focus-ring">
                  <Settings size={18} /> Settings
                </Link>
                <button type="button" onClick={signOut} className="flex items-center gap-3 px-4 py-3 text-base font-semibold text-red-600 hover:bg-red-50 w-full focus-ring">
                  <LogOut size={18} /> Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
