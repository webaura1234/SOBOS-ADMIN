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
      className="fixed inset-0 z-50 m-0 h-full w-full max-h-full max-w-full bg-transparent p-0 backdrop:bg-[var(--scrim)]"
      onClose={onClose}
    >
      <div className="flex h-full justify-end" onClick={(e) => e.target === e.currentTarget && onClose()}>
        <div
          className="h-full bg-surface-2 border-l border-border shadow-2xl flex flex-col"
          style={{ width, maxWidth: "100vw" }}
        >
          <div className="flex items-center justify-between px-5 border-b border-border bg-surface-3" style={{ height: "var(--header-h)" }}>
            <h2 className="font-bold text-xl text-text-primary">{title}</h2>
            <button type="button" onClick={onClose} className="p-2.5 rounded-xl hover:bg-surface-2 text-text-muted hover:text-text-primary focus-ring" aria-label="Close">
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
  available: "var(--green)",
  out_of_stock: "var(--red)",
  unavailable_delivery: "var(--orange)",
  occupied: "var(--red)",
  reserved: "var(--purple)",
  cleaning: "var(--yellow)",
  pending: "var(--orange)",
  confirmed: "var(--yellow)",
  preparing: "var(--orange)",
  ready: "var(--green)",
  served: "var(--green)",
  cancelled: "var(--red)",
  healthy: "var(--green)",
  warning: "var(--orange)",
  critical: "var(--red)",
  active: "var(--green)",
  draft: "var(--sand)",
  submitted: "var(--yellow)",
  completed: "var(--green)",
  processing: "var(--orange)",
};

const STATUS_PILL: Record<string, string> = {
  available: "bg-green-surface text-green border-[var(--border-success)]",
  occupied: "bg-red-surface text-red border-[var(--border-critical)]",
  reserved: "bg-purple-surface text-purple border-purple/40",
  cleaning: "bg-yellow-surface text-yellow border-[var(--border-warning)]",
  healthy: "bg-green-surface text-green border-[var(--border-success)]",
  warning: "bg-yellow-surface text-yellow border-[var(--border-warning)]",
  critical: "bg-red-surface text-red border-[var(--border-critical)]",
  out_of_stock: "bg-red-surface text-red border-[var(--border-critical)]",
  pending: "bg-surface-3 text-text-secondary border-border",
  confirmed: "bg-yellow-surface text-yellow border-[var(--border-warning)]",
  preparing: "bg-yellow-surface text-orange border-[var(--border-warning)]",
  ready: "bg-green-surface text-green border-[var(--border-success)]",
  served: "bg-surface-3 text-text-secondary border-border",
  cancelled: "bg-red-surface text-red border-[var(--border-critical)]",
  active: "bg-green-surface text-green border-[var(--border-success)]",
};

