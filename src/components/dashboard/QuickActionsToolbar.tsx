"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Receipt, LayoutGrid, ArrowRight, ChevronDown, Plus, Users } from "lucide-react";

/** Administrative actions live in their own sections; the dashboard keeps service actions. */
const MORE_ACTIONS = [
  { href: "/menu?action=create", label: "New menu item", Icon: Plus },
  { href: "/staff?action=invite", label: "Invite staff", Icon: Users },
];

export function QuickActionsToolbar() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, []);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/orders"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] bg-yellow text-[var(--on-yellow)] text-[13px] font-semibold hover:bg-yellow-hover transition-colors focus-ring"
      >
        <Receipt size={14} />
        Live Orders
        <ArrowRight size={13} />
      </Link>

      <Link
        href="/tables"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-[9px] bg-surface-1 border border-border text-text-primary text-[13px] font-semibold hover:bg-surface-3 hover:border-border-strong transition-colors focus-ring"
      >
        <LayoutGrid size={14} />
        Floor Plan
        <ArrowRight size={13} />
      </Link>

      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-haspopup="menu"
          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-[9px] bg-surface-1 border border-border text-text-secondary text-[13px] font-semibold hover:bg-surface-3 hover:text-text-primary transition-colors focus-ring"
        >
          More
          <ChevronDown size={13} />
        </button>

        {open && (
          <div
            role="menu"
            className="absolute right-0 top-full mt-1.5 w-48 rounded-[10px] border border-border bg-surface-2 overflow-hidden z-50 shadow-xl"
          >
            {MORE_ACTIONS.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                role="menuitem"
                onClick={() => setOpen(false)}
                className="flex items-center gap-2 px-3.5 py-2 text-[13px] text-text-primary hover:bg-surface-3 transition-colors focus-ring"
              >
                <Icon size={14} className="text-text-muted" />
                {label}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
