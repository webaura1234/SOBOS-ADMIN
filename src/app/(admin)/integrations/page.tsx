"use client";

import { useEffect, useState } from "react";
import { PageHeader, StatusDot } from "@/components/ui/shared";
import { apiFetch, useToast } from "@/lib/toast";
import { format } from "date-fns";
import { cn } from "@/lib/utils";
import { RefreshCw } from "lucide-react";

interface Integration {
  id: string; provider: string; enabled: boolean; syncStatus: string; lastSync: string | null;
}

const LABELS: Record<string, string> = { swiggy: "Swiggy", zomato: "Zomato", ondc: "ONDC", whatsapp: "WhatsApp", telegram: "Telegram", google: "Google Business", tally: "Tally" };

export default function IntegrationsPage() {
  const { toast } = useToast();
  const [integrations, setIntegrations] = useState<Integration[]>([]);

  const load = async () => setIntegrations(await apiFetch("/api/integrations"));

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
            <button type="button" onClick={() => forceSync(i.id)} className="mt-3 flex items-center gap-2 text-sm font-bold text-black hover:text-primary focus-ring">
              <RefreshCw size={16} /> Force Sync
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
