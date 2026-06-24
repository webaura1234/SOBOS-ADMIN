"use client";

import { useEffect, useMemo, useState } from "react";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, PageHeader, TabBar, StatusDot, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { ConfirmDialog, FormField, inputClass, selectClass, exportCsv } from "@/components/ui/forms";
import { formatCurrency, cn } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { useApp } from "@/lib/context";
import { format } from "date-fns";
import { Plus, Save, Trash2, Download, Star, Phone, AlertTriangle } from "lucide-react";

interface Customer { id: string; name: string; phone: string; email: string | null; tier: string; totalSpend: number; visitCount: number; points: number; lastVisit: string | null; tags: string; favoriteDishes: string; dietaryNotes: string | null; serviceNotes: string | null; birthday: string | null; anniversary: string | null; optedOut: boolean; }
interface Reservation { id: string; guestName: string; guestPhone: string | null; partySize: number; dateTime: string; duration: number; status: string; noShowScore: number; specialRequests: string | null; preOrder: string | null; reminderConfirmed: boolean; createdAt: string; table: { label: string } | null; customerId: string | null; customer: Customer | null; }
interface Campaign { id: string; name: string; segment: string; channel: string; offerCode: string | null; status: string; sentCount: number; readCount: number; redeemCount: number; }
interface Loyalty { id: string; earnRate: number; redeemRate: number; minRedeem: number; expiryMonths: number; maxDiscountPct: number; goldThreshold: number; platinumThreshold: number; goldMultiplier: number; platinumMultiplier: number; awardOnAggregator: boolean; enabled: boolean; }
interface AutoOffer { id?: string; type: string; enabled: boolean; daysBefore: number; offerType: string; value: number; validityDays: number; channel: string; skipLapsed: boolean; }
interface Referral { id?: string; enabled: boolean; referrerReward: number; refereeReward: number; maxPerMonth: number; trigger: string; }
interface Waitlist { id: string; guestName: string; phone: string | null; partySize: number; estWaitMin: number; notifyChannel: string; status: string; createdAt: string; }
interface Segments { counts: Record<string, number>; members: Record<string, Customer[]>; }

const parseJson = (s: string): string[] => { try { return JSON.parse(s); } catch { return []; } };
const SEG_DEFS = [
  { key: "vip", label: "VIP", desc: "Top 10% spenders" },
  { key: "regular", label: "Regular", desc: "Visited last 30 days" },
  { key: "atRisk", label: "At-Risk", desc: "30–60 days quiet" },
  { key: "lapsed", label: "Lapsed", desc: "60+ days / never" },
  { key: "new", label: "New", desc: "First visit, <30 days" },
];
const SEG_LABEL: Record<string, string> = { vip: "VIP", regular: "Regular", atRisk: "At-Risk", lapsed: "Lapsed", new: "New" };

const RES_CFG_DEFAULT = { enabled: false, slotGranularity: 30, maxParty: 12, reminder24h: true, reminder2h: true, noShowThreshold: 70, preOrderWindowH: 2, onlineBooking: false };

