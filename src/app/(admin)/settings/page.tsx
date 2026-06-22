"use client";

import { useEffect, useState } from "react";
import { PageHeader, TabBar, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { FormField, inputClass } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { Copy, Plus, Save } from "lucide-react";

interface SettingsData {
  restaurant: { id: string; name: string; tagline: string | null; fssai: string | null; gstin: string | null; email: string | null; phone: string | null } | null;
  locations: { id: string; name: string; address: string; city: string; pin: string; taxSlab: number; status: string; operatingHours: { id: string; dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[] }[];
  toggles: { id: string; key: string; group: string; enabled: boolean }[];
  roles: { id: string; name: string; description: string | null; isTemplate: boolean; permissions: { permissionId: string; permission: Permission }[]; _count: { assignments: number; permissions: number } }[];
  permissions: Permission[];
}

interface Permission {
  id: string;
  resource: string;
  action: string;
  label: string;
  group: string;
  description: string | null;
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SettingsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<SettingsData | null>(null);
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState({ name: "", tagline: "", fssai: "", gstin: "", email: "", phone: "" });
  const [selectedRoleId, setSelectedRoleId] = useState<string | null>(null);
  const [roleDraft, setRoleDraft] = useState({ name: "", description: "", permissionIds: [] as string[], creating: false });
  const [locationDrafts, setLocationDrafts] = useState<Record<string, { name: string; address: string; city: string; pin: string; taxSlab: number; status: string }>>({});
  const [newLocation, setNewLocation] = useState({ name: "", address: "", city: "", pin: "", taxSlab: 5 });

  const load = async () => {
    const d = await apiFetch<SettingsData>("/api/settings");
    setData(d);
    if (d.restaurant) setProfile({ name: d.restaurant.name, tagline: d.restaurant.tagline ?? "", fssai: d.restaurant.fssai ?? "", gstin: d.restaurant.gstin ?? "", email: d.restaurant.email ?? "", phone: d.restaurant.phone ?? "" });
    setLocationDrafts(Object.fromEntries(d.locations.map((loc) => [loc.id, { name: loc.name, address: loc.address, city: loc.city, pin: loc.pin, taxSlab: loc.taxSlab, status: loc.status }])));
  };

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [toast]);

  useEffect(() => {
    if (!data?.roles.length) return;
    if (selectedRoleId === "__new__") return;
    const selected = data.roles.find((role) => role.id === selectedRoleId) ?? data.roles[0];
    setSelectedRoleId(selected.id);
    setRoleDraft({
      name: selected.name,
      description: selected.description ?? "",
      permissionIds: selected.permissions.map((p) => p.permissionId),
      creating: false,
    });
  }, [data, selectedRoleId]);

  const saveProfile = async () => {
    if (!data?.restaurant) return;
    try {
      await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify({ type: "restaurant", id: data.restaurant.id, ...profile }) });
      toast("Profile saved"); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const toggleFeature = async (id: string, enabled: boolean) => {
    try {
      await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify({ type: "toggle", id, enabled }) });
      toast("Feature updated"); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const saveHours = async (id: string, openTime: string, closeTime: string) => {
    try {
      await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify({ type: "hours", id, openTime, closeTime }) });
      toast("Hours updated");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const saveLocation = async (id: string) => {
    const draft = locationDrafts[id];
    if (!draft) return;
    try {
      await apiFetch("/api/settings", { method: "PATCH", body: JSON.stringify({ type: "location", id, ...draft }) });
      toast("Location saved");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const createLocation = async () => {
    if (!data?.restaurant) return;
    try {
      await apiFetch("/api/settings", { method: "POST", body: JSON.stringify({ type: "location", restaurantId: data.restaurant.id, ...newLocation }) });
      toast("Location created");
      setNewLocation({ name: "", address: "", city: "", pin: "", taxSlab: 5 });
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const selectRole = (id: string) => {
    const role = data?.roles.find((r) => r.id === id);
    if (!role) return;
    setSelectedRoleId(role.id);
    setRoleDraft({
      name: role.name,
      description: role.description ?? "",
      permissionIds: role.permissions.map((p) => p.permissionId),
      creating: false,
    });
  };

  const cloneRole = () => {
    const baseName = roleDraft.name || "Role";
    setSelectedRoleId("__new__");
    setRoleDraft({ ...roleDraft, name: `${baseName} Copy`, creating: true });
  };

  const togglePermission = (permissionId: string) => {
    const hasPermission = roleDraft.permissionIds.includes(permissionId);
    setRoleDraft({
      ...roleDraft,
      permissionIds: hasPermission
        ? roleDraft.permissionIds.filter((id) => id !== permissionId)
        : [...roleDraft.permissionIds, permissionId],
    });
  };

  const saveRole = async () => {
    if (!data?.restaurant) return;
    try {
      const payload = {
        type: "role",
        id: roleDraft.creating ? undefined : selectedRoleId,
        restaurantId: data.restaurant.id,
        name: roleDraft.name,
        description: roleDraft.description,
        permissionIds: roleDraft.permissionIds,
      };
      const method = roleDraft.creating ? "POST" : "PATCH";
      await apiFetch("/api/settings", { method, body: JSON.stringify(payload) });
      toast(roleDraft.creating ? "Role created" : "Role saved");
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to save role", "error");
    }
  };

  if (!data) return <div className="animate-pulse h-32 bg-cream rounded-xl" />;

  const groupedToggles = data.toggles.reduce<Record<string, typeof data.toggles>>((acc, t) => { (acc[t.group] ??= []).push(t); return acc; }, {});

  return (
    <div>
      <PageHeader title="Settings" subtitle="Profile, locations, operating hours, roles, feature toggles" />
      <TabBar tabs={[{ id: "profile", label: "Restaurant Profile" }, { id: "locations", label: "Locations" }, { id: "hours", label: "Operating Hours" }, { id: "roles", label: "Roles" }, { id: "features", label: "Feature Toggles" }]} active={tab} onChange={setTab} />

      {tab === "profile" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-1">
          {([["name", "Name"], ["tagline", "Tagline"], ["fssai", "FSSAI"], ["gstin", "GSTIN"], ["email", "Email"], ["phone", "Phone"]] as const).map(([key, label]) => (
            <FormField key={key} label={label}><input className={inputClass} value={profile[key]} onChange={(e) => setProfile({ ...profile, [key]: e.target.value })} /></FormField>
          ))}
          <BtnPrimary onClick={saveProfile} className="mt-4"><Save size={18} /> Save Profile</BtnPrimary>
        </div>
      )}

      {tab === "locations" && (
        <div className="space-y-4">
          {data.locations.map((loc) => {
            const draft = locationDrafts[loc.id] ?? { name: loc.name, address: loc.address, city: loc.city, pin: loc.pin, taxSlab: loc.taxSlab, status: loc.status };
            return (
              <div key={loc.id} className="bg-white border-2 border-border rounded-xl p-5">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <FormField label="Name"><input className={inputClass} value={draft.name} onChange={(e) => setLocationDrafts({ ...locationDrafts, [loc.id]: { ...draft, name: e.target.value } })} /></FormField>
                  <FormField label="City"><input className={inputClass} value={draft.city} onChange={(e) => setLocationDrafts({ ...locationDrafts, [loc.id]: { ...draft, city: e.target.value } })} /></FormField>
                  <FormField label="PIN"><input className={inputClass} value={draft.pin} onChange={(e) => setLocationDrafts({ ...locationDrafts, [loc.id]: { ...draft, pin: e.target.value } })} /></FormField>
                  <FormField label="Address"><input className={inputClass} value={draft.address} onChange={(e) => setLocationDrafts({ ...locationDrafts, [loc.id]: { ...draft, address: e.target.value } })} /></FormField>
                  <FormField label="Tax Slab (%)"><input type="number" className={inputClass} value={draft.taxSlab} onChange={(e) => setLocationDrafts({ ...locationDrafts, [loc.id]: { ...draft, taxSlab: Number(e.target.value) } })} /></FormField>
                  <FormField label="Status"><select className={inputClass} value={draft.status} onChange={(e) => setLocationDrafts({ ...locationDrafts, [loc.id]: { ...draft, status: e.target.value } })}><option value="active">Active</option><option value="inactive">Inactive</option></select></FormField>
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

      {tab === "hours" && data.locations[0]?.operatingHours.map((h) => (
        <div key={h.id} className="flex items-center gap-4 p-4 bg-white border-2 border-border rounded-xl mb-2">
          <span className="font-bold w-12">{DAYS[h.dayOfWeek]}</span>
          <input type="time" className={inputClass + " w-32"} defaultValue={h.openTime} id={`open-${h.id}`} />
          <span>–</span>
          <input type="time" className={inputClass + " w-32"} defaultValue={h.closeTime} id={`close-${h.id}`} />
          <BtnPrimary onClick={() => {
            const open = (document.getElementById(`open-${h.id}`) as HTMLInputElement).value;
            const close = (document.getElementById(`close-${h.id}`) as HTMLInputElement).value;
            saveHours(h.id, open, close);
          }}><Save size={16} /></BtnPrimary>
        </div>
      ))}

      {tab === "roles" && (
        <div className="grid grid-cols-1 xl:grid-cols-[320px_1fr] gap-4">
          <div className="bg-white border-2 border-border rounded-xl p-4">
            <div className="flex items-center justify-between gap-2 mb-3">
              <h3 className="font-bold text-lg">Roles</h3>
              <BtnSecondary onClick={cloneRole}><Copy size={16} /> Clone</BtnSecondary>
            </div>
            <button
              type="button"
              onClick={() => { setSelectedRoleId("__new__"); setRoleDraft({ name: "New Role", description: "", permissionIds: [], creating: true }); }}
              className="w-full mb-3 h-10 rounded-xl border-2 border-border bg-cream font-bold flex items-center justify-center gap-2 focus-ring"
            >
              <Plus size={16} /> New Role
            </button>
            {data.roles.map((role) => (
              <button
                key={role.id}
                type="button"
                onClick={() => selectRole(role.id)}
                className={`w-full text-left p-3 rounded-xl border-2 mb-2 focus-ring ${selectedRoleId === role.id ? "border-primary bg-primary/15" : "border-border bg-white hover:bg-cream"}`}
              >
                <div className="font-bold">{role.name}</div>
                <div className="text-xs font-semibold text-muted">{role._count.assignments} staff · {role._count.permissions} permissions</div>
              </button>
            ))}
          </div>

          <div className="bg-white border-2 border-border rounded-xl p-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-5">
              <FormField label="Role Name"><input className={inputClass} value={roleDraft.name} onChange={(e) => setRoleDraft({ ...roleDraft, name: e.target.value })} /></FormField>
              <FormField label="Description"><input className={inputClass} value={roleDraft.description} onChange={(e) => setRoleDraft({ ...roleDraft, description: e.target.value })} /></FormField>
            </div>

            {Object.entries(data.permissions.reduce<Record<string, Permission[]>>((acc, permission) => {
              (acc[permission.group] ??= []).push(permission);
              return acc;
            }, {})).map(([group, permissions]) => (
              <div key={group} className="mb-5">
                <h4 className="text-sm font-bold uppercase tracking-wide text-muted mb-2">{group}</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {permissions.map((permission) => (
                    <label key={permission.id} className="flex items-start gap-3 p-3 rounded-xl border-2 border-border bg-cream/40 font-bold">
                      <input
                        type="checkbox"
                        checked={roleDraft.permissionIds.includes(permission.id)}
                        onChange={() => togglePermission(permission.id)}
                        className="w-5 h-5 mt-0.5 accent-[#F4B315]"
                      />
                      <span>
                        <span className="block text-black">{permission.label}</span>
                        <span className="block text-xs text-muted">{permission.resource}.{permission.action}</span>
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            ))}

            <BtnPrimary onClick={saveRole}><Save size={18} /> Save Role</BtnPrimary>
          </div>
        </div>
      )}

      {tab === "features" && Object.entries(groupedToggles).map(([group, toggles]) => (
        <div key={group} className="bg-white border-2 border-border rounded-xl p-5 mb-4">
          <h3 className="font-bold mb-3">{group}</h3>
          {toggles.map((t) => (
            <label key={t.id} className="flex justify-between py-2 font-bold capitalize">
              <span>{t.key.replace(/_/g, " ")}</span>
              <input type="checkbox" checked={t.enabled} onChange={(e) => toggleFeature(t.id, e.target.checked)} className="w-5 h-5 accent-[#F4B315]" />
            </label>
          ))}
        </div>
      ))}
    </div>
  );
}
