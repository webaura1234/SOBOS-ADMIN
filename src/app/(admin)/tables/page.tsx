"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, PageHeader, StatusDot, TabBar, BtnPrimary, BtnSecondary, StatCards, ChipFilter } from "@/components/ui/shared";
import { ConfirmDialog, FormField, inputClass, selectClass } from "@/components/ui/forms";
import { formatCurrency, cn, naturalSortLabel } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { useApp } from "@/lib/context";
import { Plus, Save, Trash2, QrCode, Users } from "lucide-react";

interface TableRow {
  id: string;
  label: string;
  section: { id: string; name: string } | null;
  minCapacity: number;
  maxCapacity: number;
  shape: string;
  status: string;
  posX: number;
  posY: number;
  qrCode: string | null;
  sessions: { guestCount: number; serverName: string | null; orderTotal: number }[];
}

interface Section { id: string; name: string; _count: { tables: number } }

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 border-green-400 text-green-900 hover:bg-green-200",
  occupied: "bg-red-100 border-red-400 text-red-900 hover:bg-red-200",
  reserved: "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100",
  cleaning: "bg-yellow-100 border-yellow-400 text-yellow-900 hover:bg-yellow-200",
};

const STATUS_LABELS: Record<string, string> = {
  "": "All Tables",
  available: "Available",
  occupied: "Occupied",
  reserved: "Reserved",
  cleaning: "Cleaning",
};

