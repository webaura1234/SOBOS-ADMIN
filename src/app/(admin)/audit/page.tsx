"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { FilterBar, PageHeader, TabBar, BtnSecondary } from "@/components/ui/shared";
import { exportCsv } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { format } from "date-fns";
import { Download } from "lucide-react";
import { cn } from "@/lib/utils";

interface AuditLog { id: string; actorName: string; action: string; resourceType: string; resourceId: string | null; beforeJson: string | null; afterJson: string | null; createdAt: string; }
interface Batch { id: string; number: string; ingredient: { name: string }; expiryDate: string | null; quantity: number; status: string; supplier: { name: string; fssaiLicense: string | null } | null; }

export default function AuditPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-32 bg-cream rounded-xl" />}>
      <AuditPageContent />
    </Suspense>
  );
}

function AuditPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [batches, setBatches] = useState<Batch[]>([]);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("audit");
  const [selectedLog, setSelectedLog] = useState<AuditLog | null>(null);

  useEffect(() => {
    const params = new URLSearchParams();
    if (search) params.set("search", search);
    apiFetch<{ logs: AuditLog[]; batches: Batch[] }>(`/api/audit?${params}`)
      .then((d) => { setLogs(d.logs); setBatches(d.batches); })
      .catch((e) => toast(e.message, "error"));
  }, [search, toast]);

  useEffect(() => {
    if (searchParams.get("tab") === "fssai") setTab("fssai");
  }, [searchParams]);

  const exportFssai = () => {
    exportCsv("fssai-report.csv", ["Batch", "Ingredient", "Supplier", "FSSAI", "Expiry", "Qty"],
      batches.map((b) => [b.number, b.ingredient.name, b.supplier?.name ?? "", b.supplier?.fssaiLicense ?? "", b.expiryDate ?? "", b.quantity]));
    toast("FSSAI report exported");
  };

  const logCols: Column<AuditLog>[] = [
    { key: "time", header: "Time", render: (r) => format(new Date(r.createdAt), "dd MMM HH:mm:ss") },
    { key: "actor", header: "Actor", render: (r) => r.actorName },
    { key: "action", header: "Action" },
    { key: "resource", header: "Resource", render: (r) => r.resourceType },
  ];

  return (
    <div>
      <PageHeader title="Audit & Compliance" subtitle="Audit trail, FSSAI compliance"
        actions={<BtnSecondary onClick={exportFssai}><Download size={18} /> Export FSSAI</BtnSecondary>} />
      <TabBar tabs={[{ id: "audit", label: "Audit Trail" }, { id: "fssai", label: "FSSAI Report" }]} active={tab} onChange={setTab} />

      {tab === "audit" && (
        <>
          <FilterBar search={search} onSearchChange={setSearch} />
          <DenseGrid columns={logCols} data={logs} selectable={false} onRowClick={setSelectedLog} />
          {selectedLog && (
            <div className="mt-4 p-4 bg-white border-2 border-border rounded-xl">
              <h3 className="font-bold mb-3">Change Detail</h3>
              <div className="grid grid-cols-2 gap-4 text-sm font-mono">
                <div><p className="font-bold mb-1">Before</p><pre className="bg-cream p-3 rounded-lg overflow-auto">{selectedLog.beforeJson ?? "—"}</pre></div>
                <div><p className="font-bold mb-1">After</p><pre className="bg-cream p-3 rounded-lg overflow-auto">{selectedLog.afterJson ?? "—"}</pre></div>
              </div>
            </div>
          )}
        </>
      )}

      {tab === "fssai" && <DenseGrid columns={[
        { key: "number", header: "Batch #" },
        { key: "ingredient", header: "Ingredient", render: (r) => r.ingredient.name },
        { key: "supplier", header: "Supplier", render: (r) => r.supplier?.name ?? "—" },
        { key: "expiry", header: "Expiry", render: (r) => r.expiryDate ? format(new Date(r.expiryDate), "dd MMM yyyy") : "—" },
        { key: "status", header: "Status", render: (r) => <span className={cn("px-2 py-0.5 rounded-lg text-xs font-bold", r.status === "expired" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700")}>{r.status}</span> },
      ]} data={batches} selectable={false} onRowClick={() => {}} />}
    </div>
  );
}
