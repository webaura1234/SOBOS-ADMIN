"use client";

import { useEffect, useState } from "react";
import { Command } from "cmdk";
import { useRouter } from "next/navigation";
import { useApp } from "@/lib/context";
import { useEntitySearch, SEARCH_TYPE_LABELS } from "@/lib/use-entity-search";
import {
  Home, Search, Loader2, UtensilsCrossed, LayoutGrid, Package, Receipt, CreditCard,
  Users, BarChart3, Gift, Plug, Settings, Shield,
} from "lucide-react";

const ICONS: Record<string, React.ElementType> = {
  Home, UtensilsCrossed, LayoutGrid, Package, Receipt, CreditCard,
  Users, BarChart3, Gift, Plug, Settings, Shield,
};

const COMMANDS = [
  { id: "go-dashboard", label: "Go to Dashboard", href: "/dashboard", group: "Navigation" },
  { id: "go-menu", label: "Go to Menu & Recipe", href: "/menu", group: "Navigation" },
  { id: "go-inventory", label: "Go to Inventory", href: "/inventory", group: "Navigation" },
  { id: "go-tables", label: "Go to Tables & Floor", href: "/tables", group: "Navigation" },
  { id: "go-orders", label: "Go to Live Orders", href: "/orders", group: "Navigation" },
  { id: "go-staff", label: "Go to Staff & Labor", href: "/staff", group: "Navigation" },
  { id: "go-analytics", label: "Go to Analytics", href: "/analytics", group: "Navigation" },
  { id: "go-customers", label: "Go to Customers & Loyalty", href: "/customers", group: "Navigation" },
  { id: "new-menu-item", label: "New menu item", href: "/menu?action=create", group: "Actions" },
  { id: "invite-staff", label: "Invite staff member", href: "/staff?action=invite", group: "Actions" },
  { id: "log-wastage", label: "Log food wastage", href: "/inventory?tab=wastage", group: "Actions" },
  { id: "fssai-report", label: "Export FSSAI batch report", href: "/audit?tab=fssai", group: "Actions" },
  { id: "shortcuts", label: "Keyboard shortcuts", href: "#shortcuts", group: "Help" },
];

export function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setShortcutsOpen, locationId } = useApp();
  const router = useRouter();
  const [search, setSearch] = useState("");
  const { results, loading } = useEntitySearch(search, locationId, commandPaletteOpen);

  useEffect(() => {
    if (!commandPaletteOpen) setSearch("");
  }, [commandPaletteOpen]);

  if (!commandPaletteOpen) return null;

  const navigate = (href: string) => {
    setCommandPaletteOpen(false);
    setSearch("");
    if (href === "#shortcuts") {
      setShortcutsOpen(true);
      return;
    }
    router.push(href);
  };

  const filteredCommands = search.trim().length < 2
    ? COMMANDS
    : COMMANDS.filter((c) => c.label.toLowerCase().includes(search.toLowerCase()));

  const commandGroups = [...new Set(filteredCommands.map((c) => c.group))];
  const entityGroups = results.reduce<Record<string, typeof results>>((acc, r) => {
    const key = SEARCH_TYPE_LABELS[r.type];
    (acc[key] ??= []).push(r);
    return acc;
  }, {});

  return (
    <div className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/40" onClick={() => setCommandPaletteOpen(false)}>
      <div className="w-full max-w-xl bg-white rounded-2xl shadow-2xl border-2 border-border overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <Command label="Command palette" shouldFilter={false}>
          <div className="flex items-center gap-2 px-4 border-b-2 border-border">
            <Search size={18} className="text-muted shrink-0" />
            <Command.Input
              value={search}
              onValueChange={setSearch}
              placeholder="Commands or search records…"
              className="flex-1 h-14 bg-transparent text-base font-semibold outline-none"
              autoFocus
            />
            {loading && <Loader2 size={18} className="animate-spin text-muted shrink-0" />}
            <kbd className="text-xs text-muted bg-cream px-2 py-1 rounded-lg font-bold border border-border">ESC</kbd>
          </div>
          <Command.List className="max-h-[min(420px,60vh)] overflow-auto p-2 scrollbar-thin">
            {search.trim().length >= 2 && results.length === 0 && filteredCommands.length === 0 && !loading && (
              <Command.Empty className="py-8 text-center text-sm text-muted font-medium">No matches.</Command.Empty>
            )}

            {Object.entries(entityGroups).map(([group, items]) => (
              <Command.Group key={group} heading={group} className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                {items.map((item) => (
                  <Command.Item
                    key={`${item.type}-${item.id}`}
                    value={`${item.label} ${item.sublabel ?? ""}`}
                    onSelect={() => navigate(item.href)}
                    className="flex flex-col gap-0.5 px-3 py-3 rounded-xl cursor-pointer aria-selected:bg-primary/20"
                  >
                    <span className="font-bold text-black">{item.label}</span>
                    {item.sublabel && <span className="text-xs text-muted font-medium">{item.sublabel}</span>}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}

            {commandGroups.map((group) => (
              <Command.Group key={group} heading={group} className="[&_[cmdk-group-heading]]:text-xs [&_[cmdk-group-heading]]:font-bold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wide [&_[cmdk-group-heading]]:text-muted [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-2">
                {filteredCommands.filter((c) => c.group === group).map((cmd) => (
                  <Command.Item
                    key={cmd.id}
                    value={cmd.label}
                    onSelect={() => navigate(cmd.href)}
                    className="px-3 py-2.5 rounded-xl text-base font-semibold cursor-pointer aria-selected:bg-cream"
                  >
                    {cmd.label}
                  </Command.Item>
                ))}
              </Command.Group>
            ))}
          </Command.List>
        </Command>
      </div>
    </div>
  );
}

export function NavIcon({ name, size = 18 }: { name: string; size?: number }) {
  const Icon = ICONS[name] ?? Home;
  return <Icon size={size} />;
}
