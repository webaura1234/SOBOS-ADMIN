"use client";

import { useEffect, useState } from "react";
import { useDebouncedValue } from "@/lib/use-debounce";
import { apiFetch } from "@/lib/toast";
import type { SearchResult } from "@/app/api/search/route";

export function useEntitySearch(query: string, locationId: string | null, enabled = true) {
  const debounced = useDebouncedValue(query, 250);
  const [results, setResults] = useState<SearchResult[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || debounced.trim().length < 2) {
      setResults([]);
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    const params = new URLSearchParams({ q: debounced.trim() });
    if (locationId) params.set("locationId", locationId);

    apiFetch<{ results: SearchResult[] }>(`/api/search?${params}`)
      .then((data) => {
        if (!cancelled) setResults(data.results ?? []);
      })
      .catch(() => {
        if (!cancelled) setResults([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [debounced, locationId, enabled]);

  return { results, loading, debounced };
}

export const SEARCH_TYPE_LABELS: Record<SearchResult["type"], string> = {
  order: "Orders",
  menu: "Menu",
  customer: "Customers",
  staff: "Staff",
  inventory: "Inventory",
};
