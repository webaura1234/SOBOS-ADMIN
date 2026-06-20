"use client";

import { cn } from "@/lib/utils";
import { X, Search, ChevronRight, Inbox, ChevronDown } from "lucide-react";
import { useEffect, useRef } from "react";

interface DrawerProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: string;
}

export function Drawer({ open, onClose, title, children, width = "520px" }: DrawerProps) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [open]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && open) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onClose]);

  return (
    <dialog
      ref={ref}
      className="fixed inset-0 z-50 m-0 h-full w-full max-h-full max-w-full bg-transparent p-0 backdrop:bg-black/30"
      onClose={onClose}
    >
      <div className="flex h-full justify-end" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div
          className="h-full bg-white border-l-2 border-border shadow-2xl flex flex-col"
          style={{ width, maxWidth: "100vw" }}
        >
          <div className="flex items-center justify-between px-5 border-b-2 border-border bg-cream" style={{ height: "var(--header-h)" }}>
            <h2 className="font-bold text-xl text-black">{title}</h2>
            <button type="button" onClick={onClose} className="p-2.5 rounded-xl hover:bg-white focus-ring" aria-label="Close">
              <X size={20} />
            </button>
          </div>
          <div className="flex-1 overflow-auto p-5 scrollbar-thin">{children}</div>
        </div>
      </div>
    </dialog>
  );
}

interface StatusDotProps {
  status: string;
  label?: string;
  className?: string;
}

const STATUS_COLORS: Record<string, string> = {
  available: "var(--st-available)",
  out_of_stock: "var(--st-cancelled)",
  unavailable_delivery: "var(--st-preparing)",
  occupied: "var(--st-occupied)",
  reserved: "var(--st-reserved)",
  cleaning: "var(--st-cleaning)",
  pending: "var(--st-pending)",
  confirmed: "var(--st-confirmed)",
  preparing: "var(--st-preparing)",
  ready: "var(--st-ready)",
  served: "var(--st-done)",
  cancelled: "var(--st-cancelled)",
  healthy: "var(--st-available)",
  warning: "var(--st-preparing)",
  critical: "var(--st-occupied)",
  active: "var(--st-available)",
  draft: "var(--st-pending)",
  submitted: "var(--st-confirmed)",
  completed: "var(--st-ready)",
  processing: "var(--st-preparing)",
};

const STATUS_PILL: Record<string, string> = {
  available: "bg-green-50 text-green-900 border-green-200",
  occupied: "bg-red-50 text-red-900 border-red-200",
  reserved: "bg-amber-50 text-amber-900 border-amber-200",
  cleaning: "bg-yellow-50 text-yellow-900 border-yellow-300",
  healthy: "bg-green-50 text-green-900 border-green-200",
  warning: "bg-yellow-50 text-yellow-900 border-yellow-300",
  critical: "bg-red-50 text-red-900 border-red-200",
  out_of_stock: "bg-red-50 text-red-900 border-red-200",
  pending: "bg-stone-100 text-stone-800 border-stone-200",
  confirmed: "bg-amber-50 text-amber-900 border-amber-200",
  preparing: "bg-yellow-50 text-yellow-900 border-yellow-300",
  ready: "bg-green-50 text-green-900 border-green-200",
  served: "bg-stone-100 text-stone-700 border-stone-200",
  cancelled: "bg-red-50 text-red-900 border-red-200",
  active: "bg-green-50 text-green-900 border-green-200",
};

export function StatusDot({ status, label, className }: StatusDotProps) {
  const color = STATUS_COLORS[status] ?? "var(--sand)";
  const pill = STATUS_PILL[status] ?? "bg-cream text-black border-border";
  const displayLabel = label ?? status.replace(/_/g, " ");
  return (
    <span className={cn("inline-flex items-center gap-2 px-3 py-1 rounded-full text-sm font-bold border capitalize", pill, className)}>
      <span className="status-dot" style={{ backgroundColor: color }} aria-hidden="true" />
      {displayLabel}
    </span>
  );
}

export function SourceBadge({ source }: { source: string }) {
  const colors: Record<string, string> = {
    dine_in: "bg-cream text-black border border-sand",
    takeaway: "bg-cream-dark text-black",
    swiggy: "bg-primary/30 text-black font-bold",
    zomato: "bg-red-100 text-black",
    qr: "bg-green-100 text-black",
    ondc: "bg-cream text-black",
    counter: "bg-cream text-black",
  };
  return (
    <span className={cn("px-2.5 py-1 rounded-lg text-sm font-bold capitalize", colors[source] ?? "bg-cream")}>
      {source.replace(/_/g, " ")}
    </span>
  );
}

interface FilterBarProps {
  search: string;
  onSearchChange: (v: string) => void;
  filters?: React.ReactNode;
  actions?: React.ReactNode;
  placeholder?: string;
}

export function FilterBar({ search, onSearchChange, filters, actions, placeholder = "Search items…" }: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-center gap-4 mb-5 p-4 bg-cream/60 rounded-2xl border border-border">
      <div className="relative flex-1 min-w-[240px] max-w-lg">
        <Search size={22} className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none" />
        <input
          id="global-search"
          type="search"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-12 w-full pl-11 pr-12 border-2 border-border rounded-xl text-base font-semibold bg-white focus-ring text-black placeholder:text-muted"
          aria-label="Search"
        />
        <kbd className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:inline text-xs font-bold text-muted bg-white px-2 py-1 rounded border border-border">/</kbd>
      </div>
      {filters}
      {actions}
    </div>
  );
}

