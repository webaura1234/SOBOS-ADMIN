"use client";

import { useApp } from "@/lib/context";

const SHORTCUTS = [
  { keys: ["⌘", "K"], desc: "Command palette — search & quick actions" },
  { keys: ["/"], desc: "Global search — find orders, menu, guests" },
  { keys: ["?"], desc: "Show keyboard shortcuts" },
  { keys: ["Esc"], desc: "Close dialogs and drawers" },
];

export function KeyboardShortcuts() {
  const { shortcutsOpen, setShortcutsOpen } = useApp();
  if (!shortcutsOpen) return null;

  return (
    <div className="fixed inset-0 z-[110] flex items-center justify-center bg-black/40 p-4" onClick={() => setShortcutsOpen(false)}>
      <div
        className="w-full max-w-md bg-white border-2 border-border rounded-2xl shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="shortcuts-title"
      >
        <div className="px-5 py-4 border-b-2 border-border bg-cream">
          <h2 id="shortcuts-title" className="font-bold text-xl text-black">Keyboard shortcuts</h2>
          <p className="text-sm text-muted font-medium mt-1">Work faster across Sobos admin</p>
        </div>
        <ul className="p-3 space-y-1">
          {SHORTCUTS.map((s) => (
            <li key={s.desc} className="flex items-center justify-between gap-4 px-3 py-3 rounded-xl hover:bg-cream">
              <span className="text-sm font-semibold text-black">{s.desc}</span>
              <span className="flex items-center gap-1 shrink-0">
                {s.keys.map((k, i) => (
                  <kbd key={i} className="min-w-[28px] text-center bg-cream border-2 border-border rounded-lg px-2 py-1 text-xs font-bold text-black">
                    {k}
                  </kbd>
                ))}
              </span>
            </li>
          ))}
        </ul>
        <div className="px-5 py-3 border-t-2 border-border text-xs text-muted font-medium text-center">
          Press <kbd className="bg-cream px-1.5 py-0.5 rounded border border-border font-bold">?</kbd> anytime to toggle this panel
        </div>
      </div>
    </div>
  );
}
