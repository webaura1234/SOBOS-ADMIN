"use client";

import { useEffect, useState } from "react";
import { apiFetch, useToast } from "@/lib/toast";
import { BtnSecondary } from "./shared";
import { inputClass } from "./forms";
import { Bookmark, Star, Trash2 } from "lucide-react";

interface SavedView<TFilters> {
  id: string;
  name: string;
  filters: TFilters;
  isDefault: boolean;
}

interface SavedViewsBarProps<TFilters extends Record<string, unknown>> {
  module: string;
  currentFilters: TFilters;
  onApply: (filters: TFilters) => void;
}

export function SavedViewsBar<TFilters extends Record<string, unknown>>({ module, currentFilters, onApply }: SavedViewsBarProps<TFilters>) {
  const { toast } = useToast();
  const [views, setViews] = useState<SavedView<TFilters>[]>([]);
  const [name, setName] = useState("");
  const [saveAsDefault, setSaveAsDefault] = useState(false);

  const load = async () => {
    const data = await apiFetch<{ views: SavedView<TFilters>[] }>(`/api/saved-views?module=${encodeURIComponent(module)}`);
    setViews(data.views);
  };

  useEffect(() => {
    load().catch(() => {});
  }, [module]);

  const save = async () => {
    if (!name.trim()) {
      toast("Saved view name is required", "error");
      return;
    }
    try {
      await apiFetch("/api/saved-views", {
        method: "POST",
        body: JSON.stringify({ module, name: name.trim(), filters: currentFilters, isDefault: saveAsDefault }),
      });
      toast("Saved view created");
      setName("");
      setSaveAsDefault(false);
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save view", "error");
    }
  };

  const remove = async (id: string) => {
    try {
      await apiFetch(`/api/saved-views?id=${id}`, { method: "DELETE" });
      toast("Saved view deleted");
      load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to delete view", "error");
    }
  };

  return (
    <div className="mb-4 p-3 bg-surface-1 border border-border rounded-2xl">
      <div className="flex flex-col lg:flex-row gap-3 lg:items-center">
        <div className="flex items-center gap-2 font-bold text-text-primary shrink-0">
          <Bookmark size={18} className="text-yellow" /> Saved views
        </div>
        <div className="flex gap-2 overflow-x-auto scrollbar-thin flex-1">
          {views.map((view) => (
            <span key={view.id} className="inline-flex items-center gap-1.5 h-10 px-3 bg-surface-2 border border-border rounded-xl shrink-0">
              <button type="button" onClick={() => onApply(view.filters)} className="font-bold text-sm text-text-primary hover:text-yellow focus-ring rounded">
                {view.isDefault && <Star size={13} className="inline mr-1 text-yellow" fill="currentColor" />} {view.name}
              </button>
              <button type="button" onClick={() => remove(view.id)} className="text-red hover:text-red/80 focus-ring rounded" aria-label={`Delete ${view.name}`}>
                <Trash2 size={14} />
              </button>
            </span>
          ))}
        </div>
        <div className="flex gap-2 lg:w-[420px]">
          <input className={`${inputClass} h-10`} placeholder="Save current filters as…" value={name} onChange={(e) => setName(e.target.value)} />
          <label className="inline-flex items-center gap-1.5 px-2 text-xs font-bold text-text-muted whitespace-nowrap">
            <input type="checkbox" checked={saveAsDefault} onChange={(e) => setSaveAsDefault(e.target.checked)} className="accent-[#FED500]" />
            Default
          </label>
          <BtnSecondary onClick={save}>Save</BtnSecondary>
        </div>
      </div>
    </div>
  );
}
