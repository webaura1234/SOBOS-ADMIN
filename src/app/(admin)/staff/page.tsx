"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, PageHeader, StatusDot, TabBar, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { ConfirmDialog, FormField, inputClass, selectClass, exportCsv } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { format } from "date-fns";
import { Plus, Save, Trash2 } from "lucide-react";

interface StaffRow {
  id: string; name: string; phone: string; status: string;
  locationRoles: { role: { name: string }; location: { name: string } | null }[];
  attendance: { clockIn: string; clockOut: string | null }[];
}

interface ScheduleSlot { id: string; userId: string; locationId: string; dayOfWeek: number; startTime: string; endTime: string; status: string }
interface PayrollRow { id: string; name: string; role: string; hours: number; hourlyRate: number; grossPay: number }

export default function StaffPage() {
  return (
    <Suspense fallback={<div className="animate-pulse h-32 bg-cream rounded-xl" />}>
      <StaffPageContent />
    </Suspense>
  );
}

function StaffPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [attendance, setAttendance] = useState<{ id: string; user: { name: string }; clockIn: string; clockOut: string | null }[]>([]);
  const [schedule, setSchedule] = useState<ScheduleSlot[]>([]);
  const [payroll, setPayroll] = useState<PayrollRow[]>([]);
  const [roles, setRoles] = useState<{ id: string; name: string }[]>([]);
  const [locations, setLocations] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState("list");
  const [detail, setDetail] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", roleId: "", locationId: "" });
  const [scheduleForm, setScheduleForm] = useState({ userId: "", locationId: "", dayOfWeek: 1, startTime: "10:00", endTime: "18:00" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    if (tab === "attendance") {
      const data = await apiFetch<{ attendance: typeof attendance }>("/api/staff?tab=attendance");
      setAttendance(data.attendance);
    } else if (tab === "schedule") {
      const data = await apiFetch<{ schedule: ScheduleSlot[]; staff: { id: string; name: string }[]; locations: { id: string; name: string }[] }>("/api/staff?tab=schedule");
      setSchedule(data.schedule);
      setStaff(data.staff.map((user) => ({ ...user, phone: "", status: "active", locationRoles: [], attendance: [] })));
      setLocations(data.locations);
      setScheduleForm((current) => ({ ...current, userId: current.userId || data.staff[0]?.id || "", locationId: current.locationId || data.locations[0]?.id || "" }));
    } else if (tab === "payroll") {
      const data = await apiFetch<{ payroll: PayrollRow[] }>("/api/staff?tab=payroll");
      setPayroll(data.payroll);
    } else {
      const data = await apiFetch<{ staff: StaffRow[]; roles: { id: string; name: string }[]; locations: { id: string; name: string }[] }>("/api/staff");
      setStaff(data.staff);
      setRoles(data.roles);
      setLocations(data.locations);
      setForm((current) => ({ ...current, roleId: current.roleId || data.roles.find((r) => r.name === "Manager")?.id || data.roles[0]?.id || "", locationId: current.locationId || data.locations[0]?.id || "" }));
    }
  };

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [tab, toast]);

  useEffect(() => {
    if (searchParams.get("action") === "invite") {
      setCreating(true);
      setDetail(null);
      setForm({ name: "", phone: "", email: "", roleId: roles[0]?.id ?? "", locationId: locations[0]?.id ?? "" });
    }
    const openId = searchParams.get("open");
    if (openId && staff.length > 0) {
      const row = staff.find((s) => s.id === openId);
      if (row) {
        setCreating(false);
        setDetail(row);
        setForm({ name: row.name, phone: row.phone, email: "", roleId: "", locationId: "" });
      }
    }
  }, [searchParams, staff]);

  const saveStaff = async () => {
    try {
      if (creating) {
        await apiFetch("/api/staff", { method: "POST", body: JSON.stringify(form) });
        toast("Staff invited");
      } else if (detail) {
        await apiFetch("/api/staff", { method: "PATCH", body: JSON.stringify({ id: detail.id, ...form }) });
        toast("Staff updated");
      }
      setCreating(false); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const deactivate = async (id: string, reason?: string) => {
    try {
      await apiFetch(`/api/staff?id=${id}&reason=${encodeURIComponent(reason ?? "No reason provided")}`, { method: "DELETE" });
      toast("Staff deactivated"); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const createSchedule = async () => {
    try {
      await apiFetch("/api/staff", { method: "POST", body: JSON.stringify({ type: "schedule", ...scheduleForm }) });
      toast("Schedule slot published");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const clockOut = async (id: string) => {
    try {
      await apiFetch("/api/staff", { method: "PATCH", body: JSON.stringify({ type: "clock_out", id }) });
      toast("Clocked out");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const columns: Column<StaffRow>[] = [
    { key: "name", header: "Name" }, { key: "phone", header: "Phone" },
    { key: "role", header: "Role", render: (r) => r.locationRoles.map((lr) => lr.role.name).join(", ") || "—" },
    { key: "status", header: "Status", render: (r) => <StatusDot status={r.status} /> },
    { key: "clock", header: "Today", render: (r) => r.attendance[0]?.clockOut ? "Off duty" : r.attendance[0] ? `In since ${format(new Date(r.attendance[0].clockIn), "HH:mm")}` : "—" },
  ];

  return (
    <div>
      <PageHeader title="Staff & Labor" subtitle="Invite, attendance, scheduling, payroll"
        actions={<BtnPrimary onClick={() => { setCreating(true); setDetail(null); setForm({ name: "", phone: "", email: "", roleId: roles[0]?.id ?? "", locationId: locations[0]?.id ?? "" }); }}><Plus size={18} /> Invite Staff</BtnPrimary>} />
      <TabBar tabs={[{ id: "list", label: "Staff List" }, { id: "attendance", label: "Attendance" }, { id: "schedule", label: "Scheduler" }, { id: "payroll", label: "Payroll" }]} active={tab} onChange={setTab} />

      {tab === "list" && <DenseGrid columns={columns} data={staff} selectable={false} onRowClick={(r) => { setCreating(false); setDetail(r); setForm({ name: r.name, phone: r.phone, email: "", roleId: "", locationId: "" }); }} />}
      {tab === "attendance" && <DenseGrid columns={[
        { key: "name", header: "Staff", render: (r) => r.user.name },
        { key: "in", header: "Clock In", render: (r) => format(new Date(r.clockIn), "dd MMM HH:mm") },
        { key: "out", header: "Clock Out", render: (r) => r.clockOut ? format(new Date(r.clockOut), "HH:mm") : "Active" },
        { key: "action", header: "Action", render: (r) => r.clockOut ? "—" : <button type="button" onClick={(e) => { e.stopPropagation(); clockOut(r.id); }} className="font-bold underline">Clock out</button> },
      ]} data={attendance} selectable={false} onRowClick={() => {}} />}
      {tab === "schedule" && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3 p-4 bg-white border-2 border-border rounded-xl">
            <FormField label="Staff"><select className={selectClass} value={scheduleForm.userId} onChange={(e) => setScheduleForm({ ...scheduleForm, userId: e.target.value })}>{staff.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></FormField>
            <FormField label="Location"><select className={selectClass} value={scheduleForm.locationId} onChange={(e) => setScheduleForm({ ...scheduleForm, locationId: e.target.value })}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></FormField>
            <FormField label="Day"><select className={selectClass} value={scheduleForm.dayOfWeek} onChange={(e) => setScheduleForm({ ...scheduleForm, dayOfWeek: Number(e.target.value) })}>{["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d, i) => <option key={d} value={i}>{d}</option>)}</select></FormField>
            <FormField label="Start"><input type="time" className={inputClass} value={scheduleForm.startTime} onChange={(e) => setScheduleForm({ ...scheduleForm, startTime: e.target.value })} /></FormField>
            <FormField label="End"><input type="time" className={inputClass} value={scheduleForm.endTime} onChange={(e) => setScheduleForm({ ...scheduleForm, endTime: e.target.value })} /></FormField>
            <div className="md:col-span-5"><BtnPrimary onClick={createSchedule}><Save size={18} /> Publish Slot</BtnPrimary></div>
          </div>
          <DenseGrid columns={[
            { key: "staff", header: "Staff", render: (r) => staff.find((s) => s.id === r.userId)?.name ?? r.userId },
            { key: "loc", header: "Location", render: (r) => locations.find((l) => l.id === r.locationId)?.name ?? r.locationId },
            { key: "day", header: "Day", render: (r) => ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][r.dayOfWeek] },
            { key: "time", header: "Shift", render: (r) => `${r.startTime}-${r.endTime}` },
            { key: "status", header: "Status", render: (r) => <StatusDot status={r.status} /> },
          ]} data={schedule} selectable={false} onRowClick={() => {}} />
        </div>
      )}
      {tab === "payroll" && (
        <div className="space-y-4">
          <BtnSecondary onClick={() => { exportCsv("payroll.csv", ["Name", "Role", "Hours", "Rate", "Gross"], payroll.map((r) => [r.name, r.role, r.hours, r.hourlyRate, r.grossPay])); toast("Payroll exported"); }}>Export Payroll CSV</BtnSecondary>
          <DenseGrid columns={[
            { key: "name", header: "Staff" }, { key: "role", header: "Role" },
            { key: "hours", header: "Hours", align: "right" }, { key: "hourlyRate", header: "Rate", align: "right", render: (r) => `₹${r.hourlyRate}/h` },
            { key: "grossPay", header: "Gross Pay", align: "right", render: (r) => `₹${r.grossPay}` },
          ]} data={payroll} selectable={false} onRowClick={() => {}} />
        </div>
      )}

      <Drawer open={creating || !!detail} onClose={() => { setCreating(false); setDetail(null); }} title={creating ? "Invite Staff" : detail?.name ?? ""}>
        <FormField label="Name" required><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="Phone" required><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
        <FormField label="Email"><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
        {creating && (
          <>
            <FormField label="Role"><select className={selectClass} value={form.roleId} onChange={(e) => setForm({ ...form, roleId: e.target.value })}>{roles.map((role) => <option key={role.id} value={role.id}>{role.name}</option>)}</select></FormField>
            <FormField label="Location"><select className={selectClass} value={form.locationId} onChange={(e) => setForm({ ...form, locationId: e.target.value })}>{locations.map((loc) => <option key={loc.id} value={loc.id}>{loc.name}</option>)}</select></FormField>
          </>
        )}
        <div className="flex gap-3 mt-4">
          <BtnPrimary onClick={saveStaff}><Save size={18} /> {creating ? "Send Invite" : "Save"}</BtnPrimary>
          {!creating && detail && <BtnSecondary onClick={() => setConfirmDelete(detail.id)}><Trash2 size={18} /> Deactivate</BtnSecondary>}
        </div>
      </Drawer>

      <ConfirmDialog open={!!confirmDelete} title="Deactivate staff?" message="Staff member will be marked inactive." confirmLabel="Deactivate" destructive requireReason
        onConfirm={(reason) => confirmDelete && deactivate(confirmDelete, reason)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
