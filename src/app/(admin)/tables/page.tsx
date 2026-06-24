"use client";

import { useEffect, useState, useCallback, useMemo } from "react";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, PageHeader, StatusDot, TabBar, BtnPrimary, BtnSecondary, StatCards, ChipFilter } from "@/components/ui/shared";
import { ConfirmDialog, FormField, inputClass, selectClass } from "@/components/ui/forms";
import { formatCurrency, cn, naturalSortLabel } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { useApp } from "@/lib/context";
import { useInterval } from "@/lib/use-interval";
import { Download, Plus, Save, Trash2, QrCode, RefreshCw, Users, Layers, Printer, Wand2 } from "lucide-react";

interface Session { id: string; guestCount: number; serverName: string | null; guestName: string | null; guestPhone: string | null; specialRequests: string | null; orderTotal: number; }
interface TableRow { id: string; label: string; section: { id: string; name: string } | null; minCapacity: number; maxCapacity: number; shape: string; status: string; posX: number; posY: number; qrCode: string | null; sessions: Session[]; }
interface Section { id: string; name: string; _count: { tables: number } }

const STATUS_COLORS: Record<string, string> = {
  available: "bg-green-100 border-green-400 text-green-900 hover:bg-green-200",
  occupied: "bg-red-100 border-red-400 text-red-900 hover:bg-red-200",
  reserved: "bg-amber-50 border-amber-300 text-amber-900 hover:bg-amber-100",
  cleaning: "bg-yellow-100 border-yellow-400 text-yellow-900 hover:bg-yellow-200",
};
const STATUS_LABELS: Record<string, string> = { "": "All Tables", available: "Available", occupied: "Occupied", reserved: "Reserved", cleaning: "Cleaning" };
const TABLE_CFG_DEFAULT = { cleaningTimerMin: 10, autoTransition: true, allowWithoutQr: true, requireGuestCount: true };

