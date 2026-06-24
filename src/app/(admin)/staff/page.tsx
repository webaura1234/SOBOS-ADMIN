"use client";

import { Suspense, useEffect, useState, useCallback } from "react";
import { useSearchParams } from "next/navigation";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, PageHeader, StatusDot, TabBar, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { ConfirmDialog, FormField, inputClass, selectClass, exportCsv } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Plus, Save, Trash2, Upload, Printer, RotateCcw, Clock } from "lucide-react";

interface StaffRow { id: string; name: string; phone: string; status: string; inviteStatus: string; payRate: number; payType: string; locationRoles: { role: { name: string }; location: { name: string } | null }[]; attendance: { clockIn: string; clockOut: string | null }[]; }
interface AttRow { id: string; user: { name: string }; clockIn: string; clockOut: string | null; isLate: boolean; autoClosed: boolean; }
interface Slot { id: string; userId: string; locationId: string; dayOfWeek: number; startTime: string; endTime: string; status: string; }
interface Swap { id: string; slotId: string; requesterName: string; withName: string | null; reason: string | null; status: string; }
interface Perf { id: string; name: string; role: string; shifts: number; hours: number; onTimeRate: number; avgShift: number; }
interface PayrollRow { id: string; name: string; role: string; payType: string; hours: number; otHours: number; hourlyRate: number; grossPay: number; incomplete: boolean; }
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const INVITE_PILL: Record<string, string> = { pending: "bg-amber-100 text-amber-800", accepted: "bg-green-100 text-green-700", expired: "bg-red-100 text-red-700" };

export default function StaffPage() {
  return <Suspense fallback={<div className="animate-pulse h-32 bg-cream rounded-xl" />}><StaffPageContent /></Suspense>;
}

function StaffPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [attendance, setAttendance] = useState<AttRow[]>([]);
  const [schedule, setSchedule] = useState<Slot[]>([]);
  const [swaps, setSwaps] = useState<Swap[]>([]);
  const [gaps, setGaps] = useState<number[]>([]);
  const [perf, setPerf] = useState<Perf[]>([]);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [payCfg, setPayCfg] = useState({ otMultiplier: 1.5, otThreshold: 48 });
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState("list");
  const [detail, setDetail] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", roleId: "", locationId: "", payRate: 0, payType: "hourly" });
  const [scheduleForm, setScheduleForm] = useState({ userId: "", locationId: "", dayOfWeek: 1, startTime: "10:00", endTime: "18:00" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState("");
  const [bulkResults, setBulkResults] = useState<{ row: number; phone: string; ok: boolean; error?: string }[] | null>(null);
  const [adjust, setAdjust] = useState<AttRow | null>(null);
  const [adjustForm, setAdjustForm] = useState({ clockIn: "", clockOut: "", reason: "" });

  const load = useCallback(async () => {
    if (tab === "attendance") setAttendance((await apiFetch<{ attendance: AttRow[] }>("/api/staff?tab=attendance")).attendance);
    else if (tab === "schedule") {
      const d = await apiFetch<{ schedule: Slot[]; staff: { id: string; name: string }[]; locations: { id: string; name: string }[]; swaps: Swap[]; gaps: number[] }>("/api/staff?tab=schedule");
      setSchedule(d.schedule); setStaff(d.staff.map((u) => ({ ...u, phone: "", status: "active", inviteStatus: "accepted", payRate: 0, payType: "hourly", locationRoles: [], attendance: [] }))); setLocations(d.locations); setSwaps(d.swaps); setGaps(d.gaps);
      setScheduleForm((c) => ({ ...c, userId: c.userId || d.staff[0]?.id || "", locationId: c.locationId || d.locations[0]?.id || "" }));
    } else if (tab === "performance") setPerf((await apiFetch<{ leaderboard: Perf[] }>("/api/staff?tab=performance")).leaderboard);
    else if (tab === "payroll") { const d = await apiFetch<{ payroll: PayrollRow[]; config: typeof payCfg }>("/api/staff?tab=payroll"); setPayroll(d.payroll); setPayCfg(d.config); }
    else {
      const d = await apiFetch<{ staff: StaffRow[]; roles: { id: string; name: string }[]; locations: { id: string; name: string }[] }>("/api/staff");
      setStaff(d.staff); setRoles(d.roles); setLocations(d.locations);
      setForm((c) => ({ ...c, roleId: c.roleId || d.roles.find((r) => r.name === "Manager")?.id || d.roles[0]?.id || "", locationId: c.locationId || d.locations[0]?.id || "" }));
    }
  }, [tab]);
  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [load, toast]);

  useEffect(() => {
    if (searchParams.get("action") === "invite") { setCreating(true); setDetail(null); }
  }, [searchParams]);

  const saveStaff = async () => {
    try {
      if (creating) { await apiFetch("/api/staff", { method: "POST", body: JSON.stringify(form) }); toast("Staff invited"); }
      else if (detail) { await apiFetch("/api/staff", { method: "PATCH", body: JSON.stringify({ id: detail.id, name: form.name, phone: form.phone, email: form.email, payRate: form.payRate, payType: form.payType }) }); toast("Staff updated"); }
      setCreating(false); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const deactivate = async (id: string, reason?: string) => { try { await apiFetch(`/api/staff?id=${id}&reason=${encodeURIComponent(reason ?? "")}`, { method: "DELETE" }); toast("Staff deactivated"); setDetail(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const reactivate = async (id: string) => { try { await apiFetch(`/api/staff?id=${id}&reactivate=1`, { method: "DELETE" }); toast("Staff reactivated"); setDetail(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const resend = async (id: string) => { try { await apiFetch("/api/staff", { method: "PATCH", body: JSON.stringify({ type: "resend_invite", id }) }); toast("Invitation resent"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const createSchedule = async () => { try { await apiFetch("/api/staff", { method: "POST", body: JSON.stringify({ type: "schedule", ...scheduleForm }) }); toast("Shift published"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const clockOut = async (id: string) => { try { await apiFetch("/api/staff", { method: "PATCH", body: JSON.stringify({ type: "clock_out", id }) }); toast("Clocked out"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const swapAction = async (id: string, status: string) => { try { await apiFetch("/api/staff", { method: "PATCH", body: JSON.stringify({ type: "swap", id, status }) }); toast(`Swap ${status}`); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const saveAdjust = async () => { if (!adjust) return; try { await apiFetch("/api/staff", { method: "PATCH", body: JSON.stringify({ type: "attendance_adjust", id: adjust.id, ...adjustForm }) }); toast("Attendance adjusted"); setAdjust(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const savePayCfg = async () => { try { await apiFetch("/api/staff", { method: "PATCH", body: JSON.stringify({ type: "payroll_config", ...payCfg }) }); toast("Payroll settings saved"); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  const submitBulk = async () => {
    const rows = bulkText.trim().split("\n").filter(Boolean).map((line) => { const [phone, name, role, location] = line.split(",").map((s) => s.trim()); return { phone, name, role, location }; });
    if (rows.length === 0) { toast("Paste CSV rows first", "error"); return; }
    try { const res = await apiFetch<{ created: number; total: number; results: typeof bulkResults }>("/api/staff", { method: "POST", body: JSON.stringify({ type: "bulk_invite", rows }) }); setBulkResults(res.results); toast(`${res.created}/${res.total} invited`); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const openCreate = () => { setCreating(true); setDetail(null); setForm({ name: "", phone: "", email: "", roleId: roles[0]?.id ?? "", locationId: locations[0]?.id ?? "", payRate: 0, payType: "hourly" }); };
  const openEdit = (r: StaffRow) => { setCreating(false); setDetail(r); setForm({ name: r.name, phone: r.phone, email: "", roleId: "", locationId: "", payRate: r.payRate, payType: r.payType }); };

  const columns: Column<StaffRow>[] = [
    { key: "name", header: "Name" }, { key: "phone", header: "Phone" },
    { key: "role", header: "Role", render: (r) => r.locationRoles.map((lr) => lr.role.name).join(", ") || "—" },
    { key: "invite", header: "Invite", render: (r) => <span className={cn("px-2 py-0.5 rounded-lg text-xs font-bold capitalize", INVITE_PILL[r.inviteStatus] ?? "bg-cream")}>{r.inviteStatus}</span> },
    { key: "status", header: "Status", render: (r) => <StatusDot status={r.status === "active" ? "active" : "cancelled"} label={r.status} /> },
    { key: "clock", header: "Today", render: (r) => r.attendance[0]?.clockOut ? "Off duty" : r.attendance[0] ? `In ${format(new Date(r.attendance[0].clockIn), "HH:mm")}` : "—" },
    { key: "act", header: "", render: (r) => r.inviteStatus !== "accepted" ? <button type="button" onClick={(e) => { e.stopPropagation(); resend(r.id); }} className="text-xs font-bold underline">Resend</button> : null },
  ];

  return (
    <div>
      <PageHeader title="Staff & Labor" subtitle="Invite, attendance, scheduling, performance, payroll"
        actions={<><BtnSecondary onClick={() => { setBulkResults(null); setBulkText(""); setShowBulk(true); }}><Upload size={18} /> Bulk Invite</BtnSecondary><BtnPrimary onClick={openCreate}><Plus size={18} /> Invite Staff</BtnPrimary></>} />
      <TabBar tabs={[{ id: "list", label: "Staff List" }, { id: "attendance", label: "Attendance" }, { id: "schedule", label: "Scheduler" }, { id: "performance", label: "Performance" }, { id: "payroll", label: "Payroll" }]} active={tab} onChange={setTab} />

      {tab === "list" && <DenseGrid columns={columns} data={staff} selectable={false} onRowClick={openEdit} />}

      {tab === "attendance" && <DenseGrid columns={[
        { key: "name", header: "Staff", render: (r: AttRow) => r.user.name },
        { key: "in", header: "Clock In", render: (r: AttRow) => format(new Date(r.clockIn), "dd MMM HH:mm") },
        { key: "out", header: "Clock Out", render: (r: AttRow) => r.clockOut ? format(new Date(r.clockOut), "HH:mm") : "Active" },
        { key: "flags", header: "Flags", render: (r: AttRow) => <span className="flex gap-1">{r.isLate && <span className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">late</span>}{r.autoClosed && <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700 font-bold">auto-closed</span>}</span> },
        { key: "act", header: "Action", render: (r: AttRow) => <span className="flex gap-2" onClick={(e) => e.stopPropagation()}>{!r.clockOut && <button type="button" onClick={() => clockOut(r.id)} className="font-bold underline">Clock out</button>}<button type="button" onClick={() => { setAdjust(r); setAdjustForm({ clockIn: new Date(r.clockIn).toISOString().slice(0, 16), clockOut: r.clockOut ? new Date(r.clockOut).toISOString().slice(0, 16) : "", reason: "" }); }} className="font-bold underline">Adjust</button></span> },
      ]} data={attendance} selectable={false} onRowClick={() => {}} />}

      {tab === "schedule" && (
        <div className="space-y-4">
          {gaps.length > 0 && <div className="p-3 rounded-xl border-2 border-amber-300 bg-amber-50 text-sm font-bold text-amber-800">Coverage gaps: {gaps.map((g) => DAYS[g]).join(", ")} have no published shifts.</div>}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 bg-white border-2 border-border rounded-xl">
            <FormField label="Staff"><select className={selectClass} value={scheduleForm.userId} onChange={(e) => setScheduleForm({ ...scheduleForm, userId: e.target.value })}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormField>
            <FormField label="Location"><select className={selectClass} value={scheduleForm.locationId} onChange={(e) => setScheduleForm({ ...scheduleForm, locationId: e.target.value })}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></FormField>
            <FormField label="Day"><select className={selectClass} value={scheduleForm.dayOfWeek} onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: Number(e.target.value) })}>{DAYS.map((d, i) => <option key={d} value={i}>{d}</option>)}</select></FormField>
            <FormField label="Start"><input type="time" className={inputClass} value={scheduleForm.startTime} onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })} /></FormField>
            <FormField label="End"><input type="time" className={inputClass} value={scheduleForm.endTime} onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })} /></FormField>
            <div className="md:col-span-5"><BtnPrimary onClick={createSchedule}><Save size={18} /> Publish Shift</BtnPrimary></div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-4 lg:grid-cols-7 gap-2">
            {DAYS.map((d, i) => (
              <div key={d} className={cn("p-3 rounded-xl border-2 min-h-[100px]", gaps.includes(i) ? "border-amber-300 bg-amber-50/40" : "border-border bg-white")}>
                <div className="font-bold text-sm mb-2">{d}</div>
                {schedule.filter((s) => s.dayOfWeek === i).map((s) => (
                  <div key={s.id} className="text-xs p-1.5 mb-1 rounded bg-cream font-semibold">{staff.find((u) => u.id === s.userId)?.name ?? "?"}<br />{s.startTime}–{s.endTime}</div>
                ))}
              </div>
            ))}
          </div>
          <div className="page-surface p-4">
            <h3 className="font-bold mb-2">Swap-approval queue</h3>
            {swaps.filter((s) => s.status === "pending").length === 0 ? <p className="text-muted font-medium text-sm">No pending swap requests.</p> : (
              <ul className="space-y-2">{swaps.filter((s) => s.status === "pending").map((s) => (
                <li key={s.id} className="flex items-center justify-between p-3 bg-cream rounded-lg">
                  <span className="font-bold">{s.requesterName} {s.withName && `↔ ${s.withName}`} <span className="text-muted font-medium">{s.reason}</span></span>
                  <span className="flex gap-2"><button type="button" onClick={() => swapAction(s.id, "approved")} className="font-bold underline">Approve</button><button type="button" onClick={() => swapAction(s.id, "rejected")} className="font-bold underline text-red-600">Reject</button></span>
                </li>
              ))}</ul>
            )}
          </div>
        </div>
      )}

      {tab === "performance" && <DenseGrid columns={[
        { key: "rank", header: "#", width: "48px", render: (_: Perf, i: number) => i + 1 },
        { key: "name", header: "Staff" }, { key: "role", header: "Role" },
        { key: "shifts", header: "Shifts", align: "right" },
        { key: "hours", header: "Hours", align: "right", render: (r: Perf) => r.hours },
        { key: "avg", header: "Avg shift", align: "right", render: (r: Perf) => `${r.avgShift}h` },
        { key: "ontime", header: "On-time", align: "right", render: (r: Perf) => <span className={cn("font-bold", r.onTimeRate < 80 && "text-red-600")}>{r.onTimeRate}%</span> },
      ]} data={perf} selectable={false} onRowClick={() => {}} emptyMessage="No performance data" />}

      {tab === "payroll" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-end gap-3 p-4 page-surface">
            <FormField label="OT multiplier"><input type="number" step="0.1" className={inputClass + " w-28"} value={payCfg.otMultiplier} onChange={(e) => setPayCfg({ ...payCfg, otMultiplier: Number(e.target.value) })} /></FormField>
            <FormField label="OT threshold (hrs)"><input type="number" className={inputClass + " w-32"} value={payCfg.otThreshold} onChange={(e) => setPayCfg({ ...payCfg, otThreshold: Number(e.target.value) })} /></FormField>
            <BtnSecondary onClick={savePayCfg} className="mb-5"><Save size={16} /> Save config</BtnSecondary>
            <div className="flex gap-2 ml-auto mb-5">
              <BtnSecondary onClick={() => window.print()}><Printer size={16} /> PDF</BtnSecondary>
              <BtnSecondary onClick={() => { exportCsv("payroll.csv", ["Name", "Role", "Type", "Hours", "OT", "Rate", "Gross"], payroll.map((r) => [r.name, r.role, r.payType, r.hours, r.otHours, r.hourlyRate, r.grossPay])); toast("Payroll exported"); }}>Export CSV</BtnSecondary>
            </div>
          </div>
          <DenseGrid columns={[
            { key: "name", header: "Staff", render: (r: PayrollRow) => <span className="inline-flex items-center gap-2">{r.name}{r.incomplete && <span title="Incomplete attendance" className="text-xs px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 font-bold">review</span>}</span> },
            { key: "role", header: "Role" }, { key: "type", header: "Type", render: (r: PayrollRow) => r.payType },
            { key: "hours", header: "Hours", align: "right" },
            { key: "ot", header: "OT hrs", align: "right", render: (r: PayrollRow) => r.otHours || "—" },
            { key: "rate", header: "Rate", align: "right", render: (r: PayrollRow) => `₹${r.hourlyRate}` },
            { key: "gross", header: "Gross Pay", align: "right", render: (r: PayrollRow) => <span className="font-bold tabular-nums">₹{r.grossPay}</span> },
          ]} data={payroll} selectable={false} onRowClick={() => {}} />
          <p className="text-xs text-muted font-medium">Export only — no bank transfers are initiated from this screen.</p>
        </div>
      )}

      {/* ── Invite / edit ── */}
      <Drawer open={creating || !!detail} onClose={() => { setCreating(false); setDetail(null); }} title={creating ? "Invite Staff" : detail?.name ?? ""}>
        <FormField label="Name" required><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="Phone" required><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
        <FormField label="Email"><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
        {creating && (<>
          <FormField label="Role"><select className={selectClass} value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>{roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></FormField>
          <FormField label="Location"><select className={selectClass} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></FormField>
        </>)}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Pay rate (₹)"><input type="number" className={inputClass} value={form.payRate} onChange={(e) => setForm({ ...form, payRate: Number(e.target.value) })} /></FormField>
          <FormField label="Pay type"><select className={selectClass} value={form.payType} onChange={(e) => setForm({ ...form, payType: e.target.value })}><option value="hourly">Hourly</option><option value="monthly">Monthly</option></select></FormField>
        </div>
        <div className="flex gap-3 mt-4">
          <BtnPrimary onClick={saveStaff}><Save size={18} /> {creating ? "Send Invite" : "Save"}</BtnPrimary>
          {!creating && detail && (detail.status === "active"
            ? <BtnSecondary onClick={() => setConfirmDelete(detail.id)}><Trash2 size={18} /> Deactivate</BtnSecondary>
            : <BtnSecondary onClick={() => reactivate(detail.id)}><RotateCcw size={18} /> Reactivate</BtnSecondary>)}
        </div>
      </Drawer>

      {/* ── Bulk invite ── */}
      <Drawer open={showBulk} onClose={() => setShowBulk(false)} title="Bulk Invite (CSV)" width="600px">
        <p className="text-sm text-muted font-medium mb-2">One per line: <code className="bg-cream px-1 rounded">phone,name,role,location</code>. Duplicates and missing phones are skipped with reasons.</p>
        <textarea className={`${inputClass} min-h-40 font-mono text-sm`} value={bulkText} onChange={(e) => setBulkText(e.target.value)} placeholder="9876543210,Asha,Cashier,Main Branch" />
        <BtnPrimary onClick={submitBulk} className="mt-3"><Upload size={18} /> Validate & Invite</BtnPrimary>
        {bulkResults && (
          <div className="mt-4">
            <h3 className="font-bold mb-2">Results — {bulkResults.filter((r) => r.ok).length}/{bulkResults.length} created</h3>
            <ul className="space-y-1 text-sm max-h-60 overflow-auto">{bulkResults.map((r) => (
              <li key={r.row} className={cn("flex justify-between p-2 rounded-lg", r.ok ? "bg-green-50" : "bg-red-50")}>
                <span>Row {r.row}: {r.phone || "—"}</span><span className={cn("font-bold", r.ok ? "text-green-700" : "text-red-700")}>{r.ok ? "Invited" : r.error}</span>
              </li>
            ))}</ul>
          </div>
        )}
      </Drawer>

      {/* ── Attendance adjust ── */}
      <Drawer open={!!adjust} onClose={() => setAdjust(null)} title={`Adjust — ${adjust?.user.name ?? ""}`}>
        <div className="flex items-center gap-2 mb-3 text-sm text-muted font-medium"><Clock size={16} /> Editing clock times requires a reason (audited).</div>
        <FormField label="Clock in"><input type="datetime-local" className={inputClass} value={adjustForm.clockIn} onChange={(e) => setAdjustForm({ ...adjustForm, clockIn: e.target.value })} /></FormField>
        <FormField label="Clock out"><input type="datetime-local" className={inputClass} value={adjustForm.clockOut} onChange={(e) => setAdjustForm({ ...adjustForm, clockOut: e.target.value })} /></FormField>
        <FormField label="Reason" required><input className={inputClass} value={adjustForm.reason} onChange={(e) => setAdjustForm({ ...adjustForm, reason: e.target.value })} /></FormField>
        <BtnPrimary onClick={saveAdjust} className="mt-2"><Save size={18} /> Save Adjustment</BtnPrimary>
      </Drawer>

      <ConfirmDialog open={!!confirmDelete} title="Deactivate staff?" message="Staff member will be marked inactive." confirmLabel="Deactivate" destructive requireReason
        onConfirm={(reason) => confirmDelete && deactivate(confirmDelete, reason)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
