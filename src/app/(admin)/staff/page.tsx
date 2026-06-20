"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, PageHeader, StatusDot, TabBar, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { ConfirmDialog, FormField, inputClass } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { format } from "date-fns";
import { Plus, Save, Trash2 } from "lucide-react";

interface StaffRow {
  id: string; name: string; phone: string; status: string;
  locationRoles: { role: { name: string }; location: { name: string } | null }[];
  attendance: { clockIn: string; clockOut: string | null }[];
}

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
  const [tab, setTab] = useState("list");
  const [detail, setDetail] = useState<StaffRow | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "" });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    if (tab === "attendance") {
      const data = await apiFetch<{ attendance: typeof attendance }>("/api/staff?tab=attendance");
      setAttendance(data.attendance);
    } else {
      const data = await apiFetch<{ staff: StaffRow[] }>("/api/staff");
      setStaff(data.staff);
    }
  };

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [tab, toast]);

  useEffect(() => {
    if (searchParams.get("action") === "invite") {
      setCreating(true);
      setDetail(null);
      setForm({ name: "", phone: "", email: "" });
    }
    const openId = searchParams.get("open");
    if (openId && staff.length > 0) {
      const row = staff.find((s) => s.id === openId);
      if (row) {
        setCreating(false);
        setDetail(row);
        setForm({ name: row.name, phone: row.phone, email: "" });
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

  const deactivate = async (id: string) => {
    try {
      await apiFetch(`/api/staff?id=${id}`, { method: "DELETE" });
      toast("Staff deactivated"); setDetail(null); load();
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
        actions={<BtnPrimary onClick={() => { setCreating(true); setDetail(null); setForm({ name: "", phone: "", email: "" }); }}><Plus size={18} /> Invite Staff</BtnPrimary>} />
      <TabBar tabs={[{ id: "list", label: "Staff List" }, { id: "attendance", label: "Attendance" }, { id: "schedule", label: "Scheduler" }, { id: "payroll", label: "Payroll" }]} active={tab} onChange={setTab} />

      {tab === "list" && <DenseGrid columns={columns} data={staff} selectable={false} onRowClick={(r) => { setCreating(false); setDetail(r); setForm({ name: r.name, phone: r.phone, email: "" }); }} />}
      {tab === "attendance" && <DenseGrid columns={[
        { key: "name", header: "Staff", render: (r) => r.user.name },
        { key: "in", header: "Clock In", render: (r) => format(new Date(r.clockIn), "dd MMM HH:mm") },
        { key: "out", header: "Clock Out", render: (r) => r.clockOut ? format(new Date(r.clockOut), "HH:mm") : "Active" },
      ]} data={attendance} selectable={false} onRowClick={() => {}} />}
      {tab === "schedule" && <div className="p-8 text-center bg-cream rounded-xl border-2 border-border"><p className="font-bold">Weekly scheduler — best on desktop for drag-drop</p></div>}
      {tab === "payroll" && <div className="p-5 bg-amber-50 border-2 border-amber-200 rounded-xl font-bold text-amber-900">Payroll export is Owner-only. Generates Excel/PDF.</div>}

      <Drawer open={creating || !!detail} onClose={() => { setCreating(false); setDetail(null); }} title={creating ? "Invite Staff" : detail?.name ?? ""}>
        <FormField label="Name" required><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="Phone" required><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
        <FormField label="Email"><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
        <div className="flex gap-3 mt-4">
          <BtnPrimary onClick={saveStaff}><Save size={18} /> {creating ? "Send Invite" : "Save"}</BtnPrimary>
          {!creating && detail && <BtnSecondary onClick={() => setConfirmDelete(detail.id)}><Trash2 size={18} /> Deactivate</BtnSecondary>}
        </div>
      </Drawer>

      <ConfirmDialog open={!!confirmDelete} title="Deactivate staff?" message="Staff member will be marked inactive." confirmLabel="Deactivate" destructive
        onConfirm={() => confirmDelete && deactivate(confirmDelete)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