export default function TablesPage() {
  const { toast } = useToast();
  const { locationId, locations } = useApp();
  const [tables, setTables] = useState<TableRow[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [tab, setTab] = useState("board");
  const [detail, setDetail] = useState<TableRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({ label: "", minCapacity: 2, maxCapacity: 4, shape: "square", sectionId: "", status: "available", posX: 0, posY: 0 });
  const [sessionForm, setSessionForm] = useState({ guestCount: 2, serverName: "", guestName: "", guestPhone: "", specialRequests: "" });
  const [reassignTo, setReassignTo] = useState("");
  const [newSection, setNewSection] = useState("");
  const [editSection, setEditSection] = useState<Section | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [confirmSection, setConfirmSection] = useState<Section | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkForm, setBulkForm] = useState({ count: 5, startNumber: 1, prefix: "T", sectionId: "", minCapacity: 2, maxCapacity: 4, shape: "square" });
  const [cfg, setCfg] = useState(TABLE_CFG_DEFAULT);
  const [allocParty, setAllocParty] = useState(2);
  const [allocResult, setAllocResult] = useState<{ suggestion: TableRow | null; alternatives: TableRow[] } | null>(null);
  const locId = locationId ?? locations[0]?.id ?? "";

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    if (locId) params.set("locationId", locId);
    if (statusFilter && tab === "board") params.set("status", statusFilter);
    const data = await apiFetch<{ tables: TableRow[]; sections: Section[] }>(`/api/tables?${params}`);
    setTables(data.tables); setSections(data.sections);
  }, [locId, statusFilter, tab]);
  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [load, toast]);
  useEffect(() => { apiFetch<typeof TABLE_CFG_DEFAULT>("/api/admin-config?scope=tables&key=config").then((c) => setCfg({ ...TABLE_CFG_DEFAULT, ...c })).catch(() => {}); }, []);
  // Live status board: 10s REST poll fallback (F-39).
  useInterval(() => { if (tab === "board" || tab === "list") load().catch(() => {}); }, 10000);

  const sortedTables = useMemo(() => [...tables].sort((a, b) => naturalSortLabel(a.label, b.label)), [tables]);
  const filteredList = useMemo(() => (statusFilter ? sortedTables.filter((t) => t.status === statusFilter) : sortedTables), [sortedTables, statusFilter]);
  const statusCounts = useMemo(() => ({
    available: tables.filter((t) => t.status === "available").length,
    occupied: tables.filter((t) => t.status === "occupied").length,
    reserved: tables.filter((t) => t.status === "reserved").length,
    cleaning: tables.filter((t) => t.status === "cleaning").length,
  }), [tables]);

  const saveTable = async () => {
    try {
      if (!form.label.trim()) { toast("Label required", "error"); return; }
      if (creating) { await apiFetch("/api/tables", { method: "POST", body: JSON.stringify({ ...form, locationId: locId, sectionId: form.sectionId || null }) }); toast("Table created"); }
      else if (detail) { await apiFetch("/api/tables", { method: "PATCH", body: JSON.stringify({ id: detail.id, ...form, sectionId: form.sectionId || null }) }); toast("Table updated"); }
      setCreating(false); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const deleteTable = async (id: string, reason?: string) => { try { await apiFetch(`/api/tables?id=${id}&reason=${encodeURIComponent(reason ?? "")}`, { method: "DELETE" }); toast("Table deleted"); setDetail(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const addSection = async () => { if (!newSection.trim() || !locId) return; try { await apiFetch("/api/tables", { method: "POST", body: JSON.stringify({ type: "section", locationId: locId, name: newSection }) }); toast("Section created"); setNewSection(""); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const saveSection = async () => { if (!editSection) return; try { await apiFetch("/api/tables", { method: "PATCH", body: JSON.stringify({ type: "section", id: editSection.id, name: editSection.name }) }); toast("Section renamed"); setEditSection(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const deleteSection = async () => { if (!confirmSection) return; try { await apiFetch(`/api/tables?id=${confirmSection.id}&type=section`, { method: "DELETE" }); toast("Section deleted, tables unsectioned"); setConfirmSection(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const bulkAdd = async () => { try { const r = await apiFetch<{ created: number }>("/api/tables", { method: "POST", body: JSON.stringify({ type: "bulk", locationId: locId, ...bulkForm, sectionId: bulkForm.sectionId || null }) }); toast(`${r.created} tables added`); setShowBulk(false); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  const openCreate = () => { setCreating(true); setDetail(null); setForm({ label: "", minCapacity: 2, maxCapacity: 4, shape: "square", sectionId: "", status: "available", posX: 0, posY: 0 }); };
  const openEdit = (t: TableRow) => { setCreating(false); setDetail(t); setForm({ label: t.label, minCapacity: t.minCapacity, maxCapacity: t.maxCapacity, shape: t.shape, sectionId: t.section?.id ?? "", status: t.status, posX: t.posX, posY: t.posY }); setSessionForm({ guestCount: 2, serverName: "", guestName: "", guestPhone: "", specialRequests: "" }); setReassignTo(""); };
  const openSession = async () => { if (!detail) return; if (cfg.requireGuestCount && !sessionForm.guestCount) { toast("Guest count required", "error"); return; } try { await apiFetch("/api/tables", { method: "POST", body: JSON.stringify({ type: "session", tableId: detail.id, ...sessionForm }) }); toast("Session opened"); setDetail(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const closeSession = async () => { const s = detail?.sessions[0]; if (!s) return; try { await apiFetch("/api/tables", { method: "PATCH", body: JSON.stringify({ type: "close_session", id: s.id }) }); toast("Session closed"); setDetail(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const cancelSession = async () => { const s = detail?.sessions[0]; if (!s) return; try { await apiFetch("/api/tables", { method: "PATCH", body: JSON.stringify({ type: "cancel_session", id: s.id, reason: "Manager cancel" }) }); toast("Session cancelled"); setDetail(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const reassignSession = async () => { const s = detail?.sessions[0]; if (!s || !reassignTo) return; try { await apiFetch("/api/tables", { method: "PATCH", body: JSON.stringify({ type: "reassign_session", id: s.id, toTableId: reassignTo }) }); toast("Session reassigned"); setDetail(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const markClean = async (id: string) => { try { await apiFetch("/api/tables", { method: "PATCH", body: JSON.stringify({ type: "cleaning_done", id }) }); toast("Table ready"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const regenerateQr = async (id: string) => { try { await apiFetch("/api/tables", { method: "PATCH", body: JSON.stringify({ type: "qr", id }) }); toast("QR regenerated"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const saveCfg = async () => { try { await apiFetch("/api/admin-config", { method: "PATCH", body: JSON.stringify({ scope: "tables", key: "config", value: cfg }) }); toast("Table settings saved"); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const allocate = async () => { try { const r = await apiFetch<{ suggestion: TableRow | null; alternatives: TableRow[] }>(`/api/tables?locationId=${locId}&allocateFor=${allocParty}`); setAllocResult(r); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const downloadQrs = () => { const content = sortedTables.map((t) => `${t.label},${t.qrCode ?? `QR-${t.label}`}`).join("\n"); const blob = new Blob([`Table,QRCode\n${content}`], { type: "text/csv" }); const url = URL.createObjectURL(blob); const a = document.createElement("a"); a.href = url; a.download = "table-qr-codes.csv"; a.click(); URL.revokeObjectURL(url); };

  const columns: Column<TableRow>[] = [
    { key: "label", header: "Table", render: (r) => <span className="inline-flex items-center gap-2"><span className="w-9 h-9 rounded-lg bg-cream border border-border flex items-center justify-center font-bold text-sm">{r.label.replace(/[^0-9]/g, "")}</span>{r.label}</span> },
    { key: "section", header: "Section", render: (r) => r.section?.name ?? "Unsectioned" },
    { key: "capacity", header: "Seats", render: (r) => `${r.minCapacity}–${r.maxCapacity}` },
    { key: "status", header: "Status", render: (r) => <StatusDot status={r.status} /> },
    { key: "session", header: "Live Session", render: (r) => r.sessions[0] ? <span className="inline-flex items-center gap-1.5 text-sm"><Users size={14} className="text-muted" />{r.sessions[0].guestCount} · {formatCurrency(r.sessions[0].orderTotal)}</span> : r.status === "cleaning" ? <button type="button" onClick={(e) => { e.stopPropagation(); markClean(r.id); }} className="text-sm font-bold underline">Mark clean</button> : <span className="text-muted">—</span> },
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
      <PageHeader title="Tables & Floor" subtitle="Floor map · sessions · walk-ins · sections · QR · allocation · live board (10s)"
        actions={<div className="flex gap-2"><BtnSecondary onClick={() => { setBulkForm({ ...bulkForm, sectionId: "", startNumber: tables.length + 1 }); setShowBulk(true); }}><Layers size={18} /> Bulk Add</BtnSecondary><BtnSecondary onClick={downloadQrs}><Download size={18} /> QR Export</BtnSecondary><BtnPrimary onClick={openCreate}><Plus size={18} /> Add Table</BtnPrimary></div>} />

      <StatCards stats={[
        { label: "Available", value: statusCounts.available, tone: "success", hint: "Ready", onClick: () => { setStatusFilter("available"); setTab("list"); } },
        { label: "Occupied", value: statusCounts.occupied, tone: "danger", hint: "Dining", onClick: () => { setStatusFilter("occupied"); setTab("list"); } },
        { label: "Reserved", value: statusCounts.reserved, tone: "warning", hint: "Booked", onClick: () => { setStatusFilter("reserved"); setTab("list"); } },
        { label: "Cleaning", value: statusCounts.cleaning, tone: "active", hint: "Resetting", onClick: () => { setStatusFilter("cleaning"); setTab("list"); } },
      ]} />

      <TabBar tabs={[{ id: "board", label: "Floor Map" }, { id: "list", label: "Table List" }, { id: "sections", label: "Sections" }, { id: "qr", label: "QR Codes" }, { id: "allocate", label: "Allocation" }, { id: "settings", label: "Settings" }]} active={tab} onChange={setTab} />

      {(tab === "list" || tab === "board") && <ChipFilter options={filterOptions} value={statusFilter} onChange={setStatusFilter} />}

      {tab === "board" && (
        <div className="page-surface p-5 min-h-[420px]">
          <p className="text-sm font-medium text-muted mb-4">Drag tables to reposition · click to manage · board auto-refreshes every 10s</p>
          <div className="relative min-h-[360px] bg-cream/40 rounded-2xl border-2 border-dashed border-border">
            {sortedTables.length === 0 && <p className="absolute inset-0 flex items-center justify-center text-muted font-semibold">No tables match this filter</p>}
            {sortedTables.map((table) => (
              <button key={table.id} type="button" onClick={() => openEdit(table)}
                className={cn("absolute flex flex-col items-center justify-center border-2 rounded-xl text-sm font-bold focus-ring hover:scale-105 transition-transform shadow-sm", STATUS_COLORS[table.status], table.shape === "round" && "rounded-full")}
                style={{ left: table.posX, top: table.posY, width: table.maxCapacity > 4 ? 92 : 76, height: table.maxCapacity > 4 ? 92 : 76 }}
                title={`${table.label} — ${table.status}`} draggable
                onDragEnd={(e) => { const board = e.currentTarget.parentElement?.getBoundingClientRect(); if (!board) return; apiFetch("/api/tables", { method: "PATCH", body: JSON.stringify({ id: table.id, posX: Math.max(0, e.clientX - board.left - 38), posY: Math.max(0, e.clientY - board.top - 38) }) }).then(() => load()).catch(() => toast("Could not move table", "error")); }}>
                <span className="text-base">{table.label}</span>
                <span className="text-[10px] font-semibold opacity-80 capitalize mt-0.5">{table.status}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {tab === "list" && <DenseGrid columns={columns} data={filteredList} selectable={false} onRowClick={openEdit} emptyMessage="No tables found" />}

      {tab === "sections" && (
        <div className="space-y-4">
          <div className="flex gap-3 p-4 bg-cream/60 rounded-2xl border border-border">
            <input className={inputClass + " flex-1"} placeholder="New section name (e.g. Rooftop)" value={newSection} onChange={(e) => setNewSection(e.target.value)} />
            <BtnPrimary onClick={addSection}><Plus size={18} /> Add Section</BtnPrimary>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            {sections.map((s) => (
              <div key={s.id} className="flex justify-between items-center p-5 page-surface">
                <div><span className="font-bold text-lg">{s.name}</span><span className="ml-2 text-sm font-bold text-muted bg-cream px-3 py-1 rounded-full">{s._count.tables} tables</span></div>
                <div className="flex gap-2"><button type="button" onClick={() => setEditSection({ ...s })} className="text-sm font-bold underline">Rename</button><button type="button" onClick={() => setConfirmSection(s)} className="text-red-600 text-sm font-bold underline">Delete</button></div>
              </div>
            ))}
          </div>
        </div>
      )}

      {tab === "qr" && (
        <>
          <div className="mb-4 flex gap-2"><BtnSecondary onClick={() => window.print()}><Printer size={18} /> Print all (PDF)</BtnSecondary><BtnSecondary onClick={downloadQrs}><Download size={18} /> Download CSV</BtnSecondary></div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {sortedTables.map((t) => (
              <div key={t.id} className="p-5 page-surface">
                <div className="flex items-start justify-between gap-2 mb-3"><div><div className="text-xl font-bold">{t.label}</div><div className="text-sm text-muted font-medium">{t.section?.name ?? "Unsectioned"}</div></div><StatusDot status={t.status} /></div>
                <div className="aspect-square max-w-[140px] mx-auto bg-white border-2 border-border rounded-xl flex items-center justify-center mb-3"><QrCode size={64} className="text-black/80" strokeWidth={1.25} /></div>
                <p className="text-center text-xs font-bold text-muted truncate">{t.qrCode ?? `QR-${t.label}`}</p>
                <button type="button" onClick={() => regenerateQr(t.id)} className="mt-3 mx-auto flex items-center gap-1 text-xs font-bold text-black underline"><RefreshCw size={12} /> Regenerate</button>
              </div>
            ))}
          </div>
        </>
      )}

      {tab === "allocate" && (
        <div className="page-surface p-5 max-w-lg">
          <h3 className="font-bold mb-3 flex items-center gap-2"><Wand2 size={18} /> Table allocation</h3>
          <div className="flex items-end gap-3">
            <FormField label="Party size"><input type="number" className={inputClass} value={allocParty} onChange={(e) => setAllocParty(Number(e.target.value))} /></FormField>
            <BtnPrimary onClick={allocate} className="mb-5">Suggest</BtnPrimary>
          </div>
          {allocResult && (allocResult.suggestion ? (
            <div className="space-y-2">
              <div className="p-4 rounded-xl border-2 border-primary bg-primary/10"><div className="font-bold">Best fit: {allocResult.suggestion.label}</div><div className="text-sm text-muted">{allocResult.suggestion.section?.name ?? "Unsectioned"} · seats {allocResult.suggestion.minCapacity}–{allocResult.suggestion.maxCapacity}</div></div>
              {allocResult.alternatives.length > 0 && <div className="text-sm"><span className="font-bold">Alternatives: </span>{allocResult.alternatives.map((a) => a.label).join(", ")}</div>}
            </div>
          ) : <p className="text-muted font-medium">No available table fits a party of {allocParty}. Consider the waitlist.</p>)}
        </div>
      )}

      {tab === "settings" && (
        <div className="page-surface p-5 max-w-lg space-y-4">
          <FormField label="Cleaning timer (min)"><input type="number" className={inputClass} value={cfg.cleaningTimerMin} onChange={(e) => setCfg({ ...cfg, cleaningTimerMin: Number(e.target.value) })} /></FormField>
          {([["autoTransition", "Auto-transition cleaning → available"], ["allowWithoutQr", "Allow session without QR scan"], ["requireGuestCount", "Require guest count to open session"]] as const).map(([k, label]) => (
            <label key={k} className="flex justify-between font-bold"><span>{label}</span><input type="checkbox" checked={cfg[k]} onChange={(e) => setCfg({ ...cfg, [k]: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          ))}
          <BtnPrimary onClick={saveCfg}><Save size={18} /> Save Settings</BtnPrimary>
        </div>
      )}

      {/* ── Table edit / session drawer ── */}
      <Drawer open={creating || !!detail} onClose={() => { setCreating(false); setDetail(null); }} title={creating ? "New Table" : `Table ${detail?.label}`}>
        <FormField label="Table Label" required hint="e.g. T1, T2"><input className={inputClass} value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="T13" /></FormField>
        <FormField label="Section"><select className={selectClass} value={form.sectionId} onChange={(e) => setForm({ ...form, sectionId: e.target.value })}><option value="">Unsectioned</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Min Seats"><input type="number" min={1} className={inputClass} value={form.minCapacity} onChange={(e) => setForm({ ...form, minCapacity: Number(e.target.value) })} /></FormField>
          <FormField label="Max Seats"><input type="number" min={1} className={inputClass} value={form.maxCapacity} onChange={(e) => setForm({ ...form, maxCapacity: Number(e.target.value) })} /></FormField>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Shape"><select className={selectClass} value={form.shape} onChange={(e) => setForm({ ...form, shape: e.target.value })}>{["square", "round", "rect"].map((s) => <option key={s} value={s}>{s}</option>)}</select></FormField>
          <FormField label="Status"><select className={selectClass} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>{["available", "occupied", "reserved", "cleaning"].map((s) => <option key={s} value={s}>{STATUS_LABELS[s] ?? s}</option>)}</select></FormField>
        </div>
        {!creating && detail && (
          <div className="p-4 bg-cream rounded-xl border-2 border-border">
            <h3 className="font-bold mb-3">Table Session</h3>
            {detail.sessions[0] ? (
              <div className="space-y-2">
                <p className="text-sm font-semibold">{detail.sessions[0].guestCount} guests{detail.sessions[0].guestName && ` · ${detail.sessions[0].guestName}`} · {formatCurrency(detail.sessions[0].orderTotal)}</p>
                <div className="flex flex-wrap gap-2">
                  <BtnSecondary onClick={closeSession}>Close</BtnSecondary>
                  <BtnSecondary onClick={cancelSession}>Cancel</BtnSecondary>
                </div>
                <div className="flex gap-2 items-end pt-2">
                  <FormField label="Reassign to"><select className={selectClass} value={reassignTo} onChange={(e) => setReassignTo(e.target.value)}><option value="">— table —</option>{sortedTables.filter((t) => t.id !== detail.id && t.status === "available").map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}</select></FormField>
                  <BtnSecondary onClick={reassignSession} className="mb-5">Move</BtnSecondary>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                <FormField label="Guests"><input type="number" className={inputClass} value={sessionForm.guestCount} onChange={(e) => setSessionForm({ ...sessionForm, guestCount: Number(e.target.value) })} /></FormField>
                <FormField label="Server"><input className={inputClass} value={sessionForm.serverName} onChange={(e) => setSessionForm({ ...sessionForm, serverName: e.target.value })} /></FormField>
                <FormField label="Walk-in name"><input className={inputClass} value={sessionForm.guestName} onChange={(e) => setSessionForm({ ...sessionForm, guestName: e.target.value })} /></FormField>
                <FormField label="Phone"><input className={inputClass} value={sessionForm.guestPhone} onChange={(e) => setSessionForm({ ...sessionForm, guestPhone: e.target.value })} /></FormField>
                <div className="col-span-2"><FormField label="Special requests"><input className={inputClass} value={sessionForm.specialRequests} onChange={(e) => setSessionForm({ ...sessionForm, specialRequests: e.target.value })} /></FormField></div>
                <div className="col-span-2"><BtnSecondary onClick={openSession}>Open Walk-in Session</BtnSecondary></div>
              </div>
            )}
          </div>
        )}
        <div className="flex gap-3 mt-6 pt-4 border-t border-border">
          <BtnPrimary onClick={saveTable}><Save size={18} /> {creating ? "Create Table" : "Save Changes"}</BtnPrimary>
          {!creating && detail && <BtnSecondary onClick={() => setConfirmDelete(detail.id)}><Trash2 size={18} /> Delete</BtnSecondary>}
        </div>
      </Drawer>

      {/* ── Bulk add ── */}
      <Drawer open={showBulk} onClose={() => setShowBulk(false)} title="Bulk Add Tables">
        <div className="grid grid-cols-2 gap-3">
          <FormField label="How many"><input type="number" className={inputClass} value={bulkForm.count} onChange={(e) => setBulkForm({ ...bulkForm, count: Number(e.target.value) })} /></FormField>
          <FormField label="Start number"><input type="number" className={inputClass} value={bulkForm.startNumber} onChange={(e) => setBulkForm({ ...bulkForm, startNumber: Number(e.target.value) })} /></FormField>
          <FormField label="Label prefix"><input className={inputClass} value={bulkForm.prefix} onChange={(e) => setBulkForm({ ...bulkForm, prefix: e.target.value })} /></FormField>
          <FormField label="Section"><select className={selectClass} value={bulkForm.sectionId} onChange={(e) => setBulkForm({ ...bulkForm, sectionId: e.target.value })}><option value="">Unsectioned</option>{sections.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormField>
          <FormField label="Min seats"><input type="number" className={inputClass} value={bulkForm.minCapacity} onChange={(e) => setBulkForm({ ...bulkForm, minCapacity: Number(e.target.value) })} /></FormField>
          <FormField label="Max seats"><input type="number" className={inputClass} value={bulkForm.maxCapacity} onChange={(e) => setBulkForm({ ...bulkForm, maxCapacity: Number(e.target.value) })} /></FormField>
          <FormField label="Shape"><select className={selectClass} value={bulkForm.shape} onChange={(e) => setBulkForm({ ...bulkForm, shape: e.target.value })}>{["square", "round", "rect"].map((s) => <option key={s} value={s}>{s}</option>)}</select></FormField>
        </div>
        <p className="text-sm text-muted font-medium my-2">Creates {bulkForm.count} tables: {bulkForm.prefix}{bulkForm.startNumber}…{bulkForm.prefix}{bulkForm.startNumber + bulkForm.count - 1}</p>
        <BtnPrimary onClick={bulkAdd}><Layers size={18} /> Create {bulkForm.count} Tables</BtnPrimary>
      </Drawer>

      {/* ── Section rename ── */}
      <Drawer open={!!editSection} onClose={() => setEditSection(null)} title="Rename Section">
        {editSection && (<><FormField label="Name"><input className={inputClass} value={editSection.name} onChange={(e) => setEditSection({ ...editSection, name: e.target.value })} /></FormField><BtnPrimary onClick={saveSection}><Save size={18} /> Save</BtnPrimary></>)}
      </Drawer>

      <ConfirmDialog open={!!confirmDelete} title="Delete table?" message="This removes the table from your floor plan (history preserved)." confirmLabel="Delete" destructive requireReason onConfirm={(reason) => confirmDelete && deleteTable(confirmDelete, reason)} onCancel={() => setConfirmDelete(null)} />
      <ConfirmDialog open={!!confirmSection} title={`Delete "${confirmSection?.name}"?`} message={`${confirmSection?._count.tables ?? 0} table(s) will become Unsectioned.`} confirmLabel="Delete section" destructive onConfirm={deleteSection} onCancel={() => setConfirmSection(null)} />
    </div>
  );
}
