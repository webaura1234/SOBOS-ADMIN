"use client";

import { useEffect, useState } from "react";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, PageHeader, TabBar, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { ConfirmDialog, FormField, inputClass, selectClass, exportCsv } from "@/components/ui/forms";
import { formatCurrency, cn } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { format } from "date-fns";
import { Plus, Save, Trash2, Download } from "lucide-react";

interface Customer { id: string; name: string; phone: string; tier: string; totalSpend: number; visitCount: number; points: number; lastVisit: string | null; }
interface Reservation { id: string; guestName: string; partySize: number; dateTime: string; status: string; noShowScore: number; table: { label: string } | null; }
interface Campaign { id: string; name: string; segment: string; status: string; sentCount: number; redeemCount: number; }
interface Loyalty { id: string; earnRate: number; redeemRate: number; minRedeem: number; expiryMonths: number; }

export default function CustomersPage() {
  const { toast } = useToast();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [segments, setSegments] = useState({ vip: 0, regular: 0, atRisk: 0, lapsed: 0 });
  const [tab, setTab] = useState("customers");
  const [detail, setDetail] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", tier: "silver" });
  const [campaignForm, setCampaignForm] = useState({ name: "", segment: "Regular", message: "" });
  const [showCampaign, setShowCampaign] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);

  const load = async () => {
    const data = await apiFetch<{ customers: Customer[]; reservations: Reservation[]; campaigns: Campaign[]; loyalty: Loyalty; segments: typeof segments }>("/api/customers");
    setCustomers(data.customers); setReservations(data.reservations); setCampaigns(data.campaigns);
    setLoyalty(data.loyalty); setSegments(data.segments);
  };

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [toast]);

  const saveCustomer = async () => {
    try {
      if (creating) {
        await apiFetch("/api/customers", { method: "POST", body: JSON.stringify(form) });
        toast("Customer created");
      } else if (detail) {
        await apiFetch("/api/customers", { method: "PATCH", body: JSON.stringify({ id: detail.id, ...form }) });
        toast("Customer updated");
      }
      setCreating(false); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const createCampaign = async () => {
    try {
      await apiFetch("/api/customers", { method: "POST", body: JSON.stringify({ type: "campaign", ...campaignForm, status: "sent" }) });
      toast("Campaign created"); setShowCampaign(false); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const saveLoyalty = async () => {
    if (!loyalty) return;
    try {
      await apiFetch("/api/customers", { method: "PATCH", body: JSON.stringify({ type: "loyalty", id: loyalty.id, earnRate: loyalty.earnRate, redeemRate: loyalty.redeemRate, minRedeem: loyalty.minRedeem }) });
      toast("Loyalty settings saved");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const deleteCustomer = async (id: string, reason?: string) => {
    try {
      await apiFetch(`/api/customers?id=${id}&reason=${encodeURIComponent(reason ?? "No reason provided")}`, { method: "DELETE" });
      toast("Customer deleted"); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const customerCols: Column<Customer>[] = [
    { key: "name", header: "Name" }, { key: "phone", header: "Phone" },
    { key: "tier", header: "Tier", render: (r) => <span className="capitalize font-bold">{r.tier}</span> },
    { key: "totalSpend", header: "Spend", align: "right", render: (r) => formatCurrency(r.totalSpend) },
    { key: "visits", header: "Visits", align: "right", render: (r) => r.visitCount },
  ];

  return (
    <div>
      <PageHeader title="Customers & Loyalty" subtitle="Loyalty, segments, campaigns, reservations"
        actions={<><BtnSecondary onClick={() => { exportCsv("customers.csv", ["Name", "Phone", "Tier", "Spend"], customers.map((c) => [c.name, c.phone, c.tier, c.totalSpend])); toast("Exported"); }}><Download size={18} /> Export</BtnSecondary><BtnPrimary onClick={() => setShowCampaign(true)}><Plus size={18} /> Create Campaign</BtnPrimary></>} />
      <TabBar tabs={[{ id: "customers", label: "Customer DB" }, { id: "segments", label: "Segments" }, { id: "campaigns", label: "Campaigns" }, { id: "reservations", label: "Reservations" }, { id: "loyalty", label: "Loyalty Config" }]} active={tab} onChange={setTab} />

      {tab === "customers" && (
        <>
          <div className="mb-4"><BtnPrimary onClick={() => { setCreating(true); setForm({ name: "", phone: "", tier: "silver" }); }}><Plus size={18} /> Add Customer</BtnPrimary></div>
          <DenseGrid columns={customerCols} data={customers} selectable={false} onRowClick={(c) => { setCreating(false); setDetail(c); setForm({ name: c.name, phone: c.phone, tier: c.tier }); }} />
        </>
      )}
      {tab === "segments" && (
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[{ key: "vip", label: "VIP", desc: "Top spenders" }, { key: "regular", label: "Regular", desc: "Last 30 days" }, { key: "atRisk", label: "At-Risk", desc: "30–60 days" }, { key: "lapsed", label: "Lapsed", desc: "60+ days" }].map((s) => (
            <div key={s.key} className="p-5 bg-white border-2 border-border rounded-xl">
              <div className="font-bold text-lg">{s.label}</div>
              <div className="text-muted text-sm">{s.desc}</div>
              <div className="text-3xl font-bold mt-2">{segments[s.key as keyof typeof segments]}</div>
            </div>
          ))}
        </div>
      )}
      {tab === "campaigns" && <DenseGrid columns={[
        { key: "name", header: "Campaign" }, { key: "segment", header: "Segment" },
        { key: "status", header: "Status" }, { key: "sent", header: "Sent", align: "right", render: (r) => r.sentCount },
        { key: "redeem", header: "Redeemed", align: "right", render: (r) => r.redeemCount },
      ]} data={campaigns} selectable={false} onRowClick={() => {}} />}
      {tab === "reservations" && <DenseGrid columns={[
        { key: "guest", header: "Guest", render: (r) => r.guestName },
        { key: "party", header: "Party", align: "right", render: (r) => r.partySize },
        { key: "date", header: "Date", render: (r) => format(new Date(r.dateTime), "dd MMM HH:mm") },
        { key: "score", header: "No-Show", align: "right", render: (r) => <span className={cn("font-bold", r.noShowScore >= 70 && "text-red-600")}>{r.noShowScore}</span> },
      ]} data={reservations} selectable={false} onRowClick={() => {}} />}
      {tab === "loyalty" && loyalty && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-4">
          <FormField label="Earn Rate (pts/₹)"><input type="number" step="0.1" className={inputClass} value={loyalty.earnRate} onChange={(e) => setLoyalty({ ...loyalty, earnRate: Number(e.target.value) })} /></FormField>
          <FormField label="Redeem Rate (₹/pt)"><input type="number" step="0.01" className={inputClass} value={loyalty.redeemRate} onChange={(e) => setLoyalty({ ...loyalty, redeemRate: Number(e.target.value) })} /></FormField>
          <FormField label="Min Redeem (pts)"><input type="number" className={inputClass} value={loyalty.minRedeem} onChange={(e) => setLoyalty({ ...loyalty, minRedeem: Number(e.target.value) })} /></FormField>
          <BtnPrimary onClick={saveLoyalty}><Save size={18} /> Save</BtnPrimary>
        </div>
      )}

      <Drawer open={creating || !!detail} onClose={() => { setCreating(false); setDetail(null); }} title={creating ? "New Customer" : detail?.name ?? ""}>
        <FormField label="Name"><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
        <FormField label="Phone"><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
        <FormField label="Tier"><select className={selectClass} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>
          {["silver", "gold", "platinum"].map((t) => <option key={t} value={t}>{t}</option>)}
        </select></FormField>
        <div className="flex gap-3 mt-4">
          <BtnPrimary onClick={saveCustomer}><Save size={18} /> Save</BtnPrimary>
          {!creating && detail && <BtnSecondary onClick={() => setConfirmDelete(detail.id)}><Trash2 size={18} /> Delete</BtnSecondary>}
        </div>
      </Drawer>

      <Drawer open={showCampaign} onClose={() => setShowCampaign(false)} title="Create Campaign">
        <FormField label="Name"><input className={inputClass} value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} /></FormField>
        <FormField label="Segment"><select className={selectClass} value={campaignForm.segment} onChange={(e) => setCampaignForm({ ...campaignForm, segment: e.target.value })}>
          {["VIP", "Regular", "At-Risk", "Lapsed"].map((s) => <option key={s} value={s}>{s}</option>)}
        </select></FormField>
        <FormField label="Message"><textarea className={inputClass + " h-24"} value={campaignForm.message} onChange={(e) => setCampaignForm({ ...campaignForm, message: e.target.value })} /></FormField>
        <BtnPrimary onClick={createCampaign} className="mt-4"><Save size={18} /> Create</BtnPrimary>
      </Drawer>

      <ConfirmDialog open={!!confirmDelete} title="Delete customer?" message="This will permanently remove the customer." confirmLabel="Delete" destructive
        requireReason onConfirm={(reason) => confirmDelete && deleteCustomer(confirmDelete, reason)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}
