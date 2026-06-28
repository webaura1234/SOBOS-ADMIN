"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, TabBar, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { ConfirmDialog, FormField, inputClass, selectClass } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { Copy, Plus, Save, Trash2, Lock } from "lucide-react";

interface Permission { id: string; resource: string; action: string; label: string; group: string; description: string | null; }
interface Role { id: string; name: string; description: string | null; isTemplate: boolean; permissions: { permissionId: string; permission: Permission }[]; _count: { assignments: number; permissions: number }; }
interface Hours { id: string; dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean; }
interface Location { id: string; name: string; address: string; city: string; pin: string; phone: string | null; email: string | null; taxSlab: number; status: string; operatingHours: Hours[]; }
interface UserRow { id: string; name: string; locationRoles: { id: string; role: { id: string; name: string }; location: { id: string; name: string } | null }[]; }
interface Holiday { id: string; locationId: string; date: string; name: string; }
interface SettingsData { restaurant: { id: string; name: string; tagline: string | null; description: string | null; logoUrl: string | null; cuisineTags: string; fssai: string | null; gstin: string | null; email: string | null; phone: string | null } | null; locations: Location[]; toggles: { id: string; key: string; group: string; enabled: boolean }[]; roles: Role[]; permissions: Permission[]; users: UserRow[]; holidays: Holiday[]; }

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
// Dependency map: a feature can only be enabled when its prerequisite is on.
const FEATURE_DEPS: Record<string, string> = { qr_ordering: "dine_in", reservations: "dine_in" };

