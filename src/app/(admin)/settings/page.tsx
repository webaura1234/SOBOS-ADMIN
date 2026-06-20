"use client";

import { useEffect, useState } from "react";
import { PageHeader, TabBar, BtnPrimary } from "@/components/ui/shared";
import { FormField, inputClass } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { Save } from "lucide-react";

interface SettingsData {
  restaurant: { id: string; name: string; tagline: string | null; fssai: string | null; gstin: string | null; email: string | null; phone: string | null } | null;
  locations: { id: string; name: string; address: string; city: string; pin: string; taxSlab: number; status: string; operatingHours: { id: string; dayOfWeek: number; openTime: string; closeTime: string; isClosed: boolean }[] }[];
  toggles: { id: string; key: string; group: string; enabled: boolean }[];
  roles: { id: string; name: string; description: string | null; _count: { assignments: number; permissions: number } }[];
}

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export default function SettingsPage() {
  const { toast } = useToast();
  const [data, setData] = useState<SettingsData | null>(null);
  const [tab, setTab] = useState("profile");
  const [profile, setProfile] = useState({ name: "", tagline: "", fssai: "", gstin: "", email: "", phone: "" });

  const load = async () => {
    const d = await apiFetch<SettingsData>("/api/settings");
    setData(d);
    if (d.restaurant) setProfile({ name: d.restaurant.name, tagline: d.restaurant.tagline ?? "", fssai: d.restaurant.fssai ?? "", gstin: d.restaurant.gstin ?? "", email: d.restaurant.email ?? "", phone: d.restaurant.phone ?? "" });
  };

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [toast]);

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

      {tab === "locations" && data.locations.map((loc) => (
        <div key={loc.id} className="bg-white border-2 border-border rounded-xl p-5 mb-3">
          <h3 className="font-bold text-lg">{loc.name}</h3>
          <p className="text-muted font-medium">{loc.address}, {loc.city} — {loc.pin}</p>
          <p className="text-sm font-bold mt-2">GST: {loc.taxSlab}% · {loc.status}</p>
        </div>
      ))}

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

      {tab === "roles" && data.roles.map((role) => (
        <div key={role.id} className="flex justify-between p-4 bg-white border-2 border-border rounded-xl mb-2">
          <div><h3 className="font-bold">{role.name}</h3><p className="text-muted text-sm">{role.description}</p></div>
          <span className="font-bold text-muted">{role._count.assignments} staff · {role._count.permissions} perms</span>
        </div>
      ))}

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
