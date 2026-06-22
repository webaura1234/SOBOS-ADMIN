"use client";

import { useEffect, useState } from "react";
import { PageHeader, StatusDot, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { FormField, inputClass } from "@/components/ui/forms";
import { apiFetch, useToast } from "@/lib/toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { RefreshCw, Save } from "lucide-react";

interface Integration {
  id: string; provider: string; enabled: boolean; syncStatus: string; lastSync: string | null; config: string;
}

const LABELS: Record<string, string> = { swiggy: "Swiggy", zomato: "Zomato", ondc: "ONDC", whatsapp: "WhatsApp", telegram: "Telegram", google: "Google Business", tally: "Tally" };

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [configs, setConfigs] = useState<Record<string, { apiKey: string; accountId: string; webhookUrl: string; exportSchedule: string }>>({});

  const load = async () => {
    const data = await apiFetch<Integration[]>("/api/integrations");
    setIntegrations(data);
    setConfigs(Object.fromEntries(data.map((integration) => {
      try {
        return [integration.id, { apiKey: "", accountId: "", webhookUrl: "", exportSchedule: "", ...JSON.parse(integration.config || "{}") }];
      } catch {
        return [integration.id, { apiKey: "", accountId: "", webhookUrl: "", exportSchedule: "" }];
      }
    })));
  };

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [toast]);

  const toggle = async (id: string, enabled: boolean) => {
    try {
      await apiFetch("/api/integrations", { method: "PATCH", body: JSON.stringify({ id, enabled }) });
      toast(enabled ? "Integration enabled" : "Integration disabled");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const forceSync = async (id: string) => {
    try {
      await apiFetch("/api/integrations", { method: "PATCH", body: JSON.stringify({ id, enabled: true }) });
      toast("Sync triggered");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const saveConfig = async (integration: Integration) => {
    try {
      await apiFetch("/api/integrations", {
        method: "PATCH",
        body: JSON.stringify({ id: integration.id, config: configs[integration.id] ?? {} }),
      });
      toast("Integration credentials saved");
      load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  return (
    <div>
      <PageHeader title="Integrations" subtitle="Swiggy, Zomato, ONDC, WhatsApp, Telegram, Google, Tally" />
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {integrations.map((i) => (
          <div key={i.id} className={cn("bg-white border-2 rounded-xl p-5", i.enabled ? "border-primary" : "border-border")}>
            <div className="flex justify-between items-start">
              <div><h3 className="font-bold text-lg">{LABELS[i.provider] ?? i.provider}</h3>
                <StatusDot status={i.syncStatus === "success" ? "ready" : "pending"} label={i.syncStatus} /></div>
              <input type="checkbox" checked={i.enabled} onChange={(e) => toggle(i.id, e.target.checked)} className="w-5 h-5 accent-[#F4B315]" aria-label={`Toggle ${i.provider}`} />
            </div>
            {i.lastSync && <p className="text-sm text-muted font-medium mt-2">Last sync: {format(new Date(i.lastSync), "dd MMM HH:mm")}</p>}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
              <FormField label={i.provider === "google" ? "OAuth Client ID" : "API Key / Token"}>
                <input className={inputClass} value={configs[i.id]?.apiKey ?? ""} onChange={(e) => setConfigs({ ...configs, [i.id]: { ...(configs[i.id] ?? { apiKey: "", accountId: "", webhookUrl: "", exportSchedule: "" }), apiKey: e.target.value } })} />
              </FormField>
              <FormField label={i.provider === "tally" ? "Company ID" : "Account / Store ID"}>
                <input className={inputClass} value={configs[i.id]?.accountId ?? ""} onChange={(e) => setConfigs({ ...configs, [i.id]: { ...(configs[i.id] ?? { apiKey: "", accountId: "", webhookUrl: "", exportSchedule: "" }), accountId: e.target.value } })} />
              </FormField>
              <FormField label="Webhook / Callback URL">
                <input className={inputClass} value={configs[i.id]?.webhookUrl ?? ""} onChange={(e) => setConfigs({ ...configs, [i.id]: { ...(configs[i.id] ?? { apiKey: "", accountId: "", webhookUrl: "", exportSchedule: "" }), webhookUrl: e.target.value } })} />
              </FormField>
              <FormField label={i.provider === "tally" ? "Export Schedule" : "Sync Cadence"}>
                <input className={inputClass} value={configs[i.id]?.exportSchedule ?? ""} onChange={(e) => setConfigs({ ...configs, [i.id]: { ...(configs[i.id] ?? { apiKey: "", accountId: "", webhookUrl: "", exportSchedule: "" }), exportSchedule: e.target.value } })} placeholder="hourly / daily / 02:00" />
              </FormField>
            </div>
            <div className="flex gap-3 mt-4">
              <BtnPrimary onClick={() => saveConfig(i)}><Save size={16} /> Save Config</BtnPrimary>
              <BtnSecondary onClick={() => forceSync(i.id)}><RefreshCw size={16} /> Force Sync</BtnSecondary>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
