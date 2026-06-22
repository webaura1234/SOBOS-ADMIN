"use client";

import Link from "next/link";
import type { ElementType } from "react";
import { useEffect, useMemo, useState } from "react";
import { PageHeader, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { FormField, inputClass } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { Check, ChevronRight, MapPin, Store, Table2, Upload, Users } from "lucide-react";

type SetupKey = "profile" | "location" | "hours" | "tables" | "staff" | "migration";

const STEPS: { key: SetupKey; title: string; desc: string; href: string; icon: ElementType }[] = [
  { key: "profile", title: "Restaurant Profile", desc: "Name, FSSAI, GST, owner contact", href: "/settings", icon: Store },
  { key: "location", title: "Location", desc: "Branch address, tax slab, phone", href: "/settings", icon: MapPin },
  { key: "hours", title: "Operating Hours", desc: "Weekly opening hours and closures", href: "/settings", icon: Check },
  { key: "tables", title: "Tables & Floor", desc: "Sections, QR labels, capacities", href: "/tables", icon: Table2 },
  { key: "staff", title: "Staff Invites", desc: "Owner, managers, cashiers, kitchen", href: "/staff?action=invite", icon: Users },
  { key: "migration", title: "Migration", desc: "Import menu, customers, inventory", href: "/menu", icon: Upload },
];

export default function SetupPage() {
  const { toast } = useToast();
  const [completed, setCompleted] = useState<Record<SetupKey, boolean>>({
    profile: false,
    location: false,
    hours: false,
    tables: false,
    staff: false,
    migration: false,
  });
  const [migrationNote, setMigrationNote] = useState("");
  const doneCount = useMemo(() => Object.values(completed).filter(Boolean).length, [completed]);

  useEffect(() => {
    apiFetch<{ completed?: Partial<Record<SetupKey, boolean>>; migrationNote?: string }>("/api/admin-config?scope=onboarding&key=progress")
      .then((data) => {
        setCompleted((current) => ({ ...current, ...data.completed }));
        setMigrationNote(typeof data.migrationNote === "string" ? data.migrationNote : "");
      })
      .catch(() => {});
  }, []);

  const saveProgress = async (next: Record<SetupKey, boolean>, note = migrationNote) => {
    setCompleted(next);
    await apiFetch("/api/admin-config", {
      method: "PATCH",
      body: JSON.stringify({ scope: "onboarding", key: "progress", value: { completed: next, migrationNote: note } }),
    });
  };

  const toggleStep = async (key: SetupKey) => {
    try {
      await saveProgress({ ...completed, [key]: !completed[key] });
      toast("Setup progress saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save progress", "error");
    }
  };

  const saveMigration = async () => {
    try {
      await saveProgress({ ...completed, migration: true }, migrationNote);
      toast("Migration plan saved");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save migration plan", "error");
    }
  };

  return (
    <div>
      <PageHeader title="Setup / Onboarding" subtitle="Profile → location → hours → tables → staff → migration" />

      <div className="bg-white border-2 border-border rounded-2xl p-5 mb-5">
        <div className="flex items-center justify-between gap-4 mb-3">
          <div>
            <h2 className="text-xl font-bold text-black">Launch Checklist</h2>
            <p className="text-sm font-semibold text-muted">{doneCount} of {STEPS.length} steps complete</p>
          </div>
          <span className="text-3xl font-bold text-black">{Math.round((doneCount / STEPS.length) * 100)}%</span>
        </div>
        <div className="h-4 rounded-full bg-cream border-2 border-border overflow-hidden">
          <div className="h-full bg-primary transition-all" style={{ width: `${(doneCount / STEPS.length) * 100}%` }} />
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {STEPS.map((step) => {
          const Icon = step.icon;
          const complete = completed[step.key];
          return (
            <div key={step.key} className="bg-white border-2 border-border rounded-2xl p-5">
              <div className="flex items-start gap-4">
                <button
                  type="button"
                  onClick={() => toggleStep(step.key)}
                  className={`mt-1 w-8 h-8 rounded-full border-2 flex items-center justify-center focus-ring ${complete ? "bg-primary border-primary" : "bg-cream border-border"}`}
                  aria-label={`Mark ${step.title} ${complete ? "incomplete" : "complete"}`}
                >
                  {complete && <Check size={18} strokeWidth={3} />}
                </button>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <Icon size={20} className="text-muted" />
                    <h3 className="font-bold text-lg text-black">{step.title}</h3>
                  </div>
                  <p className="text-sm font-semibold text-muted mb-4">{step.desc}</p>
                  <Link href={step.href} className="inline-flex items-center gap-2 h-10 px-4 rounded-xl border-2 border-border bg-cream font-bold text-black hover:bg-white focus-ring">
                    Open {step.title} <ChevronRight size={16} />
                  </Link>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="bg-white border-2 border-border rounded-2xl p-5 mt-5 max-w-2xl">
        <FormField label="Migration Notes" hint="Track source POS files, imported CSVs, and pending clean-up before launch.">
          <textarea className={`${inputClass} min-h-28`} value={migrationNote} onChange={(e) => setMigrationNote(e.target.value)} />
        </FormField>
        <div className="flex gap-3 mt-4">
          <BtnPrimary onClick={saveMigration}><Check size={18} /> Save Migration Plan</BtnPrimary>
          <BtnSecondary onClick={() => saveProgress({ profile: true, location: true, hours: true, tables: true, staff: true, migration: true }).then(() => toast("Setup marked complete"))}>
            Mark All Complete
          </BtnSecondary>
        </div>
      </div>
    </div>
  );
}