export default function CustomersPage() {
  const { toast } = useToast();
  const { locations, locationId } = useApp();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loyalty, setLoyalty] = useState<Loyalty | null>(null);
  const [segments, setSegments] = useState<Segments>({ counts: {}, members: {} });
  const [autoOffers, setAutoOffers] = useState<Record<string, AutoOffer>>({});
  const [referral, setReferral] = useState<Referral>({ enabled: false, referrerReward: 100, refereeReward: 50, maxPerMonth: 5, trigger: "referee_first_order" });
  const [waitlist, setWaitlist] = useState<Waitlist[]>([]);
  const [resCfg, setResCfg] = useState(RES_CFG_DEFAULT);

  const [tab, setTab] = useState("customers");
  const [detail, setDetail] = useState<Customer | null>(null);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: "", phone: "", email: "", tier: "silver", dietaryNotes: "", serviceNotes: "", tags: [] as string[], favoriteDishes: [] as string[], birthday: "", anniversary: "", optedOut: false });
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [segDrill, setSegDrill] = useState<string | null>(null);

  const [showCampaign, setShowCampaign] = useState(false);
  const [campaignForm, setCampaignForm] = useState({ name: "", segment: "Regular", message: "", channel: "whatsapp", offerCode: "", scheduledAt: "" });

  const [resView, setResView] = useState<"day" | "week" | "list">("day");
  const [resDate, setResDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [showRes, setShowRes] = useState(false);
  const [resForm, setResForm] = useState({ guestName: "", guestPhone: "", partySize: 2, dateTime: "", specialRequests: "" });
  const [whyRes, setWhyRes] = useState<Reservation | null>(null);

  const [showWait, setShowWait] = useState(false);
  const [waitForm, setWaitForm] = useState({ guestName: "", phone: "", partySize: 2, estWaitMin: 15, notifyChannel: "sms" });

  const load = async () => {
    const data = await apiFetch<{ customers: Customer[]; reservations: Reservation[]; campaigns: Campaign[]; loyalty: Loyalty; segments: Segments; autoOffers: Record<string, AutoOffer>; referral: Referral | null; waitlist: Waitlist[] }>("/api/customers");
    setCustomers(data.customers); setReservations(data.reservations); setCampaigns(data.campaigns);
    setLoyalty(data.loyalty); setSegments(data.segments); setAutoOffers(data.autoOffers ?? {});
    if (data.referral) setReferral(data.referral); setWaitlist(data.waitlist ?? []);
  };
  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [toast]);
  useEffect(() => { apiFetch<typeof RES_CFG_DEFAULT>("/api/admin-config?scope=reservations&key=config").then((c) => setResCfg({ ...RES_CFG_DEFAULT, ...c })).catch(() => {}); }, []);

  const locId = locationId ?? locations[0]?.id ?? "";

  // ── customers ──
  const openCreate = () => { setCreating(true); setDetail(null); setForm({ name: "", phone: "", email: "", tier: "silver", dietaryNotes: "", serviceNotes: "", tags: [], favoriteDishes: [], birthday: "", anniversary: "", optedOut: false }); };
  const openEdit = (c: Customer) => { setCreating(false); setDetail(c); setForm({ name: c.name, phone: c.phone, email: c.email ?? "", tier: c.tier, dietaryNotes: c.dietaryNotes ?? "", serviceNotes: c.serviceNotes ?? "", tags: parseJson(c.tags), favoriteDishes: parseJson(c.favoriteDishes), birthday: c.birthday?.slice(0, 10) ?? "", anniversary: c.anniversary?.slice(0, 10) ?? "", optedOut: c.optedOut }); };
  const saveCustomer = async () => {
    try {
      const payload = { ...form, birthday: form.birthday || null, anniversary: form.anniversary || null };
      if (creating) { await apiFetch("/api/customers", { method: "POST", body: JSON.stringify(payload) }); toast("Customer created"); }
      else if (detail) { await apiFetch("/api/customers", { method: "PATCH", body: JSON.stringify({ id: detail.id, ...payload }) }); toast("Customer updated"); }
      setCreating(false); setDetail(null); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const deleteCustomer = async (id: string, reason?: string) => { try { await apiFetch(`/api/customers?id=${id}&reason=${encodeURIComponent(reason ?? "")}`, { method: "DELETE" }); toast("Customer deleted"); setDetail(null); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  // ── campaigns ──
  const openCampaign = (segment?: string) => { setCampaignForm({ name: "", segment: segment ?? "Regular", message: "Hi {name}, you have {points_balance} points!", channel: "whatsapp", offerCode: "", scheduledAt: "" }); setShowCampaign(true); };
  const sendCampaign = async (status: "draft" | "sent") => {
    try { await apiFetch("/api/customers", { method: "POST", body: JSON.stringify({ type: "campaign", ...campaignForm, status }) }); toast(status === "sent" ? "Campaign sent" : "Campaign saved as draft"); setShowCampaign(false); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  // ── loyalty / auto-offer / referral ──
  const saveLoyalty = async () => { if (!loyalty) return; try { const { id, ...rest } = loyalty; await apiFetch("/api/customers", { method: "PATCH", body: JSON.stringify({ type: "loyalty", id, ...rest }) }); toast("Loyalty settings saved"); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const saveOffer = async (kind: string, offer: AutoOffer) => { try { const { type: _t, id: _i, ...rest } = offer; void _t; void _i; await apiFetch("/api/customers", { method: "PATCH", body: JSON.stringify({ type: "autoOffer", offerKind: kind, ...rest }) }); toast(`${kind} offer saved`); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const saveReferral = async () => { try { await apiFetch("/api/customers", { method: "PATCH", body: JSON.stringify({ type: "referral", ...referral }) }); toast("Referral config saved"); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  // ── reservations ──
  const createRes = async () => {
    try { await apiFetch("/api/customers", { method: "POST", body: JSON.stringify({ type: "reservation", locationId: locId, ...resForm, dateTime: resForm.dateTime || `${resDate}T19:00` }) }); toast("Reservation created"); setShowRes(false); load(); }
    catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const cancelRes = async (id: string) => { try { await apiFetch(`/api/customers?id=${id}&type=reservation`, { method: "DELETE" }); toast("Reservation cancelled"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const confirmReminder = async (id: string) => { try { await apiFetch("/api/customers", { method: "PATCH", body: JSON.stringify({ type: "reservation", id, reminderConfirmed: true }) }); toast("Marked confirmed"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const saveResCfg = async () => { try { await apiFetch("/api/admin-config", { method: "PATCH", body: JSON.stringify({ scope: "reservations", key: "config", value: resCfg }) }); toast("Reservation settings saved"); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  // ── waitlist ──
  const addWait = async () => { try { await apiFetch("/api/customers", { method: "POST", body: JSON.stringify({ type: "waitlist", locationId: locId, ...waitForm }) }); toast("Added to waitlist"); setShowWait(false); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const waitAction = async (id: string, status: string) => { try { await apiFetch("/api/customers", { method: "PATCH", body: JSON.stringify({ type: "waitlist", id, status }) }); toast(`Marked ${status}`); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  const customerCols: Column<Customer>[] = [
    { key: "name", header: "Name" }, { key: "phone", header: "Phone" },
    { key: "tier", header: "Tier", render: (r) => <span className="capitalize font-bold">{r.tier}</span> },
    { key: "totalSpend", header: "Spend", align: "right", render: (r) => formatCurrency(r.totalSpend) },
    { key: "visits", header: "Visits", align: "right", render: (r) => r.visitCount },
    { key: "opted", header: "", render: (r) => r.optedOut ? <span className="text-xs text-red-600 font-bold">opted out</span> : null },
  ];

  const dayReservations = useMemo(() => reservations.filter((r) => r.dateTime.slice(0, 10) === resDate && r.status !== "cancelled"), [reservations, resDate]);
  const weekDays = useMemo(() => {
    const start = new Date(resDate); start.setDate(start.getDate() - start.getDay());
    return Array.from({ length: 7 }, (_, i) => { const d = new Date(start); d.setDate(start.getDate() + i); return d.toISOString().slice(0, 10); });
  }, [resDate]);

  const whyFactors = (r: Reservation) => {
    const leadDays = Math.round((new Date(r.dateTime).getTime() - new Date(r.createdAt).getTime()) / 86400000);
    return [
      { label: "Historical no-show rate", value: r.noShowScore >= 70 ? "High" : r.noShowScore >= 40 ? "Moderate" : "Low" },
      { label: "Booking lead time", value: `${leadDays} day(s)` },
      { label: "Party size", value: `${r.partySize} guests` },
      { label: "Day of week", value: format(new Date(r.dateTime), "EEEE") },
      { label: "Reminder confirmed", value: r.reminderConfirmed ? "Yes" : "Not yet" },
    ];
  };

  return (
    <div>
      <PageHeader title="Customers & Loyalty" subtitle="Customers, segments, campaigns, reservations, waitlist, loyalty, auto-offers, referrals"
        actions={<><BtnSecondary onClick={() => { exportCsv("customers.csv", ["Name", "Phone", "Tier", "Spend", "Visits"], customers.map((c) => [c.name, c.phone, c.tier, c.totalSpend, c.visitCount])); toast("Exported"); }}><Download size={18} /> Export</BtnSecondary><BtnPrimary onClick={() => openCampaign()}><Plus size={18} /> Create Campaign</BtnPrimary></>} />
      <TabBar tabs={[{ id: "customers", label: "Customer DB" }, { id: "segments", label: "Segments" }, { id: "campaigns", label: "Campaigns" }, { id: "reservations", label: "Reservations" }, { id: "waitlist", label: "Waitlist" }, { id: "loyalty", label: "Loyalty" }, { id: "offers", label: "Auto-Offers" }, { id: "referral", label: "Referral" }]} active={tab} onChange={setTab} />

      {tab === "customers" && (
        <>
          <div className="mb-4"><BtnPrimary onClick={openCreate}><Plus size={18} /> Add Customer</BtnPrimary></div>
          <DenseGrid columns={customerCols} data={customers} selectable={false} onRowClick={openEdit} />
        </>
      )}

      {tab === "segments" && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
          {SEG_DEFS.map((s) => (
            <button key={s.key} type="button" onClick={() => setSegDrill(s.key)} className="p-5 bg-white border-2 border-border rounded-xl text-left hover:border-primary focus-ring">
              <div className="font-bold text-lg">{s.label}</div>
              <div className="text-muted text-xs">{s.desc}</div>
              <div className="text-3xl font-bold mt-2 tabular-nums">{segments.counts[s.key] ?? 0}</div>
              <div className="text-xs font-bold text-primary mt-2">View &amp; campaign →</div>
            </button>
          ))}
        </div>
      )}

      {tab === "campaigns" && (
        <DenseGrid columns={[
          { key: "name", header: "Campaign" }, { key: "segment", header: "Segment" },
          { key: "channel", header: "Channel", render: (r: Campaign) => <span className="capitalize">{r.channel}</span> },
          { key: "code", header: "Offer code", render: (r: Campaign) => r.offerCode ?? "—" },
          { key: "status", header: "Status", render: (r: Campaign) => <StatusDot status={r.status === "sent" ? "completed" : "draft"} label={r.status} /> },
          { key: "sent", header: "Sent", align: "right", render: (r: Campaign) => r.sentCount },
          { key: "read", header: "Read %", align: "right", render: (r: Campaign) => r.sentCount ? `${Math.round((r.readCount / r.sentCount) * 100)}%` : "—" },
          { key: "redeem", header: "Redeemed", align: "right", render: (r: Campaign) => r.redeemCount },
        ]} data={campaigns} selectable={false} onRowClick={() => {}} emptyMessage="No campaigns yet" />
      )}

      {tab === "reservations" && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex gap-1 p-1 bg-cream rounded-xl border-2 border-border">
              {(["day", "week", "list"] as const).map((v) => <button key={v} type="button" onClick={() => setResView(v)} className={cn("px-3 py-1.5 rounded-lg text-sm font-bold capitalize", resView === v ? "bg-white shadow border-2 border-primary" : "text-muted")}>{v}</button>)}
            </div>
            <input type="date" className={inputClass + " max-w-[180px]"} value={resDate} onChange={(e) => setResDate(e.target.value)} />
            <BtnPrimary onClick={() => { setResForm({ guestName: "", guestPhone: "", partySize: 2, dateTime: `${resDate}T19:00`, specialRequests: "" }); setShowRes(true); }}><Plus size={18} /> New Reservation</BtnPrimary>
          </div>

          {resView === "day" && (
            <div className="page-surface p-4">
              <h3 className="font-bold mb-3">{format(new Date(resDate), "EEEE, dd MMM yyyy")} · {dayReservations.length} bookings</h3>
              {dayReservations.length === 0 ? <p className="text-muted font-medium py-6 text-center">No reservations</p> : (
                <ul className="space-y-2">{dayReservations.map((r) => (
                  <li key={r.id} className="flex items-center justify-between gap-3 p-3 border-2 border-border rounded-xl">
                    <div className="flex items-center gap-3">
                      <span className="font-bold tabular-nums w-16">{format(new Date(r.dateTime), "HH:mm")}</span>
                      <div><div className="font-bold">{r.guestName} · {r.partySize}p {r.table && <span className="text-muted">· {r.table.label}</span>}</div>
                        {r.specialRequests && <div className="text-xs text-muted">{r.specialRequests}</div>}</div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button type="button" onClick={() => setWhyRes(r)} className={cn("px-2 py-1 rounded-lg text-xs font-bold border-2", r.noShowScore >= resCfg.noShowThreshold ? "border-red-300 bg-red-50 text-red-700" : "border-border")}>No-show {r.noShowScore}{r.noShowScore >= resCfg.noShowThreshold && " ⚠"}</button>
                      <button type="button" onClick={() => cancelRes(r.id)} className="text-red-600 text-sm font-bold underline">Cancel</button>
                    </div>
                  </li>
                ))}</ul>
              )}
            </div>
          )}

          {resView === "week" && (
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
              {weekDays.map((d) => { const count = reservations.filter((r) => r.dateTime.slice(0, 10) === d && r.status !== "cancelled").length; return (
                <button key={d} type="button" onClick={() => { setResDate(d); setResView("day"); }} className={cn("p-3 rounded-xl border-2 text-left focus-ring", d === resDate ? "border-primary bg-primary/10" : "border-border bg-white hover:bg-cream")}>
                  <div className="text-xs font-bold text-muted">{format(new Date(d), "EEE")}</div>
                  <div className="font-bold">{format(new Date(d), "dd")}</div>
                  <div className="text-2xl font-bold tabular-nums">{count}</div>
                </button>
              ); })}
            </div>
          )}

          {resView === "list" && (
            <DenseGrid columns={[
              { key: "guest", header: "Guest", render: (r: Reservation) => r.guestName },
              { key: "party", header: "Party", align: "right", render: (r: Reservation) => r.partySize },
              { key: "date", header: "When", render: (r: Reservation) => format(new Date(r.dateTime), "dd MMM HH:mm") },
              { key: "status", header: "Status", render: (r: Reservation) => <StatusDot status={r.status === "confirmed" ? "confirmed" : r.status === "cancelled" ? "cancelled" : "pending"} label={r.status} /> },
              { key: "score", header: "No-Show", align: "right", render: (r: Reservation) => <button type="button" onClick={(e) => { e.stopPropagation(); setWhyRes(r); }} className={cn("font-bold", r.noShowScore >= resCfg.noShowThreshold && "text-red-600")}>{r.noShowScore}</button> },
            ]} data={reservations.map((r) => ({ ...r }))} selectable={false} onRowClick={() => {}} />
          )}

          <div className="page-surface p-5">
            <h3 className="font-bold mb-3">Reservation settings</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <label className="flex items-center justify-between font-bold text-sm col-span-2"><span>Enable reservations</span><input type="checkbox" checked={resCfg.enabled} onChange={(e) => setResCfg({ ...resCfg, enabled: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
              <label className="flex items-center justify-between font-bold text-sm col-span-2"><span>Online booking</span><input type="checkbox" checked={resCfg.onlineBooking} onChange={(e) => setResCfg({ ...resCfg, onlineBooking: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
              <FormField label="Slot granularity (min)"><input type="number" className={inputClass} value={resCfg.slotGranularity} onChange={(e) => setResCfg({ ...resCfg, slotGranularity: Number(e.target.value) })} /></FormField>
              <FormField label="Max party"><input type="number" className={inputClass} value={resCfg.maxParty} onChange={(e) => setResCfg({ ...resCfg, maxParty: Number(e.target.value) })} /></FormField>
              <FormField label="No-show threshold"><input type="number" className={inputClass} value={resCfg.noShowThreshold} onChange={(e) => setResCfg({ ...resCfg, noShowThreshold: Number(e.target.value) })} /></FormField>
              <FormField label="Pre-order window (h)"><input type="number" className={inputClass} value={resCfg.preOrderWindowH} onChange={(e) => setResCfg({ ...resCfg, preOrderWindowH: Number(e.target.value) })} /></FormField>
            </div>
            <BtnPrimary onClick={saveResCfg} className="mt-3"><Save size={18} /> Save Settings</BtnPrimary>
          </div>
        </div>
      )}

      {tab === "waitlist" && (
        <div className="space-y-4">
          <BtnPrimary onClick={() => { setWaitForm({ guestName: "", phone: "", partySize: 2, estWaitMin: 15, notifyChannel: "sms" }); setShowWait(true); }}><Plus size={18} /> Add to Waitlist</BtnPrimary>
          <DenseGrid columns={[
            { key: "pos", header: "#", width: "48px", render: (_r: Waitlist, i: number) => i + 1 },
            { key: "guest", header: "Guest", render: (r: Waitlist) => r.guestName },
            { key: "party", header: "Party", align: "right", render: (r: Waitlist) => r.partySize },
            { key: "wait", header: "Est. wait", align: "right", render: (r: Waitlist) => `${r.estWaitMin}m` },
            { key: "status", header: "Status", render: (r: Waitlist) => <StatusDot status={r.status === "waiting" ? "pending" : r.status === "notified" ? "confirmed" : "completed"} label={r.status} /> },
            { key: "act", header: "Action", render: (r: Waitlist) => (
              <span className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                {r.status === "waiting" && <button type="button" onClick={() => waitAction(r.id, "notified")} className="font-bold underline">Notify</button>}
                <button type="button" onClick={() => waitAction(r.id, "seated")} className="font-bold underline">Seat</button>
                <button type="button" onClick={() => waitAction(r.id, "no_show")} className="font-bold underline text-red-600">No-show</button>
              </span>
            ) },
          ]} data={waitlist} selectable={false} onRowClick={() => {}} emptyMessage="Waitlist is empty" />
        </div>
      )}

      {tab === "loyalty" && loyalty && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
          <div className="bg-white border-2 border-border rounded-xl p-5 space-y-1">
            <h3 className="font-bold mb-2">Earn & redeem</h3>
            <label className="flex justify-between font-bold mb-3"><span>Program enabled</span><input type="checkbox" checked={loyalty.enabled} onChange={(e) => setLoyalty({ ...loyalty, enabled: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
            <FormField label="Earn rate (pts/₹)"><input type="number" step="0.1" className={inputClass} value={loyalty.earnRate} onChange={(e) => setLoyalty({ ...loyalty, earnRate: Number(e.target.value) })} /></FormField>
            <FormField label="Redeem rate (₹/pt)"><input type="number" step="0.01" className={inputClass} value={loyalty.redeemRate} onChange={(e) => setLoyalty({ ...loyalty, redeemRate: Number(e.target.value) })} /></FormField>
            <FormField label="Min redeem (pts)"><input type="number" className={inputClass} value={loyalty.minRedeem} onChange={(e) => setLoyalty({ ...loyalty, minRedeem: Number(e.target.value) })} /></FormField>
            <FormField label="Max discount per bill (%)"><input type="number" className={inputClass} value={loyalty.maxDiscountPct} onChange={(e) => setLoyalty({ ...loyalty, maxDiscountPct: Number(e.target.value) })} /></FormField>
            <FormField label="Points expiry (months)"><input type="number" className={inputClass} value={loyalty.expiryMonths} onChange={(e) => setLoyalty({ ...loyalty, expiryMonths: Number(e.target.value) })} /></FormField>
            <label className="flex justify-between font-bold"><span>Award points on aggregator orders</span><input type="checkbox" checked={loyalty.awardOnAggregator} onChange={(e) => setLoyalty({ ...loyalty, awardOnAggregator: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          </div>
          <div className="bg-white border-2 border-border rounded-xl p-5 space-y-1">
            <h3 className="font-bold mb-2">Tiers</h3>
            <p className="text-sm text-muted mb-3">Silver is the base tier. Gold &amp; Platinum unlock at cumulative spend with a points multiplier.</p>
            <FormField label="Gold threshold (₹ cumulative)"><input type="number" className={inputClass} value={loyalty.goldThreshold} onChange={(e) => setLoyalty({ ...loyalty, goldThreshold: Number(e.target.value) })} /></FormField>
            <FormField label="Gold multiplier"><input type="number" step="0.1" className={inputClass} value={loyalty.goldMultiplier} onChange={(e) => setLoyalty({ ...loyalty, goldMultiplier: Number(e.target.value) })} /></FormField>
            <FormField label="Platinum threshold (₹ cumulative)"><input type="number" className={inputClass} value={loyalty.platinumThreshold} onChange={(e) => setLoyalty({ ...loyalty, platinumThreshold: Number(e.target.value) })} /></FormField>
            <FormField label="Platinum multiplier"><input type="number" step="0.1" className={inputClass} value={loyalty.platinumMultiplier} onChange={(e) => setLoyalty({ ...loyalty, platinumMultiplier: Number(e.target.value) })} /></FormField>
          </div>
          <BtnPrimary onClick={saveLoyalty}><Save size={18} /> Save Loyalty</BtnPrimary>
        </div>
      )}

      {tab === "offers" && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-4xl">
          {["birthday", "anniversary"].map((kind) => {
            const o = autoOffers[kind] ?? { type: kind, enabled: false, daysBefore: 3, offerType: "percent", value: 10, validityDays: 7, channel: "whatsapp", skipLapsed: true };
            return <OfferCard key={kind} kind={kind} offer={o} onSave={(off) => saveOffer(kind, off)} />;
          })}
        </div>
      )}

      {tab === "referral" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-1">
          <label className="flex justify-between font-bold mb-3"><span>Referral program enabled</span><input type="checkbox" checked={referral.enabled} onChange={(e) => setReferral({ ...referral, enabled: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          <p className="text-sm text-muted mb-2">Requires loyalty program. One level only (no MLM).</p>
          <FormField label="Referrer reward (₹/pts)"><input type="number" className={inputClass} value={referral.referrerReward} onChange={(e) => setReferral({ ...referral, referrerReward: Number(e.target.value) })} /></FormField>
          <FormField label="Referee reward (₹/pts)"><input type="number" className={inputClass} value={referral.refereeReward} onChange={(e) => setReferral({ ...referral, refereeReward: Number(e.target.value) })} /></FormField>
          <FormField label="Max referrals / month"><input type="number" className={inputClass} value={referral.maxPerMonth} onChange={(e) => setReferral({ ...referral, maxPerMonth: Number(e.target.value) })} /></FormField>
          <FormField label="Reward trigger"><select className={selectClass} value={referral.trigger} onChange={(e) => setReferral({ ...referral, trigger: e.target.value })}><option value="referee_first_order">Referee&apos;s first order</option><option value="signup">Referee signup</option></select></FormField>
          <BtnPrimary onClick={saveReferral} className="mt-2"><Save size={18} /> Save Referral</BtnPrimary>
        </div>
      )}

      {/* ── Customer profile drawer (guest recall card) ── */}
      <Drawer open={creating || !!detail} onClose={() => { setCreating(false); setDetail(null); }} title={creating ? "New Customer" : detail?.name ?? ""} width="560px">
        {!creating && detail && (
          <div className="mb-4 p-4 bg-cream rounded-xl border-2 border-border">
            <div className="grid grid-cols-3 gap-2 text-center">
              <div><div className="text-2xl font-bold tabular-nums">{detail.visitCount}</div><div className="text-xs text-muted font-bold">Visits</div></div>
              <div><div className="text-2xl font-bold tabular-nums">{formatCurrency(detail.totalSpend)}</div><div className="text-xs text-muted font-bold">Total spend</div></div>
              <div><div className="text-2xl font-bold tabular-nums">{detail.points}</div><div className="text-xs text-muted font-bold">Points</div></div>
            </div>
            <div className="text-sm text-muted font-medium mt-2 text-center">Last visit: {detail.lastVisit ? format(new Date(detail.lastVisit), "dd MMM yyyy") : "—"} · Avg spend {formatCurrency(detail.visitCount ? detail.totalSpend / detail.visitCount : 0)}</div>
          </div>
        )}
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Name" required><input className={inputClass} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></FormField>
          <FormField label="Phone" required><input className={inputClass} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></FormField>
          <FormField label="Email"><input className={inputClass} value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></FormField>
          <FormField label="Tier"><select className={selectClass} value={form.tier} onChange={(e) => setForm({ ...form, tier: e.target.value })}>{["silver", "gold", "platinum"].map((t) => <option key={t} value={t}>{t}</option>)}</select></FormField>
          <FormField label="Birthday"><input type="date" className={inputClass} value={form.birthday} onChange={(e) => setForm({ ...form, birthday: e.target.value })} /></FormField>
          <FormField label="Anniversary"><input type="date" className={inputClass} value={form.anniversary} onChange={(e) => setForm({ ...form, anniversary: e.target.value })} /></FormField>
        </div>
        <FormField label="Favorite dishes" hint="Comma-separated"><input className={inputClass} value={form.favoriteDishes.join(", ")} onChange={(e) => setForm({ ...form, favoriteDishes: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></FormField>
        <FormField label="Tags" hint="Comma-separated"><input className={inputClass} value={form.tags.join(", ")} onChange={(e) => setForm({ ...form, tags: e.target.value.split(",").map((s) => s.trim()).filter(Boolean) })} /></FormField>
        <FormField label="Dietary / allergy notes"><textarea className={`${inputClass} min-h-16`} value={form.dietaryNotes} onChange={(e) => setForm({ ...form, dietaryNotes: e.target.value })} /></FormField>
        <FormField label="Service notes (staff)"><textarea className={`${inputClass} min-h-16`} value={form.serviceNotes} onChange={(e) => setForm({ ...form, serviceNotes: e.target.value })} /></FormField>
        <label className="flex justify-between font-bold mb-4"><span>Opted out of marketing</span><input type="checkbox" checked={form.optedOut} onChange={(e) => setForm({ ...form, optedOut: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
        <div className="flex gap-3">
          <BtnPrimary onClick={saveCustomer}><Save size={18} /> Save</BtnPrimary>
          {!creating && detail && <BtnSecondary onClick={() => setConfirmDelete(detail.id)}><Trash2 size={18} /> Delete</BtnSecondary>}
        </div>
      </Drawer>

      {/* ── Segment drill ── */}
      <Drawer open={!!segDrill} onClose={() => setSegDrill(null)} title={segDrill ? `${SEG_LABEL[segDrill]} segment` : ""}>
        {segDrill && (
          <>
            <div className="flex items-center justify-between mb-3">
              <span className="font-bold text-muted">{segments.members[segDrill]?.length ?? 0} customers</span>
              <BtnPrimary onClick={() => { openCampaign(SEG_LABEL[segDrill]); setSegDrill(null); }}><Plus size={16} /> Campaign to segment</BtnPrimary>
            </div>
            <ul className="space-y-2">{(segments.members[segDrill] ?? []).map((c) => (
              <li key={c.id} className="flex justify-between p-3 bg-cream rounded-lg"><span className="font-bold">{c.name}</span><span className="text-muted">{formatCurrency(c.totalSpend)} · {c.visitCount} visits</span></li>
            ))}</ul>
          </>
        )}
      </Drawer>

      {/* ── Campaign composer ── */}
      <Drawer open={showCampaign} onClose={() => setShowCampaign(false)} title="Create Campaign">
        <FormField label="Name"><input className={inputClass} value={campaignForm.name} onChange={(e) => setCampaignForm({ ...campaignForm, name: e.target.value })} /></FormField>
        <FormField label="Target segment"><select className={selectClass} value={campaignForm.segment} onChange={(e) => setCampaignForm({ ...campaignForm, segment: e.target.value })}>{["VIP", "Regular", "At-Risk", "Lapsed", "New"].map((s) => <option key={s} value={s}>{s}</option>)}</select></FormField>
        <FormField label="Channel"><select className={selectClass} value={campaignForm.channel} onChange={(e) => setCampaignForm({ ...campaignForm, channel: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option><option value="both">Both</option></select></FormField>
        <FormField label="Message" hint="Tokens: {name}, {points_balance}, {last_visit}"><textarea className={`${inputClass} min-h-24`} value={campaignForm.message} onChange={(e) => setCampaignForm({ ...campaignForm, message: e.target.value })} /></FormField>
        <FormField label="Offer code (optional)"><input className={inputClass} value={campaignForm.offerCode} onChange={(e) => setCampaignForm({ ...campaignForm, offerCode: e.target.value })} /></FormField>
        <FormField label="Schedule (optional)"><input type="datetime-local" className={inputClass} value={campaignForm.scheduledAt} onChange={(e) => setCampaignForm({ ...campaignForm, scheduledAt: e.target.value })} /></FormField>
        <div className="flex gap-3 mt-2">
          <BtnPrimary onClick={() => sendCampaign("sent")}><Save size={18} /> Send now</BtnPrimary>
          <BtnSecondary onClick={() => sendCampaign("draft")}>Save draft</BtnSecondary>
        </div>
      </Drawer>

      {/* ── Reservation create ── */}
      <Drawer open={showRes} onClose={() => setShowRes(false)} title="New Reservation">
        <FormField label="Guest name" required><input className={inputClass} value={resForm.guestName} onChange={(e) => setResForm({ ...resForm, guestName: e.target.value })} /></FormField>
        <FormField label="Phone"><input className={inputClass} value={resForm.guestPhone} onChange={(e) => setResForm({ ...resForm, guestPhone: e.target.value })} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Party size"><input type="number" className={inputClass} value={resForm.partySize} onChange={(e) => setResForm({ ...resForm, partySize: Number(e.target.value) })} /></FormField>
          <FormField label="Date & time"><input type="datetime-local" className={inputClass} value={resForm.dateTime} onChange={(e) => setResForm({ ...resForm, dateTime: e.target.value })} /></FormField>
        </div>
        <FormField label="Special requests / pre-order"><textarea className={`${inputClass} min-h-16`} value={resForm.specialRequests} onChange={(e) => setResForm({ ...resForm, specialRequests: e.target.value })} /></FormField>
        <BtnPrimary onClick={createRes} className="mt-2"><Save size={18} /> Book</BtnPrimary>
      </Drawer>

      {/* ── No-show why panel ── */}
      <Drawer open={!!whyRes} onClose={() => setWhyRes(null)} title="Why this no-show score?">
        {whyRes && (
          <div className="space-y-4">
            <div className={cn("p-4 rounded-xl text-center", whyRes.noShowScore >= resCfg.noShowThreshold ? "bg-red-50 border-2 border-red-200" : "bg-cream")}>
              <div className="text-4xl font-bold tabular-nums">{whyRes.noShowScore}</div>
              <div className="font-bold flex items-center justify-center gap-1">{whyRes.noShowScore >= resCfg.noShowThreshold && <AlertTriangle size={16} className="text-red-600" />}{whyRes.noShowScore >= resCfg.noShowThreshold ? "High risk" : "Acceptable risk"}</div>
            </div>
            <div><h3 className="font-bold mb-2">Contributing factors</h3>
              <ul className="space-y-1">{whyFactors(whyRes).map((f) => <li key={f.label} className="flex justify-between text-sm p-2 bg-cream rounded-lg"><span className="text-muted font-medium">{f.label}</span><span className="font-bold">{f.value}</span></li>)}</ul>
            </div>
            {whyRes.noShowScore >= resCfg.noShowThreshold && (
              <div><h3 className="font-bold mb-2">Recommended actions</h3>
                <div className="flex flex-col gap-2">
                  <BtnSecondary onClick={() => confirmReminder(whyRes.id)}><Phone size={16} /> Call to confirm</BtnSecondary>
                  <BtnSecondary onClick={() => toast("Deposit request noted")}>Request deposit</BtnSecondary>
                  <BtnSecondary onClick={() => toast("Overbook buffer applied")}>Apply overbook buffer</BtnSecondary>
                </div>
              </div>
            )}
            <p className="text-xs text-muted">Decision-support only — staff choose what to do. Score updates as the guest confirms or history changes.</p>
          </div>
        )}
      </Drawer>

      {/* ── Waitlist add ── */}
      <Drawer open={showWait} onClose={() => setShowWait(false)} title="Add to Waitlist">
        <FormField label="Guest name" required><input className={inputClass} value={waitForm.guestName} onChange={(e) => setWaitForm({ ...waitForm, guestName: e.target.value })} /></FormField>
        <FormField label="Phone"><input className={inputClass} value={waitForm.phone} onChange={(e) => setWaitForm({ ...waitForm, phone: e.target.value })} /></FormField>
        <div className="grid grid-cols-2 gap-3">
          <FormField label="Party size"><input type="number" className={inputClass} value={waitForm.partySize} onChange={(e) => setWaitForm({ ...waitForm, partySize: Number(e.target.value) })} /></FormField>
          <FormField label="Est. wait (min)"><input type="number" className={inputClass} value={waitForm.estWaitMin} onChange={(e) => setWaitForm({ ...waitForm, estWaitMin: Number(e.target.value) })} /></FormField>
        </div>
        <FormField label="Notify via"><select className={selectClass} value={waitForm.notifyChannel} onChange={(e) => setWaitForm({ ...waitForm, notifyChannel: e.target.value })}><option value="sms">SMS</option><option value="whatsapp">WhatsApp</option><option value="call">Call</option></select></FormField>
        <BtnPrimary onClick={addWait} className="mt-2"><Save size={18} /> Add</BtnPrimary>
      </Drawer>

      <ConfirmDialog open={!!confirmDelete} title="Delete customer?" message="This permanently removes the customer." confirmLabel="Delete" destructive requireReason onConfirm={(reason) => confirmDelete && deleteCustomer(confirmDelete, reason)} onCancel={() => setConfirmDelete(null)} />
    </div>
  );
}

function OfferCard({ kind, offer, onSave }: { kind: string; offer: AutoOffer; onSave: (o: AutoOffer) => void }) {
  const [o, setO] = useState<AutoOffer>(offer);
  useEffect(() => { setO(offer); }, [offer]);
  return (
    <div className="bg-white border-2 border-border rounded-xl p-5 space-y-1">
      <div className="flex items-center justify-between mb-2"><h3 className="font-bold capitalize flex items-center gap-2"><Star size={16} className="text-amber-500" /> {kind} offer</h3>
        <input type="checkbox" checked={o.enabled} onChange={(e) => setO({ ...o, enabled: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></div>
      <div className="grid grid-cols-2 gap-3">
        <FormField label="Days before"><input type="number" className={inputClass} value={o.daysBefore} onChange={(e) => setO({ ...o, daysBefore: Number(e.target.value) })} /></FormField>
        <FormField label="Offer type"><select className={selectClass} value={o.offerType} onChange={(e) => setO({ ...o, offerType: e.target.value })}><option value="percent">% off</option><option value="free_item">Free item</option><option value="bonus_points">Bonus points</option></select></FormField>
        <FormField label="Value"><input type="number" className={inputClass} value={o.value} onChange={(e) => setO({ ...o, value: Number(e.target.value) })} /></FormField>
        <FormField label="Validity (days)"><input type="number" className={inputClass} value={o.validityDays} onChange={(e) => setO({ ...o, validityDays: Number(e.target.value) })} /></FormField>
        <FormField label="Channel"><select className={selectClass} value={o.channel} onChange={(e) => setO({ ...o, channel: e.target.value })}><option value="whatsapp">WhatsApp</option><option value="sms">SMS</option></select></FormField>
        <label className="flex items-center justify-between font-bold text-sm pt-6"><span>Skip lapsed</span><input type="checkbox" checked={o.skipLapsed} onChange={(e) => setO({ ...o, skipLapsed: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
      </div>
      <BtnPrimary onClick={() => onSave(o)} className="mt-2"><Save size={16} /> Save</BtnPrimary>
    </div>
  );
}