export default function TablesPage() {
  const { toast } = useToast();
  const { locationId, locations } = useApp();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [tab, setTab] = useState("board");
  const [detail, setDetail] = useState<TableRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({ label: "", minCapacity: 2, maxCapacity: 4, shape: "square", sectionId: "", status: "available" });
  const [newSection, setNewSection] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const locId = locationId ?? locations[0]?.id ?? "";

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (locId) params.set("locationId", locId);
    if (statusFilter && tab === "board") params.set("status", statusFilter);
    const data = await apiFetch<{ tables: TableRow[]; sections: Section[] }>(`/api/tables?${params}`);
    setTables(data.tables);
    setSections(data.sections);
  }, [locId, statusFilter, tab]);

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [load, toast]);

  const sortedTables = useMemo(
    () => [...tables].sort((a, b) => naturalSortLabel(a.label, b.label)),
    [tables]
  );

  const filteredList = useMemo(
    () => (statusFilter ? sortedTables.filter((t) => t.status === statusFilter) : sortedTables),
    [sortedTables, statusFilter]
  );

  const statusCounts = useMemo(() => ({
    available: tables.filter((t) => t.status === "available").length,
    occupied: tables.filter((t) => t.status === "occupied").length,
    reserved: tables.filter((t) => t.status === "reserved").length,
    cleaning: tables.filter((t) => t.status === "cleaning").length,
  }), [tables]);

  const saveTable = async () => {
    try {
      if (!form.label.trim()) { toast("Label required", "error"); return; }
      if (creating) {
        await apiFetch("/api/tables", { method: "POST", body: JSON.stringify({ ...form, locationId: locId, sectionId: form.sectionId || null }) });
        toast("Table created");
      } else if (detail) {
        await apiFetch("/api/tables", { method: "PATCH", body: JSON.stringify({ id: detail.id, ...form, sectionId: form.sectionId || null }) });
        toast("Table updated");
      }
      setCreating(false); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const deleteTable = async (id: string) => {
    try {
      await apiFetch(`/api/tables?id=${id}`, { method: "DELETE" });
      toast("Table deleted"); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const addSection = async () => {
    if (!newSection.trim() || !locId) return;
    try {
      await apiFetch("/api/tables", { method: "POST", body: JSON.stringify({ type: "section", locationId: locId, name: newSection }) });
      toast("Section created"); setNewSection(""); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const openCreate = () => {
    setCreating(true); setDetail(null);
    setForm({ label: "", minCapacity: 2, maxCapacity: 4, shape: "square", sectionId: "", status: "available" });
  };

  const openEdit = (t: TableRow) => {
    setCreating(false); setDetail(t);
    setForm({ label: t.label, minCapacity: t.minCapacity, maxCapacity: t.maxCapacity, shape: t.shape, sectionId: t.section?.id ?? "", status: t.status });
  };

  const columns: Column<TableRow>[] = [
    { key: "label", header: "Table", render: (r) => (
      <span className="inline-flex items-center gap-2">
        <span className="w-9 h-9 rounded-lg bg-cream border border-border flex items-center justify-center font-bold text-sm">{r.label.replace("T", "")}</span>
        {r.label}
      </span>
    ) },
    { key: "section", header: "Section", render: (r) => r.section?.name ?? "Default" },
    { key: "capacity", header: "Seats", render: (r) => `${r.minCapacity}–${r.maxCapacity}` },
    { key: "status", header: "Status", render: (r) => <StatusDot status={r.status} /> },
    { key: "session", header: "Live Session", render: (r) => r.sessions[0] ? (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <Users size={14} className="text-muted" />
        {r.sessions[0].guestCount} guests · {formatCurrency(r.sessions[0].orderTotal)}
      </span>
    ) : <span className="text-muted">—</span> },
  ];

  const filterOptions = [
    { value: "", label: "All", count: tables.length },
    { value: "available", label: "Available", count: statusCounts.available },
    { value: "occupied", label: "Occupied", count: statusCounts.occupied },
    { value: "reserved", label: "Reserved", count: statusCounts.reserved },
    { value: "cleaning", label: "Cleaning", count: statusCounts.cleaning },
  ];

  return (
    <div>
      <PageHeader
        title="Tables & Floor"
        subtitle="Tap any table to edit · Filter by status · Manage sections & QR codes"
        actions={<BtnPrimary onClick={openCreate}><Plus size={18} /> Add Table</BtnPrimary>}
      />

      <StatCards stats={[
        { label: "Available", value: statusCounts.available, tone: "success", hint: "Ready for guests", onClick: () => { setStatusFilter("available"); setTab("list"); } },
        { label: "Occupied", value: statusCounts.occupied, tone: "danger", hint: "Currently dining", onClick: () => { setStatusFilter("occupied"); setTab("list"); } },
        { label: "Reserved", value: statusCounts.reserved, tone: "warning", hint: "Booked ahead", onClick: () => { setStatusFilter("reserved"); setTab("list"); } },
        { label: "Cleaning", value: statusCounts.cleaning, tone: "active", hint: "Being reset", onClick: () => { setStatusFilter("cleaning"); setTab("list"); } },
      ]} />

      <TabBar tabs={[
        { id: "board", label: "Floor Map" },
        { id: "list", label: "Table List" },
        { id: "sections", label: "Sections" },
        { id: "qr", label: "QR Codes" },
      ]} active={tab} onChange={setTab} />

      {(tab === "list" || tab === "board") && (
        <ChipFilter options={filterOptions} value={statusFilter} onChange={setStatusFilter} />
      )}

      {tab === "board" && (
        <div className="page-surface p-5 min-h-[420px]">
          <p className="text-sm font-medium text-muted mb-4">Click a table on the map to edit details or change status</p>
          <div className="relative min-h-[360px] bg-cream/40 rounded-2xl border-2 border-dashed border-border">
            {sortedTables.length === 0 && (
              <p className="absolute inset-0 flex items-center justify-center text-muted font-semibold">No tables match this filter</p>
            )}
            {sortedTables.map((table) => (
              <button
                key={table.id}
                type="button"
                onClick={() => openEdit(table)}
                className={cn(
                  "absolute flex flex-col items-center justify-center border-2 rounded-xl text-sm font-bold focus-ring hover:scale-105 transition-transform shadow-sm",
                  STATUS_COLORS[table.status],
                  table.shape === "round" && "rounded-full"
                )}
                style={{ left: table.posX, top: table.posY, width: table.maxCapacity > 4 ? 92 : 76, height: table.maxCapacity > 4 ? 92 : 76 }}
                title={`${table.label} — ${table.status}`}
              >
                <span className="text-base">{table.label}</span>
                <span className="text-[10px] font-semibold opacity-80 capitalize mt-0.5">{table.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "list" && (
        <DenseGrid
          columns={columns}
          data={filteredList}
          selectable={false}
          onRowClick={openEdit}
          emptyMessage="No tables found"
          emptyDescription="Try a different filter or add a new table"
        />
      )}

      {tab === "sections" && (
        <div className="space-y-4">
          <div className="flex gap-3 p-4 bg-cream/60 rounded-2xl border border-border">
            <input className={inputClass + " flex-1"} placeholder="New section name (e.g. Rooftop)" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
            <BtnPrimary onClick={addSection}><Plus size={18} /> Add Section</BtnPrimary>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {sections.map((s) => (
              <div key={s.id} className="flex justify-between items-center p-5 page-surface">
                <span className="font-bold text-lg">{s.name}</span>
                <span className="text-sm font-bold text-muted bg-cream px-3 py-1 rounded-full">{s._count.tables} tables</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "qr" && (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sortedTables.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => openEdit(t)}
              className="text-left p-5 page-surface hover:border-primary hover:shadow-md transition-all focus-ring group"
            >
              <div className="flex items-start justify-between gap-2 mb-4">
                <div>
                  <div className="text-xl font-bold text-black">{t.label}</div>
                  <div className="text-sm text-muted font-medium mt-0.5">{t.section?.name ?? "Default"}</div>
                </div>
                <StatusDot status={t.status} />
              </div>
              <div className="aspect-square max-w-[140px] mx-auto bg-white border-2 border-border rounded-xl flex items-center justify-center mb-3 group-hover:border-primary transition-colors">
                <QrCode size={64} className="text-black/80" strokeWidth={1.25} />
              </div>
              <p className="text-center text-xs font-bold text-muted truncate">{t.qrCode ?? `QR-${t.label}`}</p>
              <p className="text-center text-xs font-bold text-primary mt-2 opacity-0 group-hover:opacity-100 transition-opacity">Tap to manage →</p>
            </button>
          ))}
        </div>
      )}

      <Drawer open={creating || !!detail} onClose={() => { setCreating(false); setDetail(null); }} title={creating ? "New Table" : `Table ${detail?.label}`}>
        <p className="text-sm text-muted font-medium mb-4 -mt-1">Update table details and save when done</p>
        <FormField label="Table Label" required hint="e.g. T1, T2"><input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="T13" /></FormField>
        <FormField label="Section"><select className={selectClass} value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })}>
          <option value="">Default</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Min Seats"><input type="number" min={1} className={inputClass} value={form.minCapacity} onChange={(e) => setForm({ ...form, minCapacity: Number(e.target.value) })} /></FormField>
          <FormField label="Max Seats"><input type="number" min={1} className={inputClass} value={form.maxCapacity} onChange={(e) => setForm({ ...form, maxCapacity: Number(e.target.value) })} /></FormField>
        </div>
        <FormField label="Status"><select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
          {["available", "occupied", "reserved", "cleaning"].map((s) => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}
        </select></FormField>
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <BtnPrimary onClick={saveTable}><Save size={18} /> {creating ? "Create Table" : "Save Changes"}</BtnPrimary>
          {!creating && detail && <BtnSecondary onClick={() => setConfirmDelete(detail.id)}><Trash2 size={18} /> Delete</BtnSecondary>}
        </div>
      </Drawer>

      <ConfirmDialog open={!!confirmDelete} title="Delete table?" message="This will remove the table from your floor plan." confirmLabel="Delete" destructive
        onConfirm={() => confirmDelete && deleteTable(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
