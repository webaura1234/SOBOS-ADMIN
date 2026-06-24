"use client";

import Link from "next/link";
import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { FormField, inputClass, selectClass } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { Check, ChevronRight, MapPin, Store, Table2, Upload, Users, Rocket, ShieldCheck, RotateCw } from "lucide-react";

type SetupKey = "profile" | "location" | "hours" | "tables" | "staff" | "migration";

const STEPS: { key: SetupKey; title: string; desc: string; href: string; icon: ElementType; required: boolean }[] = [
  { key: "profile", title: "Restaurant Profile", desc: "Name, FSSAI, GST, contact", href: "/settings?tab=profile", icon: Store, required: true },
  { key: "location", title: "First Location", desc: "Address, tax slab, phone", href: "/settings?tab=locations", icon: MapPin, required: true },
  { key: "hours", title: "Operating Hours", desc: "Weekly hours & closures", href: "/settings?tab=hours", icon: Check, required: true },
  { key: "tables", title: "Tables & Floor", desc: "At least one table (bulk-add)", href: "/tables", icon: Table2, required: true },
  { key: "staff", title: "Roles & Staff", desc: "Invite owner, managers, staff", href: "/staff?action=invite", icon: Users, required: false },
  { key: "migration", title: "Data Migration", desc: "Import menu, customers, inventory", href: "#", icon: Upload, required: false },
];

type SetupStatus = {
  auto: Record<SetupKey, boolean>;
  tableCount: number;
  locationCount: number;
  liveLocations: number;
  pendingLocations: number;
  restaurantName: string | null;
};

const IMPORT_ENTITIES = [
  { id: "menu", label: "Menu items", cols: "name,category,price" },
  { id: "ingredient", label: "Ingredients", cols: "name,unit,threshold" },
  { id: "customer", label: "Customers", cols: "name,phone,email" },
  { id: "supplier", label: "Suppliers", cols: "name,phone,email" },
  { id: "staff", label: "Staff (bulk invite)", cols: "phone,name,role,location" },
];

const EMPTY: Record<SetupKey, boolean> = { profile: false, location: false, hours: false, tables: false, staff: false, migration: false };

