"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { FilterBar, PageHeader, TabBar, LabeledFilterSelect, BtnSecondary } from "@/components/ui/shared";
import { exportCsv } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { format } from "date-fns";
import { Download, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditLog { id: string; actorName: string; action: string; resourceType: string; resourceId: string | null; beforeJson: string | null; afterJson: string | null; ip: string | null; createdAt: string; priority: boolean; }
interface Facets { actors: string[]; actions: string[]; resources: string[]; }
interface Fssai { id: string; number: string; ingredient: string; supplier: string | null; fssaiLicense: string | null; mfgDate: string | null; expiryDate: string | null; qtyReceived: number; currentStock: number; consumed: number; flag: string; }

const FLAG_PILL: Record<string, string> = { incomplete: "bg-red-100 text-red-700", expired: "bg-red-100 text-red-700", approaching: "bg-amber-100 text-amber-800", compliant: "bg-green-100 text-green-700" };
const FLAG_LABEL: Record<string, string> = { incomplete: "🔴 Incomplete", expired: "🔴 Expired", approaching: "🟡 Approaching", compliant: "🟢 Compliant" };

export default function AuditPage() {
  return <Suspense fallback={<div className="animate-pulse h-32 bg-cream rounded-xl" />}><AuditPageContent /></Suspense>;
}

function AuditPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [facets, setFacets] = useState<Facets>({ actors: [], actions: [], resources: [] });
  const [highPriority, setHighPriority] = useState<AuditLog[]>([]);
  const [fssai, setFssai] = useState<Fssai[]>([]);
  const [search, setSearch] = useState("");
  const [actor, setActor] = useState("");
  const [action, setAction] = useState("");
  const [resource, setResource] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [tab, setTab] = useState("audit");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    if (actor) params.set("actor", actor);
    if (action) params.set("action", action);
    if (resource) params.set("resource", resource);
    if (from) params.set("from", from);
    if (to) params.set("to", to);
    const d = await apiFetch<{ logs: AuditLog[]; facets: Facets; highPriority: AuditLog[]; fssai: Fssai[] }>(`/api/audit?${params}`);
    setLogs(d.logs); setFacets(d.facets); setHighPriority(d.highPriority); setFssai(d.fssai);
  }, [search, actor, action, resource, from, to]);
  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [load, toast]);
  useEffect(() => { if (searchParams.get("tab") === "fssai") setTab("fssai"); }, [searchParams]);

  const exportFssai = () => {
    exportCsv("fssai-compliance.csv", ["Batch", "Ingredient", "Supplier", "FSSAI", "Mfg", "Expiry", "Received", "Current", "Consumed", "Status"],
      fssai.map((b) => [b.number, b.ingredient, b.supplier ?? "", b.fssaiLicense ?? "", b.mfgDate?.slice(0, 10) ?? "", b.expiryDate?.slice(0, 10) ?? "", b.qtyReceived, b.currentStock, b.consumed, b.flag]));
    toast("FSSAI report exported (PDF: use browser print)");
  };

  const logCols: Column<AuditLog>[] = [
    { key: "time", header: "Time", render: (r) => format(new Date(r.createdAt), "dd MMM HH:mm:ss") },
    { key: "actor", header: "Actor", render: (r) => <span className="inline-flex items-center gap-1.5">{r.priority && <AlertTriangle size={13} className="text-amber-600" />}{r.actorName}</span> },
    { key: "action", header: "Action" },
    { key: "resource", header: "Resource", render: (r) => r.resourceType },
    { key: "ip", header: "IP", render: (r) => <span className="text-muted text-sm tabular-nums">{r.ip ?? "—"}</span> },
  ];

  return (
    <div>
      <PageHeader title="Audit & Compliance" subtitle="Immutable audit trail (view-only) + FSSAI compliance report"
        actions={tab === "fssai" ? <BtnSecondary onClick={exportFssai}><Download size={18} /> Export FSSAI</BtnSecondary> : undefined} />
      <TabBar tabs={[{ id: "audit", label: "Audit Trail" }, { id: "fssai", label: "FSSAI Report" }]} active={tab} onChange={setTab} />

      {tab === "audit" && (
        <>
          {highPriority.length > 0 && (
            <div className="page-surface p-4 mb-4 border-2 border-amber-200">
              <h3 className="font-bold mb-2 flex items-center gap-2"><AlertTriangle size={16} className="text-amber-600" /> High-priority events</h3>
              <ul className="flex flex-wrap gap-2">{highPriority.map((l) => (
                <li key={l.id}><button type="button" onClick={() => setSelectedLog(l)} className="px-3 py-1.5 rounded-lg bg-amber-50 border-2 border-amber-200 text-sm font-bold hover:bg-amber-100">{l.action} · {l.resourceType} <span className="text-muted font-medium">{format(new Date(l.createdAt), "HH:mm")}</span></button></li>
              ))}</ul>
            </div>
          )}
          <FilterBar search={search} onSearchChange={setSearch} placeholder="Search actor / resource / id…" />
          <div className="flex flex-wrap items-center gap-2 mb-4">
            <LabeledFilterSelect id="f-actor" label="Actor" value={actor} onChange={setActor} options={[{ value: "", label: "All" }, ...facets.actors.map((a) => ({ value: a, label: a }))]} />
            <LabeledFilterSelect id="f-action" label="Action" value={action} onChange={setAction} options={[{ value: "", label: "All" }, ...facets.actions.map((a) => ({ value: a, label: a }))]} />
            <LabeledFilterSelect id="f-resource" label="Resource" value={resource} onChange={setResource} options={[{ value: "", label: "All" }, ...facets.resources.map((a) => ({ value: a, label: a }))]} />
            <input type="date" className="h-10 px-3 border-2 border-border rounded-xl font-bold text-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From date" />
            <span className="text-muted">–</span>
            <input type="date" className="h-10 px-3 border-2 border-border rounded-xl font-bold text-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To date" />
          </div>
          <DenseGrid columns={logCols} data={logs} selectable={false} onRowClick={setSelectedLog} emptyMessage="No audit entries match" />
          {selectedLog && (
            <div className="mt-4 p-4 bg-white border-2 border-border rounded-xl">
              <h3 className="font-bold mb-3">Change Detail — {selectedLog.action} {selectedLog.resourceType} {selectedLog.resourceId ? `(${selectedLog.resourceId})` : ""}</h3>
              <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                <div><p className="font-bold mb-1">Before</p><pre className="bg-cream p-3 rounded-lg overflow-auto max-h-72">{selectedLog.beforeJson ? JSON.stringify(JSON.parse(selectedLog.beforeJson), null, 2) : "—"}</pre></div>
                <div><p className="font-bold mb-1">After</p><pre className="bg-cream p-3 rounded-lg overflow-auto max-h-72">{selectedLog.afterJson ? JSON.stringify(JSON.parse(selectedLog.afterJson), null, 2) : "—"}</pre></div>
              </div>
              <p className="text-xs text-muted mt-2">Audit log is immutable — entries can&apos;t be edited or deleted. Export is platform-admin only.</p>
            </div>
          )}
        </>
      )}

      {tab === "fssai" && (
        <>
          <div className="flex flex-wrap gap-2 mb-4">{["compliant", "approaching", "expired", "incomplete"].map((f) => {
            const count = fssai.filter((b) => b.flag === f).length;
            return <span key={f} className={cn("px-3 py-1.5 rounded-lg text-sm font-bold", FLAG_PILL[f])}>{FLAG_LABEL[f]}: {count}</span>;
          })}</div>
          <DenseGrid columns={[
            { key: "number", header: "Batch #" },
            { key: "ingredient", header: "Ingredient" },
            { key: "supplier", header: "Supplier", render: (r: Fssai) => r.supplier ?? "—" },
            { key: "fssai", header: "Supplier FSSAI", render: (r: Fssai) => r.fssaiLicense ?? <span className="text-red-600 font-bold">missing</span> },
            { key: "expiry", header: "Expiry", render: (r: Fssai) => r.expiryDate ? format(new Date(r.expiryDate), "dd MMM yyyy") : "—" },
            { key: "recv", header: "Received", align: "right", render: (r: Fssai) => r.qtyReceived },
            { key: "stock", header: "Current", align: "right", render: (r: Fssai) => r.currentStock },
            { key: "flag", header: "Status", render: (r: Fssai) => <span className={cn("px-2 py-0.5 rounded-lg text-xs font-bold", FLAG_PILL[r.flag])}>{FLAG_LABEL[r.flag]}</span> },
          ]} data={fssai} selectable={false} onRowClick={() => {}} emptyMessage="No batches to report" />
        </>
      )}
    </div>
  );
}
