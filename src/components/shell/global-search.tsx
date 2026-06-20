"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import { Search, Loader2 } from "lucide-react";
import { useApp } from "@/lib/context";
import { NAV_ITEMS } from "@/lib/utils";
import { useEntitySearch, SEARCH_TYPE_LABELS } from "@/lib/use-entity-search";
import type { SearchResult } from "@/app/api/search/route";

const QUICK_ACTIONS = [
  { label: "New menu item", href: "/menu?action=create" },
  { label: "Invite staff", href: "/staff?action=invite" },
  { label: "View live orders", href: "/orders" },
  { label: "Low stock inventory", href: "/inventory?filter=low" },
  { label: "FSSAI batch report", href: "/audit?tab=fssai" },
];

export function GlobalSearch() {
  const { globalSearchOpen, setGlobalSearchOpen, locationId } = useApp();
  const router = useRouter();
  const [query, setQuery] = useState("");
  const { results, loading } = useEntitySearch(query, locationId, globalSearchOpen);

  if (!globalSearchOpen) return null;

  const navigate = (href: string) => {
    setGlobalSearchOpen(false);
    setQuery("");
    router.push(href);
  };

  const grouped = results.reduce<Record<string, SearchResult[]>>((acc, r) => {
    const key = SEARCH_TYPE_LABELS[r.type];
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/40" onClick={() => setGlobalSearchOpen(false)}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border-2 border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <Command label="Global search" shouldFilter={false}>
          <div className="flex items-center gap-2 px-4 border-b-2 border-border">
            <Search size={20} className="text-muted shrink-0" />
            <Command.Input
              value={query}
              onValueChange={setQuery}
              placeholder="Search orders, menu, customers, staff, inventory…"
              className="flex-1 h-14 bg-transparent text-base font-semibold outline-none"
              autoFocus
            />
            {loading && <Loader2 size={18} className="animate-spin text-muted shrink-0" />}
            <kbd className="text-xs text-muted bg-cream px-2 py-1 rounded-lg font-bold border border-border">ESC</kbd>
          </div>
          <Command.List className="max-h-[min(420px,60vh)] overflow-auto p-2 scrollbar-thin">
            {query.trim().length >= 2 && results.length === 0 && !loading && (
              <Command.Empty className="py-8 text-center text-sm text-muted font-medium">No records found for “{query}”.</Command.Empty>
            )}

            {Object.entries(grouped).map(([group, items]) => (
              <Command.Group key={group} heading={group} className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                {items.map((item) => (
                  <Command.Item
                    key={`${item.type}-${item.id}`}
                    value={`${item.label} ${item.sublabel ?? ""}`}
                    onSelect={() => navigate(item.href)}
                    className="flex flex-col gap-0.5 px-3 py-3 rounded-xl text-sm cursor-pointer aria-selected:bg-primary/20"
                  >
                    <span className="font-bold text-black">{item.label}</span>
                    {item.sublabel && <span className="text-xs text-muted font-medium">{item.sublabel}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}

            {query.trim().length < 2 && (
              <>
                <Command.Group heading="Quick actions" className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                  {QUICK_ACTIONS.map((a) => (
                    <Command.Item
                      key={a.href}
                      value={a.label}
                      onSelect={() => navigate(a.href)}
                      className="px-3 py-2.5 rounded-xl text-sm font-semibold cursor-pointer aria-selected:bg-cream"
                    >
                      {a.label}
                    </Command.Item>
                  ))}
                </Command.Group>
                <Command.Group heading="Pages" className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                  {NAV_ITEMS.map((item) => (
                    <Command.Item
                      key={item.href}
                      value={item.label}
                      onSelect={() => navigate(item.href)}
                      className="px-3 py-2.5 rounded-xl text-sm font-semibold cursor-pointer aria-selected:bg-cream"
                    >
                      {item.label}
                    </Command.Item>
                  ))}
                </Command.Group>
              </>
            )}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