function SettingsPageContent() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const [data, setData] = useState<SettingsData | null>(null);
  // Honor deep links from the Setup wizard, e.g. /settings?tab=hours.
  const initialTab = searchParams.get("tab");
  const [tab, setTab] = useState(initialTab && ["profile", "locations", "hours", "roles", "assignments", "features"].includes(initialTab) ? initialTab : "profile");
  const [profile, setProfile] = useState({ name: "", tagline: "", description: "", logoUrl: "", cuisineTags: "", fssai: "", gstin: "", email: "", phone: "" });
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState({ name: "", description: "", permissionIds: [] as string[], creating: false });
  const [locationDrafts, setLocationDrafts] = useState<Record<string, { name: string; address: string; city: string; pin: string; phone: string; email: string; taxSlab: number; status: string }>>({});
  const [newLocation, setNewLocation] = useState({ name: "", address: "", city: "", pin: "", taxSlab: 5 });
  const [hoursLoc, setHoursLoc] = useState("");
  const [holidayForm, setHolidayForm] = useState({ date: "", name: "" });
  const [confirmRole, setConfirmRole] = useState<string | null>(null);
  const [assignForm, setAssignForm] = useState({ userId: "", roleId: "", locationId: "" });

  const load = async () => {
    const d = await apiFetch<SettingsData>("/api/settings");
    setData(d);
    if (d.restaurant) setProfile({ name: d.restaurant.name, tagline: d.restaurant.tagline ?? "", description: d.restaurant.description ?? "", logoUrl: d.restaurant.logoUrl ?? "", cuisineTags: (() => { try { return JSON.parse(d.restaurant.cuisineTags).join(", "); } catch { return ""; } })(), fssai: d.restaurant.fssai ?? "", gstin: d.restaurant.gstin ?? "", email: d.restaurant.email ?? "", phone: d.restaurant.phone ?? "" });
    setLocationDrafts(Object.fromEntries(d.locations.map((loc) => [loc.id, { name: loc.name, address: loc.address, city: loc.city, pin: loc.pin, phone: loc.phone ?? "", email: loc.email ?? "", taxSlab: loc.taxSlab, status: loc.status }])));
    if (!hoursLoc && d.locations[0]) setHoursLoc(d.locations[0].id);
  };
  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [toast]);

  useEffect(() => {
    if (!data?.roles.length || selectedRoleId === "__new__") return;
    const selected = data.roles.find((r) => r.id === selectedRoleId) ?? data.roles[0];
    setSelectedRoleId(selected.id);
    setRoleDraft({ name: selected.name, description: selected.description ?? "", permissionIds: selected.permissions.map((p) => p.permissionId), creating: false });
  }, [data, selectedRoleId]);

  const saveProfile = async () => {
    if (!data?.restaurant) return;
    try {
      await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify({ type: "restaurant", id: data.restaurant.id, name: profile.name, tagline: profile.tagline, description: profile.description, logoUrl: profile.logoUrl, cuisineTags: JSON.stringify(profile.cuisineTags.split(",").map((s) => s.trim()).filter(Boolean)), fssai: profile.fssai, gstin: profile.gstin, email: profile.email, phone: profile.phone }) });
      toast("Profile saved"); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const toggleFeature = async (id: string, key: string, enabled: boolean) => {
    if (enabled && FEATURE_DEPS[key]) {
      const dep = data?.toggles.find((t) => t.key === FEATURE_DEPS[key]);
      if (dep && !dep.enabled) { toast(`Enable "${FEATURE_DEPS[key].replace(/_/g, " ")}" first`, "error"); return; }
    }
    if (!enabled) {
      const dependents = Object.entries(FEATURE_DEPS).filter(([, dep]) => dep === key).map(([k]) => k);
      const active = data?.toggles.filter((t) => dependents.includes(t.key) && t.enabled) ?? [];
      if (active.length) { toast(`Disable ${active.map((t) => t.key.replace(/_/g, " ")).join(", ")} first`, "error"); return; }
    }
    try { await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify({ type: "toggle", id, enabled }) }); toast("Feature updated"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const saveHours = async (id: string, patch: Partial<Hours>) => { try { await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify({ type: "hours", id, ...patch }) }); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const addShift = async (dayOfWeek: number) => { try { await apiFetch("/api/settings", { method: "POST", body: JSON.stringify({ type: "hours_row", locationId: hoursLoc, dayOfWeek }) }); toast("Split shift added"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const removeShift = async (id: string) => { try { await apiFetch(`/api/settings?type=hours_row&id=${id}`, { method: "DELETE" }); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const addHoliday = async () => { if (!holidayForm.date || !holidayForm.name) return; try { await apiFetch("/api/settings", { method: "POST", body: JSON.stringify({ type: "holiday", locationId: hoursLoc, ...holidayForm }) }); toast("Holiday added"); setHolidayForm({ date: "", name: "" }); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const removeHoliday = async (id: string) => { try { await apiFetch(`/api/settings?type=holiday&id=${id}`, { method: "DELETE" }); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  const saveLocation = async (id: string) => { const draft = locationDrafts[id]; if (!draft) return; try { await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify({ type: "location", id, ...draft }) }); toast("Location saved"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const createLocation = async () => { if (!data?.restaurant) return; try { await apiFetch("/api/settings", { method: "POST", body: JSON.stringify({ type: "location", restaurantId: data.restaurant.id, ...newLocation }) }); toast("Location created"); setNewLocation({ name: "", address: "", city: "", pin: "", taxSlab: 5 }); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  const selectRole = (id: string) => { const role = data?.roles.find((r) => r.id === id); if (!role) return; setSelectedRoleId(role.id); setRoleDraft({ name: role.name, description: role.description ?? "", permissionIds: role.permissions.map((p) => p.permissionId), creating: false }); };
  const applyTemplate = (role: Role) => { setSelectedRoleId("__new__"); setRoleDraft({ name: `${role.name} (copy)`, description: role.description ?? "", permissionIds: role.permissions.map((p) => p.permissionId), creating: true }); };
  const cloneRole = () => { setSelectedRoleId("__new__"); setRoleDraft({ ...roleDraft, name: `${roleDraft.name || "Role"} Copy`, creating: true }); };
  const togglePermission = (permissionId: string) => setRoleDraft({ ...roleDraft, permissionIds: roleDraft.permissionIds.includes(permissionId) ? roleDraft.permissionIds.filter((id) => id !== permissionId) : [...roleDraft.permissionIds, permissionId] });
  const saveRole = async () => {
    if (!data?.restaurant) return;
    try {
      const payload = { type: "role", id: roleDraft.creating ? undefined : selectedRoleId, restaurantId: data.restaurant.id, name: roleDraft.name, description: roleDraft.description, permissionIds: roleDraft.permissionIds };
      await apiFetch("/api/settings", { method: roleDraft.creating ? "POST" : "PATCH", body: JSON.stringify(payload) });
      toast(roleDraft.creating ? "Role created" : "Role saved"); await load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed to save role", "error"); }
  };
  const deleteRole = async () => { if (!confirmRole) return; try { await apiFetch(`/api/settings?type=role&id=${confirmRole}`, { method: "DELETE" }); toast("Role deleted"); setConfirmRole(null); setSelectedRoleId(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  const addAssignment = async () => { if (!assignForm.userId || !assignForm.roleId) { toast("Pick a user and role", "error"); return; } try { await apiFetch("/api/settings", { method: "POST", body: JSON.stringify({ type: "assignment", ...assignForm, locationId: assignForm.locationId || null }) }); toast("Role assigned"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const removeAssignment = async (id: string) => { try { await apiFetch(`/api/settings?type=assignment&id=${id}`, { method: "DELETE" }); toast("Assignment removed"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  if (!data) return <div className="animate-pulse h-32 bg-cream rounded-xl" />;
  const groupedToggles = data.toggles.reduce<Record<string, typeof data.toggles>>((acc, t) => { (acc[t.group] ??= []).push(t); return acc; }, {});
  const hoursLocation = data.locations.find((l) => l.id === hoursLoc) ?? data.locations[0];
  const locHolidays = data.holidays.filter((h) => h.locationId === hoursLoc);
  const templates = data.roles.filter((r) => r.isTemplate);

  return (
    <div>
      <PageHeader title="Settings" subtitle="Profile, locations, hours, roles, assignments, feature toggles" />
      <TabBar tabs={[{ id: "profile", label: "Profile" }, { id: "locations", label: "Locations" }, { id: "hours", label: "Operating Hours" }, { id: "roles", label: "Roles" }, { id: "assignments", label: "Assignments" }, { id: "features", label: "Feature Toggles" }]} active={tab} onChange={setTab} />

      {tab === "profile" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-2xl space-y-1">
          <div className="grid grid-cols-2 gap-3">
            <FormField label="Name"><input className={inputClass} value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} /></FormField>
            <FormField label="Tagline" hint="≤150 chars"><input className={inputClass} maxLength={150} value={profile.tagline} onChange={(e) => setProfile({ ...profile, tagline: e.target.value })} /></FormField>
          </div>
          <FormField label="Description" hint="≤1000 chars"><textarea className={`${inputClass} min-h-24`} maxLength={1000} value={profile.description} onChange={(e) => setProfile({ ...profile, description: e.target.value })} /></FormField>
          <FormField label="Logo URL" hint="JPEG/PNG"><input className={inputClass} value={profile.logoUrl} onChange={(e) => setProfile({ ...profile, logoUrl: e.target.value })} /></FormField>
          {profile.logoUrl && <img src={profile.logoUrl} alt="logo" className="h-16 w-16 rounded-xl object-cover border-2 border-border mb-3" />}
          <FormField label="Cuisine tags" hint="Comma-separated"><input className={inputClass} value={profile.cuisineTags} onChange={(e) => setProfile({ ...profile, cuisineTags: e.target.value })} /></FormField>
          <div className="grid grid-cols-2 gap-3">
            <FormField label="FSSAI (14-digit)"><input className={inputClass} value={profile.fssai} onChange={(e) => setProfile({ ...profile, fssai: e.target.value })} /></FormField>
            <FormField label="GSTIN (15-char)"><input className={inputClass} value={profile.gstin} onChange={(e) => setProfile({ ...profile, gstin: e.target.value })} /></FormField>
            <FormField label="Email"><input className={inputClass} value={profile.email} onChange={(e) => setProfile({ ...profile, email: e.target.value })} /></FormField>
            <FormField label="Phone"><input className={inputClass} value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} /></FormField>
          </div>
          <BtnPrimary onClick={saveProfile} className="mt-4"><Save size={18} /> Save Profile</BtnPrimary>
        </div>
      )}

      {tab === "locations" && (
        <div className="space-y-4">
          {data.locations.map((loc) => {
            const draft = locationDrafts[loc.id] ?? { name: loc.name, address: loc.address, city: loc.city, pin: loc.pin, phone: loc.phone ?? "", email: loc.email ?? "", taxSlab: loc.taxSlab, status: loc.status };
            const set = (patch: Partial<typeof draft>) => setLocationDrafts({ ...locationDrafts, [loc.id]: { ...draft, ...patch } });
            return (
              <div key={loc.id} className="bg-white border-2 border-border rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <FormField label="Name"><input className={inputClass} value={draft.name} onChange={(e) => set({ name: e.target.value })} /></FormField>
                  <FormField label="City"><input className={inputClass} value={draft.city} onChange={(e) => set({ city: e.target.value })} /></FormField>
                  <FormField label="PIN"><input className={inputClass} value={draft.pin} onChange={(e) => set({ pin: e.target.value })} /></FormField>
                  <FormField label="Address"><input className={inputClass} value={draft.address} onChange={(e) => set({ address: e.target.value })} /></FormField>
                  <FormField label="Phone"><input className={inputClass} value={draft.phone} onChange={(e) => set({ phone: e.target.value })} /></FormField>
                  <FormField label="Email"><input className={inputClass} value={draft.email} onChange={(e) => set({ email: e.target.value })} /></FormField>
                  <FormField label="Tax Slab (GST %)"><select className={selectClass} value={draft.taxSlab} onChange={(e) => set({ taxSlab: Number(e.target.value) })}>{[5, 12, 18, 28].map((g) => <option key={g} value={g}>{g}%</option>)}</select></FormField>
                  <FormField label="Status"><select className={selectClass} value={draft.status} onChange={(e) => set({ status: e.target.value })}><option value="active">Active</option><option value="setup">Setup</option><option value="deactivated">Deactivated</option></select></FormField>
                </div>
                <BtnPrimary onClick={() => saveLocation(loc.id)} className="mt-4"><Save size={18} /> Save Location</BtnPrimary>
              </div>
            );
          })}
          <div className="bg-cream border-2 border-border rounded-xl p-5">
            <h3 className="font-bold text-lg mb-3">Add Location</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <FormField label="Name"><input className={inputClass} value={newLocation.name} onChange={(e) => setNewLocation({ ...newLocation, name: e.target.value })} /></FormField>
              <FormField label="Address"><input className={inputClass} value={newLocation.address} onChange={(e) => setNewLocation({ ...newLocation, address: e.target.value })} /></FormField>
              <FormField label="City"><input className={inputClass} value={newLocation.city} onChange={(e) => setNewLocation({ ...newLocation, city: e.target.value })} /></FormField>
              <FormField label="PIN"><input className={inputClass} value={newLocation.pin} onChange={(e) => setNewLocation({ ...newLocation, pin: e.target.value })} /></FormField>
              <FormField label="Tax Slab (%)"><input type="number" className={inputClass} value={newLocation.taxSlab} onChange={(e) => setNewLocation({ ...newLocation, taxSlab: Number(e.target.value) })} /></FormField>
            </div>
            <BtnPrimary onClick={createLocation} className="mt-4"><Plus size={18} /> Create Location</BtnPrimary>
          </div>
        </div>
      )}

      {tab === "hours" && hoursLocation && (
        <div className="space-y-4 max-w-3xl">
          {data.locations.length > 1 && <FormField label="Location"><select className={selectClass} value={hoursLoc} onChange={(e) => setHoursLoc(e.target.value)}>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></FormField>}
          {DAYS.map((day, d) => {
            const rows = hoursLocation.operatingHours.filter((h) => h.dayOfWeek === d);
            return (
              <div key={d} className="bg-white border-2 border-border rounded-xl p-4">
                <div className="flex items-center justify-between mb-2"><span className="font-bold w-12">{day}</span><button type="button" onClick={() => addShift(d)} className="text-sm font-bold underline">+ Split shift</button></div>
                {rows.length === 0 && <p className="text-sm text-muted">No hours set</p>}
                {rows.map((h) => (
                  <div key={h.id} className="flex items-center gap-3 mb-2">
                    <label className="flex items-center gap-1.5 text-sm font-bold"><input type="checkbox" checked={h.isClosed} onChange={(e) => saveHours(h.id, { isClosed: e.target.checked })} className="w-4 h-4 accent-[#F4B315]" /> Closed</label>
                    <input type="time" disabled={h.isClosed} className={inputClass + " w-32 disabled:opacity-40"} defaultValue={h.openTime} onBlur={(e) => saveHours(h.id, { openTime: e.target.value })} />
                    <span>–</span>
                    <input type="time" disabled={h.isClosed} className={inputClass + " w-32 disabled:opacity-40"} defaultValue={h.closeTime} onBlur={(e) => saveHours(h.id, { closeTime: e.target.value })} />
                    {rows.length > 1 && <button type="button" onClick={() => removeShift(h.id)} className="text-red-600 font-bold">×</button>}
                  </div>
                ))}
              </div>
            );
          })}
          <div className="bg-white border-2 border-border rounded-xl p-4">
            <h3 className="font-bold mb-3">Holiday closures &amp; special hours</h3>
            <div className="flex gap-2 items-end mb-3">
              <FormField label="Date"><input type="date" className={inputClass} value={holidayForm.date} onChange={(e) => setHolidayForm({ ...holidayForm, date: e.target.value })} /></FormField>
              <FormField label="Name"><input className={inputClass} value={holidayForm.name} onChange={(e) => setHolidayForm({ ...holidayForm, name: e.target.value })} placeholder="Diwali" /></FormField>
              <BtnSecondary onClick={addHoliday} className="mb-5"><Plus size={16} /> Add</BtnSecondary>
            </div>
            <ul className="space-y-1">{locHolidays.map((h) => <li key={h.id} className="flex justify-between p-2 bg-cream rounded-lg text-sm"><span className="font-bold">{format(new Date(h.date), "dd MMM yyyy")} — {h.name}</span><button type="button" onClick={() => removeHoliday(h.id)} className="text-red-600 font-bold underline">Remove</button></li>)}{locHolidays.length === 0 && <li className="text-sm text-muted">No holidays set</li>}</ul>
          </div>
        </div>
      )}

      {tab === "roles" && (
        <div className="space-y-4">
          {templates.length > 0 && (
            <div className="page-surface p-4">
              <h3 className="font-bold mb-2">Template gallery</h3>
              <div className="flex flex-wrap gap-2">{templates.map((t) => (
                <button key={t.id} type="button" onClick={() => applyTemplate(t)} className="px-3 py-2 rounded-xl border-2 border-border bg-white hover:border-primary text-left focus-ring"><div className="font-bold text-sm">{t.name}</div><div className="text-xs text-muted">{t._count.permissions} perms · use as base</div></button>
              ))}</div>
            </div>
          )}
          <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
            <div className="bg-white border-2 border-border rounded-xl p-4">
              <div className="flex items-center justify-between gap-2 mb-3"><h3 className="font-bold text-lg">Roles</h3><BtnSecondary onClick={cloneRole}><Copy size={16} /> Clone</BtnSecondary></div>
              <button type="button" onClick={() => { setSelectedRoleId("__new__"); setRoleDraft({ name: "New Role", description: "", permissionIds: [], creating: true }); }} className="w-full mb-3 h-10 rounded-xl border-2 border-border bg-cream font-bold flex items-center justify-center gap-2 focus-ring"><Plus size={16} /> New Role</button>
              {data.roles.map((role) => (
                <button key={role.id} type="button" onClick={() => selectRole(role.id)} className={`w-full text-left p-3 rounded-xl border-2 mb-2 focus-ring ${selectedRoleId === role.id ? "border-primary bg-primary/15" : "border-border bg-white hover:bg-cream"}`}>
                  <div className="font-bold flex items-center gap-1.5">{role.name}{role.isTemplate && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cream border border-border">template</span>}</div>
                  <div className="text-xs font-semibold text-muted">{role._count.assignments} staff · {role._count.permissions} permissions</div>
                </button>
              ))}
            </div>
            <div className="bg-white border-2 border-border rounded-xl p-5">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
                <FormField label="Role Name"><input className={inputClass} value={roleDraft.name} onChange={(e) => setRoleDraft({ ...roleDraft, name: e.target.value })} /></FormField>
                <FormField label="Description"><input className={inputClass} value={roleDraft.description} onChange={(e) => setRoleDraft({ ...roleDraft, description: e.target.value })} /></FormField>
              </div>
              {Object.entries(data.permissions.reduce<Record<string, Permission[]>>((acc, p) => { (acc[p.group] ??= []).push(p); return acc; }, {})).map(([group, perms]) => (
                <div key={group} className="mb-5">
                  <h4 className="text-sm font-bold uppercase tracking-wide text-muted mb-2">{group}</h4>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">{perms.map((p) => (
                    <label key={p.id} className="flex items-start gap-3 p-3 rounded-xl border-2 border-border bg-cream/40 font-bold"><input type="checkbox" checked={roleDraft.permissionIds.includes(p.id)} onChange={() => togglePermission(p.id)} className="w-5 h-5 mt-0.5 accent-[#F4B315]" /><span><span className="block text-black">{p.label}</span><span className="block text-xs text-muted">{p.resource}.{p.action}</span></span></label>
                  ))}</div>
                </div>
              ))}
              <div className="flex gap-3"><BtnPrimary onClick={saveRole}><Save size={18} /> Save Role</BtnPrimary>{!roleDraft.creating && selectedRoleId && <BtnSecondary onClick={() => setConfirmRole(selectedRoleId)}><Trash2 size={18} /> Delete</BtnSecondary>}</div>
            </div>
          </div>
        </div>
      )}

      {tab === "assignments" && (
        <div className="space-y-4 max-w-3xl">
          <div className="page-surface p-4">
            <h3 className="font-bold mb-3">Assign a role</h3>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
              <FormField label="User"><select className={selectClass} value={assignForm.userId} onChange={(e) => setAssignForm({ ...assignForm, userId: e.target.value })}><option value="">— user —</option>{data.users.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}</select></FormField>
              <FormField label="Role"><select className={selectClass} value={assignForm.roleId} onChange={(e) => setAssignForm({ ...assignForm, roleId: e.target.value })}><option value="">— role —</option>{data.roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</select></FormField>
              <FormField label="Location"><select className={selectClass} value={assignForm.locationId} onChange={(e) => setAssignForm({ ...assignForm, locationId: e.target.value })}><option value="">All locations</option>{data.locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></FormField>
              <BtnPrimary onClick={addAssignment} className="mb-5"><Plus size={18} /> Assign</BtnPrimary>
            </div>
          </div>
          {data.users.map((u) => (
            <div key={u.id} className="bg-white border-2 border-border rounded-xl p-4">
              <div className="font-bold mb-2">{u.name}</div>
              {u.locationRoles.length === 0 ? <p className="text-sm text-muted">No locations assigned</p> : (
                <div className="flex flex-wrap gap-2">{u.locationRoles.map((lr) => (
                  <span key={lr.id} className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-cream border-2 border-border text-sm font-bold">{lr.role.name} @ {lr.location?.name ?? "All Locations"}<button type="button" onClick={() => removeAssignment(lr.id)} className="text-red-600">×</button></span>
                ))}</div>
              )}
            </div>
          ))}
        </div>
      )}

      {tab === "features" && Object.entries(groupedToggles).map(([group, toggles]) => (
        <div key={group} className="bg-white border-2 border-border rounded-xl p-5 mb-4">
          <h3 className="font-bold mb-3">{group}</h3>
          {toggles.map((t) => {
            const dep = FEATURE_DEPS[t.key];
            const depOff = dep && !data.toggles.find((x) => x.key === dep)?.enabled;
            return (
              <label key={t.id} className="flex justify-between items-center py-2 font-bold capitalize">
                <span className="flex items-center gap-2">{t.key.replace(/_/g, " ")}{dep && <span className="text-xs font-medium text-muted inline-flex items-center gap-1"><Lock size={11} /> needs {dep.replace(/_/g, " ")}</span>}</span>
                <input type="checkbox" checked={t.enabled} disabled={!t.enabled && !!depOff} onChange={(e) => toggleFeature(t.id, t.key, e.target.checked)} className={cn("w-5 h-5 accent-[#F4B315]", !t.enabled && depOff && "opacity-40")} />
              </label>
            );
          })}
        </div>
      ))}

      <ConfirmDialog open={!!confirmRole} title="Delete role?" message="Roles with assigned staff or the last full-admin role can't be deleted." confirmLabel="Delete" destructive onConfirm={deleteRole} onCancel={() => setConfirmRole(null)} />
    </div>
  );
}

export default function SettingsPage() {
  return (
    <Suspense fallback={<div className="p-6 text-sm text-muted-foreground">Loading settings…</div>}>
      <SettingsPageContent />
    </Suspense>
  );
}