interface ChipFilterProps {
  options: { value: string; label: string; count?: number }[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  inline?: boolean;
}

export function ChipFilter({ options, value, onChange, className, inline }: ChipFilterProps) {
  return (
    <div
      className={cn(
        "flex gap-2",
        inline ? "flex-nowrap overflow-x-auto scrollbar-thin shrink-0" : "flex-wrap mb-5",
        className
      )}
      role="group"
      aria-label="Filter"
    >
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          onClick={() => onChange(o.value)}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border-2 focus-ring transition-all shrink-0",
            value === o.value
              ? "bg-primary border-primary text-black shadow-sm scale-[1.02]"
              : "border-border bg-white text-muted hover:bg-cream hover:text-black hover:border-sand"
          )}
          aria-pressed={value === o.value}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cn(
              "min-w-[1.5rem] h-6 px-1.5 rounded-full text-sm flex items-center justify-center",
              value === o.value ? "bg-black/10" : "bg-cream"
            )}>
              {o.count}
            </span>
          )}
        </button>
      ))}
    </div>
  );
}

interface LabeledFilterSelectProps {
  label: string;
  id: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}

export function LabeledFilterSelect({ label, id, value, onChange, options }: LabeledFilterSelectProps) {
  return (
    <div className="relative inline-flex items-stretch h-10 border-2 border-border rounded-xl bg-white shrink-0 overflow-hidden">
      <span className="flex items-center px-2.5 text-xs font-bold text-muted uppercase tracking-wide border-r border-border bg-cream/50 whitespace-nowrap">
        {label}
      </span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full pl-2.5 pr-8 text-sm font-bold bg-transparent border-0 outline-none cursor-pointer focus-ring text-black appearance-none min-w-[72px]"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value || "all"} value={o.value}>{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted pointer-events-none" aria-hidden />
    </div>
  );
}

interface StatCardsProps {
  stats: { label: string; value: string | number; hint?: string; tone?: "default" | "success" | "warning" | "danger" | "active"; onClick?: () => void }[];
}

export function StatCards({ stats }: StatCardsProps) {
  const toneClass = {
    default: "",
    success: "stat-card--success",
    warning: "stat-card--warning",
    danger: "stat-card--danger",
    active: "stat-card--active",
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
      {stats.map((s) => (
        <button
          key={s.label}
          type="button"
          onClick={s.onClick}
          disabled={!s.onClick}
          className={cn(
            "stat-card text-left",
            toneClass[s.tone ?? "default"],
            s.onClick && "cursor-pointer hover:scale-[1.01] active:scale-[0.99]",
            !s.onClick && "cursor-default"
          )}
        >
          <div className="text-base font-semibold text-muted">{s.label}</div>
          <div className="text-2xl font-bold text-black mt-1 tabular-nums">{s.value}</div>
          {s.hint && <div className="text-sm font-medium text-muted mt-1.5">{s.hint}</div>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center page-surface">
      <div className="w-14 h-14 rounded-2xl bg-cream flex items-center justify-center mb-4">
        <Inbox size={28} className="text-muted" />
      </div>
      <p className="text-xl font-bold text-black">{title}</p>
      {description && <p className="text-muted text-lg font-medium mt-2 max-w-sm">{description}</p>}
    </div>
  );
}

interface BulkActionBarProps {
  count: number;
  actions: { label: string; onClick: () => void; destructive?: boolean }[];
  onClear: () => void;
}

export function BulkActionBar({ count, actions, onClear }: BulkActionBarProps) {
  if (count === 0) return null;
  return (
    <div className="flex items-center gap-4 px-5 py-4 bg-primary/20 border-2 border-primary rounded-2xl mb-4 text-lg">
      <span className="font-bold text-black">{count} selected</span>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          className={cn(
            "px-5 py-2.5 rounded-xl text-base font-bold focus-ring",
            a.destructive ? "text-red-700 bg-red-50 hover:bg-red-100" : "text-black bg-white hover:bg-cream border border-border"
          )}
        >
          {a.label}
        </button>
      ))}
      <button type="button" onClick={onClear} className="ml-auto text-muted text-sm font-bold hover:text-black focus-ring px-2 py-1">
        Clear
      </button>
    </div>
  );
}

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
      <div>
        <h1 className="text-3xl font-bold text-black tracking-tight">{title}</h1>
        {subtitle && <p className="text-muted text-base font-medium mt-1.5 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-3 flex-wrap">{actions}</div>}
    </div>
  );
}

interface TabBarProps {
  tabs: { id: string; label: string }[];
  active: string;
  onChange: (id: string) => void;
}

export function TabBar({ tabs, active, onChange }: TabBarProps) {
  return (
    <div
      role="tablist"
      className="flex flex-wrap gap-1.5 mb-6 p-1.5 bg-cream rounded-2xl border-2 border-border w-full sm:w-fit max-w-full overflow-x-auto scrollbar-thin"
    >
      {tabs.map((tab) => (
        <button
          key={tab.id}
          role="tab"
          aria-selected={active === tab.id}
          type="button"
          onClick={() => onChange(tab.id)}
          className={cn(
            "px-5 py-2.5 rounded-xl text-base font-bold transition-all focus-ring whitespace-nowrap min-h-[44px]",
            active === tab.id
              ? "bg-white text-black shadow-md border-2 border-primary"
              : "text-muted hover:text-black hover:bg-white/70 border-2 border-transparent"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}

export function RowActionHint() {
  return (
    <span className="inline-flex items-center gap-1 text-xs font-bold text-muted opacity-0 group-hover:opacity-100 transition-opacity">
      Open <ChevronRight size={14} />
    </span>
  );
}

export function BtnPrimary({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cn("btn-primary", className)} {...props}>
      {children}
    </button>
  );
}

export function BtnSecondary({ children, className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" className={cn("btn-secondary", className)} {...props}>
      {children}
    </button>
  );
}