export function StatusDot({ status, label, className }: StatusDotProps) {
  const color = STATUS_COLORS[status] ?? "var(--sand)";
  const pill = STATUS_PILL[status] ?? "bg-surface-3 text-text-primary border-border";
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
    dine_in: "bg-surface-3 text-text-primary border border-border",
    takeaway: "bg-surface-2 text-text-primary border border-border",
    swiggy: "bg-yellow/20 text-yellow border border-yellow/40 font-bold",
    zomato: "bg-red-surface text-red border border-[var(--border-critical)] font-bold",
    qr: "bg-green-surface text-green border border-[var(--border-success)] font-bold",
    ondc: "bg-surface-3 text-text-primary border border-border",
    counter: "bg-surface-3 text-text-primary border border-border",
  };
  return (
    <span className={cn("px-2.5 py-1 rounded-lg text-sm font-bold capitalize", colors[source] ?? "bg-surface-3 text-text-primary")}>
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
    <div className="flex flex-wrap items-center gap-4 mb-5 p-4 bg-surface-2 rounded-2xl border border-border">
      <div className="relative flex-1 min-w-[240px] max-w-lg">
        <Search size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" />
        <input
          id="global-search"
          type="search"
          placeholder={placeholder}
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="h-11 w-full pl-11 pr-12 border border-border rounded-xl text-base font-semibold bg-surface-1 focus-ring text-text-primary placeholder:text-text-muted hover:border-border-strong"
          aria-label="Search"
        />
        <kbd className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:inline text-xs font-semibold text-text-secondary bg-surface-3 px-2 py-0.5 rounded border border-border">/</kbd>
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
            "inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-bold border focus-ring transition-all shrink-0",
            value === o.value
              ? "bg-yellow border-yellow text-[var(--on-yellow)] shadow-xs scale-[1.02]"
              : "border-border bg-surface-2 text-text-secondary hover:bg-surface-3 hover:text-text-primary"
          )}
          aria-pressed={value === o.value}
        >
          {o.label}
          {o.count !== undefined && (
            <span className={cn(
              "min-w-[1.5rem] h-5 px-1.5 rounded-full text-xs font-bold flex items-center justify-center",
              value === o.value ? "bg-[var(--on-yellow)]/20 text-[var(--on-yellow)]" : "bg-surface-3 text-text-secondary"
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
    <div className="relative inline-flex items-stretch h-10 border border-border rounded-xl bg-surface-1 shrink-0 overflow-hidden">
      <span className="flex items-center px-2.5 text-xs font-bold text-text-muted uppercase tracking-wide border-r border-border bg-surface-3 whitespace-nowrap">
        {label}
      </span>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-full pl-2.5 pr-8 text-sm font-bold bg-transparent border-0 outline-none cursor-pointer focus-ring text-text-primary appearance-none min-w-[72px]"
        aria-label={label}
      >
        {options.map((o) => (
          <option key={o.value || "all"} value={o.value} className="bg-surface-1 text-text-primary">{o.label}</option>
        ))}
      </select>
      <ChevronDown size={14} className="absolute right-2 top-1/2 -translate-y-1/2 text-text-muted pointer-events-none" aria-hidden />
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
          <div className="text-base font-semibold text-text-muted">{s.label}</div>
          <div className="text-2xl font-bold text-text-primary mt-1 tabular-nums">{s.value}</div>
          {s.hint && <div className="text-sm font-medium text-text-muted mt-1.5">{s.hint}</div>}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center page-surface">
      <div className="w-14 h-14 rounded-2xl bg-surface-3 flex items-center justify-center mb-4">
        <Inbox size={28} className="text-text-muted" />
      </div>
      <p className="text-xl font-bold text-text-primary">{title}</p>
      {description && <p className="text-text-muted text-lg font-medium mt-2 max-w-sm">{description}</p>}
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
    <div className="flex items-center gap-4 px-5 py-4 bg-yellow/15 border border-yellow/40 rounded-2xl mb-4 text-lg">
      <span className="font-bold text-text-primary">{count} selected</span>
      {actions.map((a) => (
        <button
          key={a.label}
          type="button"
          onClick={a.onClick}
          className={cn(
            "px-5 py-2.5 rounded-xl text-base font-bold focus-ring",
            a.destructive ? "text-critical bg-red-surface hover:bg-red-surface/80" : "text-text-primary bg-surface-2 hover:bg-surface-3 border border-border"
          )}
        >
          {a.label}
        </button>
      ))}
      <button type="button" onClick={onClear} className="ml-auto text-text-muted text-sm font-bold hover:text-text-primary focus-ring px-2 py-1">
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
        <h1 className="text-3xl font-bold text-text-primary tracking-tight">{title}</h1>
        {subtitle && <p className="text-text-muted text-base font-medium mt-1.5 max-w-2xl">{subtitle}</p>}
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
      className="flex flex-wrap gap-1.5 mb-6 p-1.5 bg-surface-2 rounded-2xl border border-border w-full sm:w-fit max-w-full overflow-x-auto scrollbar-thin"
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
              ? "bg-surface-1 text-text-primary shadow-md border-2 border-yellow"
              : "text-text-secondary hover:text-text-primary hover:bg-surface-3 border-2 border-transparent"
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
