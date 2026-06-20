export type Density = "comfortable" | "standard" | "compact";

export const DENSITY_STORAGE_KEY = "density";

export const DENSITY_OPTIONS: { id: Density; label: string; desc: string }[] = [
  { id: "comfortable", label: "Large", desc: "Easiest to read" },
  { id: "standard", label: "Medium", desc: "Balanced" },
  { id: "compact", label: "Small", desc: "More on screen" },
];

export function isDensity(value: string | null | undefined): value is Density {
  return value === "comfortable" || value === "standard" || value === "compact";
}

export function readStoredDensity(): Density {
  if (typeof window === "undefined") return "comfortable";
  try {
    const saved = localStorage.getItem(DENSITY_STORAGE_KEY);
    return isDensity(saved) ? saved : "comfortable";
  } catch {
    return "comfortable";
  }
}

export function applyDensity(d: Density) {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.density = d;
}

export function persistDensity(d: Density) {
  try {
    localStorage.setItem(DENSITY_STORAGE_KEY, d);
  } catch {
    /* private browsing */
  }
}
