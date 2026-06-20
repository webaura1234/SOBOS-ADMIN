"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useApp } from "@/lib/context";
import { MOBILE_NAV, NAV_ITEMS, SITE_NAME } from "@/lib/utils";
import { NavIcon } from "./command-palette";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";

export function MobileNav() {
  const pathname = usePathname();
  const { mobileMenuOpen, setMobileMenuOpen } = useApp();

  return (
    <>
      <nav className="lg:hidden fixed bottom-0 inset-x-0 z-40 bg-white border-t-2 border-border flex items-stretch shadow-lg" aria-label="Mobile navigation">
        {MOBILE_NAV.map((item) => {
          if (item.href === "#menu") {
            return (
              <button
                key={item.label}
                type="button"
                onClick={() => setMobileMenuOpen(true)}
                className="flex-1 flex flex-col items-center justify-center py-2.5 text-muted min-h-[56px] focus-ring"
                aria-label="Open module menu"
              >
                <NavIcon name={item.icon} size={24} />
                <span className="text-xs font-bold mt-1">{item.label}</span>
              </button>
            );
          }
          const active = pathname.startsWith(item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-2.5 min-h-[56px] focus-ring",
                active ? "text-black" : "text-muted",
                "isAction" in item && item.isAction && "text-black"
              )}
            >
              <div className={cn("p-1 rounded-xl", active && "bg-primary")}>
                <NavIcon name={item.icon} size={24} />
              </div>
              <span className="text-xs font-bold mt-0.5">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      {mobileMenuOpen && (
        <div className="lg:hidden fixed inset-0 z-50 bg-black/40" onClick={() => setMobileMenuOpen(false)}>
          <div
            className="absolute bottom-0 inset-x-0 bg-white rounded-t-3xl max-h-[75vh] overflow-auto p-5 pb-10"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-5">
              <h2 className="font-bold text-lg text-black">{SITE_NAME}</h2>
              <button type="button" onClick={() => setMobileMenuOpen(false)} className="p-2 rounded-xl hover:bg-cream focus-ring" aria-label="Close menu">
                <X size={24} />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {NAV_ITEMS.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center gap-3 p-4 rounded-xl border-2 border-border hover:bg-cream focus-ring text-base font-semibold text-black"
                >
                  <NavIcon name={item.icon} size={22} />
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
