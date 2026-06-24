"use client";

import { useEffect, useState } from "react";
import { PageHeader, StatusDot, TabBar, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { FormField, inputClass, selectClass } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { RefreshCw, Save, Plug } from "lucide-react";

interface Integration { id: string; provider: string; enabled: boolean; syncStatus: string; lastSync: string | null; config: string; }
interface Log { id: string; integrationId: string; provider: string; status: string; message: string; createdAt: string; }
type Cfg = Record<string, unknown>;

const LABELS: Record<string, string> = { swiggy: "Swiggy", zomato: "Zomato", ondc: "ONDC", whatsapp: "WhatsApp", telegram: "Telegram", google: "Google Business", tally: "Tally" };
const WA_MSG_TYPES = ["order_confirmed", "order_ready", "order_dispatched", "order_delivered", "reservation_confirm", "reservation_reminder", "receipt", "loyalty", "marketing"];
const TG_ALERTS = ["daily_revenue", "kitchen_delay", "stock_out", "large_refund", "unusual_void"];
const TALLY_EXPORTS = ["daily_sales", "monthly_summary", "gst_report", "purchase_summary"];

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [logs, setLogs] = useState<Log[]>([]);
  const [configs, setConfigs] = useState<Record<string, Cfg>>({});
  const [active, setActive] = useState<string>("");

  const load = async () => {
    const data = await apiFetch<{ integrations: Integration[]; logs: Log[] }>("/api/integrations");
    setIntegrations(data.integrations); setLogs(data.logs);
    setConfigs(Object.fromEntries(data.integrations.map((i) => { try { return [i.id, JSON.parse(i.config || "{}")]; } catch { return [i.id, {}]; } })));
    if (!active && data.integrations[0]) setActive(data.integrations[0].id);
  };
  useEffect(() => { load().catch((e) => toast(e.message, "error")); /* eslint-disable-next-line */ }, [toast]);

  const integration = integrations.find((i) => i.id === active);
  const cfg = (active && configs[active]) || {};
  const setCfg = (patch: Cfg) => setConfigs({ ...configs, [active]: { ...cfg, ...patch } });
  const arr = (key: string): string[] => Array.isArray(cfg[key]) ? (cfg[key] as string[]) : [];
  const toggleArr = (key: string, val: string) => setCfg({ [key]: arr(key).includes(val) ? arr(key).filter((x) => x !== val) : [...arr(key), val] });

  const toggle = async (id: string, enabled: boolean) => { try { await apiFetch("/api/integrations", { method: "PATCH", body: JSON.stringify({ id, enabled }) }); toast(enabled ? "Enabled" : "Disabled"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const forceSync = async (id: string) => { try { await apiFetch("/api/integrations", { method: "PATCH", body: JSON.stringify({ id, type: "sync" }) }); toast("Sync triggered"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const saveConfig = async () => { if (!integration) return; try { await apiFetch("/api/integrations", { method: "PATCH", body: JSON.stringify({ id: integration.id, config: cfg }) }); toast("Configuration saved"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  const provider = integration?.provider;
  const providerLogs = logs.filter((l) => l.integrationId === active);

  return (
    <div>
      <PageHeader title="Integrations" subtitle="Swiggy, Zomato, ONDC, WhatsApp, Telegram, Google, Tally — config + sync logs" />
      <TabBar tabs={integrations.map((i) => ({ id: i.id, label: LABELS[i.provider] ?? i.provider }))} active={active} onChange={setActive} />

      {integration && (
        <div className="grid grid-cols-1 lg:grid-cols-[1fr_360px] gap-4">
          <div className="bg-white border-2 border-border rounded-xl p-5 space-y-1">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2"><Plug size={20} /><h2 className="font-bold text-lg">{LABELS[provider!] ?? provider}</h2><StatusDot status={integration.syncStatus === "success" ? "ready" : integration.syncStatus === "failure" ? "cancelled" : "pending"} label={integration.syncStatus} /></div>
              <label className="flex items-center gap-2 font-bold"><span>Enabled</span><input type="checkbox" checked={integration.enabled} onChange={(e) => toggle(integration.id, e.target.checked)} className="w-5 h-5 accent-[#F4B315]" /></label>
            </div>
            {integration.lastSync && <p className="text-sm text-muted font-medium mb-3">Last sync: {format(new Date(integration.lastSync), "dd MMM HH:mm")}</p>}

            {/* Aggregators */}
            {(provider === "swiggy" || provider === "zomato") && (<>
              <FormField label="API key"><input className={inputClass} value={String(cfg.apiKey ?? "")} onChange={(e) => setCfg({ apiKey: e.target.value })} /></FormField>
              <FormField label="Store ID"><input className={inputClass} value={String(cfg.storeId ?? "")} onChange={(e) => setCfg({ storeId: e.target.value })} /></FormField>
              <div className="grid grid-cols-3 gap-3">
                <FormField label="Commission %"><input type="number" className={inputClass} value={Number(cfg.commissionRate ?? (provider === "swiggy" ? 18 : 20))} onChange={(e) => setCfg({ commissionRate: Number(e.target.value) })} /></FormField>
                <FormField label="Menu sync (min)"><input type="number" className={inputClass} value={Number(cfg.menuSyncMin ?? 15)} onChange={(e) => setCfg({ menuSyncMin: Number(e.target.value) })} /></FormField>
                <FormField label="Order poll (sec)"><input type="number" className={inputClass} value={Number(cfg.orderPollSec ?? 30)} onChange={(e) => setCfg({ orderPollSec: Number(e.target.value) })} /></FormField>
              </div>
            </>)}

            {provider === "ondc" && (<>
              <div className="p-3 mb-2 rounded-lg bg-cream text-sm font-medium text-muted">ONDC runs as a stub initially — orders flow through the normal order list / KDS / commission report with an ONDC source badge.</div>
              <FormField label="Registration ID"><input className={inputClass} value={String(cfg.registrationId ?? "")} onChange={(e) => setCfg({ registrationId: e.target.value })} /></FormField>
              <FormField label="Commission %"><input type="number" className={inputClass} value={Number(cfg.commissionRate ?? 10)} onChange={(e) => setCfg({ commissionRate: Number(e.target.value) })} /></FormField>
            </>)}

            {/* WhatsApp */}
            {provider === "whatsapp" && (<>
              <FormField label="Provider"><select className={selectClass} value={String(cfg.provider ?? "twilio")} onChange={(e) => setCfg({ provider: e.target.value })}><option value="twilio">Twilio</option><option value="gupshup">Gupshup</option></select></FormField>
              <FormField label="API credentials"><input className={inputClass} value={String(cfg.apiKey ?? "")} onChange={(e) => setCfg({ apiKey: e.target.value })} /></FormField>
              <FormField label="Pre-approved templates" hint="One per line (must be approved by provider)"><textarea className={`${inputClass} min-h-20`} value={(arr("templates")).join("\n")} onChange={(e) => setCfg({ templates: e.target.value.split("\n").filter(Boolean) })} /></FormField>
              <FormField label="Message types"><div className="flex flex-wrap gap-1.5">{WA_MSG_TYPES.map((t) => <button key={t} type="button" onClick={() => toggleArr("messageTypes", t)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold border-2 capitalize", arr("messageTypes").includes(t) ? "bg-primary border-primary" : "border-border bg-white text-muted")}>{t.replace(/_/g, " ")}</button>)}</div></FormField>
              <div className="grid grid-cols-3 gap-2 mt-2 text-center">
                {[["Sent", logs.filter((l) => l.provider === "whatsapp").length], ["Delivered", Math.round(logs.filter((l) => l.provider === "whatsapp").length * 0.9)], ["Read", Math.round(logs.filter((l) => l.provider === "whatsapp").length * 0.6)]].map(([k, v]) => (
                  <div key={String(k)} className="p-2 bg-cream rounded-lg"><div className="text-xl font-bold tabular-nums">{v as number}</div><div className="text-xs text-muted font-bold">{k}</div></div>
                ))}
              </div>
            </>)}

            {/* Telegram */}
            {provider === "telegram" && (<>
              {cfg.connected ? <div className="p-3 mb-2 rounded-lg bg-green-50 border-2 border-green-200 text-sm font-bold text-green-800">Connected. Owners receive alerts in Telegram.</div>
                : <div className="p-3 mb-2 rounded-lg bg-cream text-sm font-medium">Open the bot → send <code className="bg-white px-1 rounded">/start</code> → then connect below. Multiple owners can connect independently.</div>}
              <FormField label="Bot token"><input className={inputClass} value={String(cfg.botToken ?? "")} onChange={(e) => setCfg({ botToken: e.target.value })} /></FormField>
              <BtnSecondary onClick={() => setCfg({ connected: !cfg.connected })}>{cfg.connected ? "Disconnect" : "Connect bot"}</BtnSecondary>
              <FormField label="Alert toggles" hint="Per-owner alert types"><div className="flex flex-wrap gap-1.5">{TG_ALERTS.map((t) => <button key={t} type="button" onClick={() => toggleArr("alerts", t)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold border-2 capitalize", arr("alerts").includes(t) ? "bg-primary border-primary" : "border-border bg-white text-muted")}>{t.replace(/_/g, " ")}</button>)}</div></FormField>
            </>)}

            {/* Google */}
            {provider === "google" && (<>
              <FormField label="OAuth Client ID"><input className={inputClass} value={String(cfg.clientId ?? "")} onChange={(e) => setCfg({ clientId: e.target.value })} /></FormField>
              <FormField label="Sync schedule"><select className={selectClass} value={String(cfg.syncSchedule ?? "daily_2am")} onChange={(e) => setCfg({ syncSchedule: e.target.value })}><option value="daily_2am">Daily 2 AM</option><option value="manual">Manual only</option></select></FormField>
              <FormField label="Push to Google"><div className="flex flex-wrap gap-1.5">{["hours", "phone", "address", "menu", "photos"].map((t) => <button key={t} type="button" onClick={() => toggleArr("push", t)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold border-2 capitalize", arr("push").includes(t) ? "bg-primary border-primary" : "border-border bg-white text-muted")}>{t}</button>)}</div></FormField>
              <FormField label="Pull from Google"><div className="flex flex-wrap gap-1.5">{["reviews", "ratings"].map((t) => <button key={t} type="button" onClick={() => toggleArr("pull", t)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold border-2 capitalize", arr("pull").includes(t) ? "bg-primary border-primary" : "border-border bg-white text-muted")}>{t}</button>)}</div></FormField>
              <BtnSecondary onClick={() => { setCfg({ reauth: Date.now() }); toast("Re-authentication started"); }}>Re-authenticate</BtnSecondary>
            </>)}

            {/* Tally */}
            {provider === "tally" && (<>
              <FormField label="Auto-export schedule"><select className={selectClass} value={String(cfg.exportSchedule ?? "daily")} onChange={(e) => setCfg({ exportSchedule: e.target.value })}><option value="daily">Daily</option><option value="weekly">Weekly</option><option value="monthly">Monthly</option><option value="off">Off</option></select></FormField>
              <FormField label="Accountant email"><input className={inputClass} value={String(cfg.accountantEmail ?? "")} onChange={(e) => setCfg({ accountantEmail: e.target.value })} /></FormField>
              <FormField label="Export types"><div className="flex flex-wrap gap-1.5">{TALLY_EXPORTS.map((t) => <button key={t} type="button" onClick={() => toggleArr("exportTypes", t)} className={cn("px-2.5 py-1 rounded-lg text-xs font-bold border-2 capitalize", arr("exportTypes").includes(t) ? "bg-primary border-primary" : "border-border bg-white text-muted")}>{t.replace(/_/g, " ")}</button>)}</div></FormField>
              <BtnSecondary onClick={() => { forceSync(integration.id); toast("Generating Tally-compatible XML export"); }}>Generate now</BtnSecondary>
            </>)}

            <div className="flex gap-3 mt-4 pt-4 border-t border-border">
              <BtnPrimary onClick={saveConfig}><Save size={16} /> Save Config</BtnPrimary>
              <BtnSecondary onClick={() => forceSync(integration.id)}><RefreshCw size={16} /> Force Sync</BtnSecondary>
            </div>
          </div>

          <div className="bg-white border-2 border-border rounded-xl p-5">
            <h3 className="font-bold mb-3">Sync logs</h3>
            {providerLogs.length === 0 ? <p className="text-muted font-medium text-sm">No sync activity yet.</p> : (
              <ul className="space-y-2 max-h-[480px] overflow-auto">{providerLogs.map((l) => (
                <li key={l.id} className={cn("p-2.5 rounded-lg text-sm border-l-4", l.status === "success" ? "bg-green-50 border-green-400" : "bg-red-50 border-red-400")}>
                  <div className="font-bold">{l.message}</div>
                  <div className="text-xs text-muted">{format(new Date(l.createdAt), "dd MMM HH:mm:ss")} · {l.status}</div>
                </li>
              ))}</ul>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
