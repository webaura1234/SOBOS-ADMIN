"use client";

import Link from "next/link";
import { Plus, Receipt, LayoutGrid, Users, ArrowRight } from "lucide-react";

export function QuickActionsToolbar() {
  return (
    <div className="space-y-2">
      <div className="text-[11px] font-extrabold uppercase tracking-wider text-muted">
        Quick Actions
      </div>

      <div className="flex flex-wrap items-center gap-2.5">
        {/* + NEW ITEM - Primary Action */}
        <Link
          href="/menu?action=create"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-yellow text-black font-extrabold text-xs shadow-xs hover:bg-yellow-hover transition-all focus-ring shrink-0"
        >
          <Plus size={15} strokeWidth={2.5} />
          <span>+ New Item</span>
        </Link>

        {/* LIVE ORDERS - Secondary Action */}
        <Link
          href="/orders"
          className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-cream/40 border border-border/80 text-black font-bold text-xs hover:bg-white hover:border-yellow/60 transition-all shadow-2xs focus-ring"
        >
          <Receipt size={14} className="text-sand-dark" />
          <span>Live Orders</span>
          <ArrowRight size={13} className="text-muted" />
        </Link>

        {/* FLOOR PLAN - Secondary Action */}
        <Link
          href="/tables"
          className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-cream/40 border border-border/80 text-black font-bold text-xs hover:bg-white hover:border-yellow/60 transition-all shadow-2xs focus-ring"
        >
          <LayoutGrid size={14} className="text-sand-dark" />
          <span>Floor Plan</span>
          <ArrowRight size={13} className="text-muted" />
        </Link>

        {/* INVITE STAFF - Secondary Action */}
        <Link
          href="/staff?action=invite"
          className="inline-flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-cream/40 border border-border/80 text-black font-bold text-xs hover:bg-white hover:border-yellow/60 transition-all shadow-2xs focus-ring"
        >
          <Users size={14} className="text-sand-dark" />
          <span>Invite Staff</span>
          <ArrowRight size={13} className="text-muted" />
        </Link>
      </div>
    </div>
  );
}