export default function SetupPage() {
  const { toast } = useToast();
  // `manual` = owner-set overrides (admin-config); `auto` = detected from real admin data.
  const [manual, setManual] = useState<Record<SetupKey, boolean>>(EMPTY);
  const [status, setStatus] = useState<SetupStatus | null>(null);
  const [activeStep, setActiveStep] = useState<SetupKey>("profile");
  const [importEntity, setImportEntity] = useState("menu");
  const [importText, setImportText] = useState("");
  const [importResult, setImportResult] = useState<{ created: number; total: number; errors: { row: number; error: string }[] } | null>(null);

  const auto = status?.auto ?? EMPTY;
  const tableCount = status?.tableCount ?? 0;
  // A step counts as done if real data satisfies it OR the owner marked it complete.
  const completed = useMemo(() => Object.fromEntries(STEPS.map((s) => [s.key, auto[s.key] || manual[s.key]])) as Record<SetupKey, boolean>, [auto, manual]);

  const doneCount = useMemo(() => Object.values(completed).filter(Boolean).length, [completed]);
  const requiredDone = STEPS.filter((s) => s.required).every((s) => completed[s.key]) && tableCount > 0;

  const refreshStatus = () => apiFetch<SetupStatus>("/api/setup/status").then(setStatus).catch(() => {});

  useEffect(() => {
    apiFetch<{ completed?: Partial<Record<SetupKey, boolean>> }>("/api/admin-config?scope=onboarding&key=progress").then((d) => setManual((c) => ({ ...c, ...d.completed }))).catch(() => {});
    refreshStatus();
  }, []);

  const saveManual = async (next: Record<SetupKey, boolean>) => { setManual(next); await apiFetch("/api/admin-config", { method: "PATCH", body: JSON.stringify({ scope: "onboarding", key: "progress", value: { completed: next } }) }); };
  const toggleStep = async (key: SetupKey) => { try { await saveManual({ ...manual, [key]: !manual[key] }); toast("Progress saved"); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  const runImport = async () => {
    const lines = importText.trim().split("\n").filter(Boolean);
    if (lines.length < 2) { toast("Add a header row + at least one data row", "error"); return; }
    const headers = lines[0].split(",").map((h) => h.trim());
    const rows = lines.slice(1).map((line) => { const cells = line.split(","); return Object.fromEntries(headers.map((h, i) => [h, (cells[i] ?? "").trim()])); });
    try {
      const res = await apiFetch<{ created: number; total: number; errors: { row: number; error: string }[] }>("/api/setup/import", { method: "POST", body: JSON.stringify({ entity: importEntity, rows }) });
      setImportResult(res); toast(`${res.created}/${res.total} imported`);
      if (res.created > 0) refreshStatus();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const goLive = async () => {
    try { const r = await apiFetch<{ activated: number }>("/api/setup/import", { method: "PATCH" }); toast(`Setup complete — ${r.activated} location(s) now live`); refreshStatus(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const step = STEPS.find((s) => s.key === activeStep)!;
  const entity = IMPORT_ENTITIES.find((e) => e.id === importEntity)!;

  return (
    <div>
      <PageHeader title="Setup / Onboarding" subtitle="Guided wizard — finish required steps, import data, then go live" />

      <div className="bg-white border-2 border-border rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div><h2 className="text-xl font-bold">Launch Checklist</h2><p className="text-sm font-semibold text-muted">{doneCount} of {STEPS.length} steps · {status?.locationCount ?? 0} location(s) · {tableCount} table(s){status && status.liveLocations > 0 ? ` · ${status.liveLocations} live` : ""}</p></div>
          <span className="text-3xl font-bold">{Math.round((doneCount / STEPS.length) * 100)}%</span>
        </div>
        <div className="h-4 rounded-full bg-cream border-2 border-border overflow-hidden"><div className="h-full bg-primary transition-all" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} /></div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4">
        {/* Stepper rail */}
        <div className="space-y-2">
          {STEPS.map((s, i) => {
            const Icon = s.icon; const done = completed[s.key];
            return (
              <button key={s.key} type="button" onClick={() => setActiveStep(s.key)} className={cn("w-full text-left p-3 rounded-xl border-2 flex items-center gap-3 focus-ring", activeStep === s.key ? "border-primary bg-primary/10" : "border-border bg-white hover:bg-cream")}>
                <span className={cn("w-8 h-8 rounded-full border-2 flex items-center justify-center shrink-0", done ? "bg-primary border-primary" : "bg-cream border-border")}>{done ? <Check size={16} strokeWidth={3} /> : <span className="font-bold text-sm">{i + 1}</span>}</span>
                <span className="min-w-0"><span className="flex items-center gap-1.5 font-bold text-sm"><Icon size={14} />{s.title}</span><span className="block text-xs text-muted truncate">{s.desc}</span></span>
              </button>
            );
          })}
        </div>

        {/* Step panel */}
        <div className="page-surface p-5">
          <div className="flex items-center gap-2 mb-2 flex-wrap"><step.icon size={20} /><h2 className="text-xl font-bold">{step.title}</h2>{step.required && <span className="text-xs px-2 py-0.5 rounded bg-cream border border-border font-bold">required</span>}{auto[activeStep] ? <span className="text-xs px-2 py-0.5 rounded bg-green-100 border border-green-300 text-green-800 font-bold inline-flex items-center gap-1"><Check size={12} strokeWidth={3} /> Detected from your data</span> : <span className="text-xs px-2 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-800 font-bold">Not detected yet</span>}</div>
          <p className="text-muted font-medium mb-4">{step.desc}</p>

          {activeStep === "migration" ? (
            <div className="space-y-3">
              <FormField label="What to import"><select className={selectClass} value={importEntity} onChange={(e) => { setImportEntity(e.target.value); setImportResult(null); }}>{IMPORT_ENTITIES.map((e) => <option key={e.id} value={e.id}>{e.label}</option>)}</select></FormField>
              <p className="text-sm text-muted font-medium">First line = header row. Columns: <code className="bg-cream px-1 rounded">{entity.cols}</code></p>
              <textarea className={`${inputClass} min-h-40 font-mono text-sm`} value={importText} onChange={(e) => setImportText(e.target.value)} placeholder={`${entity.cols}\n...`} />
              <BtnPrimary onClick={runImport}><Upload size={18} /> Import {entity.label}</BtnPrimary>
              {importResult && (
                <div className="mt-2"><h3 className="font-bold mb-1">{importResult.created}/{importResult.total} imported</h3>
                  {importResult.errors.length > 0 && <ul className="space-y-1 text-sm max-h-48 overflow-auto">{importResult.errors.map((e) => <li key={e.row} className="p-2 bg-red-50 rounded-lg flex justify-between"><span>Row {e.row}</span><span className="font-bold text-red-700">{e.error}</span></li>)}</ul>}
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <Link href={step.href} className="inline-flex items-center gap-2 h-11 px-5 rounded-xl border-2 border-primary bg-primary/15 font-bold focus-ring">Open {step.title} <ChevronRight size={16} /></Link>
              {activeStep === "tables" && tableCount === 0 && <p className="text-sm font-bold text-amber-700">At least one table is required before going live — use Bulk Add on the Tables page.</p>}
            </div>
          )}

          <div className="flex items-center gap-3 mt-6 pt-4 border-t border-border flex-wrap">
            <BtnSecondary onClick={() => { refreshStatus(); toast("Re-checked admin data"); }}><RotateCw size={16} /> Re-check</BtnSecondary>
            {auto[activeStep] ? (
              <span className="text-sm font-semibold text-muted">Auto-completed from your admin data — no action needed.</span>
            ) : (
              <BtnSecondary onClick={() => toggleStep(activeStep)}>{manual[activeStep] ? "Mark incomplete" : "Mark step complete"}</BtnSecondary>
            )}
          </div>
        </div>
      </div>

      <div className={cn("mt-5 p-5 rounded-2xl border-2 flex flex-wrap items-center justify-between gap-3", requiredDone ? "border-green-300 bg-green-50" : "border-border bg-cream")}>
        <div className="flex items-center gap-3">
          {requiredDone ? <ShieldCheck size={28} className="text-green-600" /> : <Rocket size={28} className="text-muted" />}
          <div><div className="font-bold text-lg">{requiredDone ? "Ready to go live" : "Complete required steps to go live"}</div><div className="text-sm text-muted font-medium">Required: profile, location, hours, and ≥1 table.{status && status.pendingLocations > 0 ? ` ${status.pendingLocations} location(s) awaiting activation.` : status && status.liveLocations > 0 && status.pendingLocations === 0 ? " All locations are live." : ""}</div></div>
        </div>
        <BtnPrimary onClick={goLive} disabled={!requiredDone} className={!requiredDone ? "opacity-50 cursor-not-allowed" : ""}><Rocket size={18} /> Complete Setup & Go Live</BtnPrimary>
      </div>
    </div>
  );
}
