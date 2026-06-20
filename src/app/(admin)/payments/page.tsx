"use client";

import { useEffect, useState } from "react";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, PageHeader, StatusDot, TabBar, BtnPrimary, BtnSecondary } from "@/components/ui/shared";
import { FormField, inputClass } from "@/components/ui/forms";
import { formatCurrency } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { format } from "date-fns";
import { Save, Plus } from "lucide-react";

interface PaymentConfig {
  id: string; cashEnabled: boolean; cardEnabled: boolean; upiEnabled: boolean;
  splitEnabled: boolean; tipsEnabled: boolean; tipPooling: string;
  swiggyRate: number; zomatoRate: number; ondcRate: number;
}

interface RefundRow {
  id: string; amount: number; reason: string; status: string; orderId: string;
  order: { number: string; tableLabel: string | null };
}

export default function PaymentsPage() {
  const { toast } = useToast();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [tab, setTab] = useState("methods");
  const [showRefund, setShowRefund] = useState(false);
  const [refundForm, setRefundForm] = useState({ orderId: "", amount: 0, reason: "" });
  const [orderOptions, setOrderOptions] = useState<{ id: string; number: string; total: number }[]>([]);

  const load = async () => {
    const data = await apiFetch<{ config: PaymentConfig; refunds: RefundRow[] }>("/api/payments");
    setConfig(data.config);
    setRefunds(data.refunds);
    const orders = await apiFetch<{ id: string; number: string; total: number }[]>("/api/orders");
    setOrderOptions(orders.slice(0, 20));
  };

  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [toast]);

  const saveConfig = async () => {
    if (!config) return;
    try {
      await apiFetch("/api/payments", { method: "PATCH", body: JSON.stringify(config) });
      toast("Payment settings saved");
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const issueRefund = async () => {
    try {
      await apiFetch("/api/payments", { method: "POST", body: JSON.stringify(refundForm) });
      toast("Refund initiated"); setShowRefund(false); load();
    } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };

  const refundColumns: Column<RefundRow & { id: string }>[] = [
    { key: "order", header: "Order", render: (r) => r.order.number },
    { key: "amount", header: "Amount", align: "right", render: (r) => formatCurrency(r.amount) },
    { key: "reason", header: "Reason" },
    { key: "status", header: "Status", render: (r) => <StatusDot status={r.status} /> },
  ];

  if (!config) return <div className="animate-pulse h-32 bg-cream rounded-xl" />;

  return (
    <div>
      <PageHeader title="Payments" subtitle="Methods, commissions, refunds"
        actions={tab === "refunds" ? <BtnPrimary onClick={() => setShowRefund(true)}><Plus size={18} /> Issue Refund</BtnPrimary> : undefined} />
      <TabBar tabs={[{ id: "methods", label: "Payment Methods" }, { id: "tips", label: "Tips" }, { id: "commissions", label: "Commissions" }, { id: "refunds", label: "Refunds" }]} active={tab} onChange={setTab} />

      {tab === "methods" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-4">
          {([["cashEnabled", "Cash"], ["cardEnabled", "Card"], ["upiEnabled", "UPI"], ["splitEnabled", "Split Payment"]] as const).map(([key, label]) => (
            <label key={key} className="flex justify-between font-bold text-black"><span>{label}</span>
              <input type="checkbox" checked={config[key]} onChange={(e) => setConfig({ ...config, [key]: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          ))}
          <BtnPrimary onClick={saveConfig}><Save size={18} /> Save</BtnPrimary>
        </div>
      )}

      {tab === "tips" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-4">
          <label className="flex justify-between font-bold"><span>Enable Tips</span>
            <input type="checkbox" checked={config.tipsEnabled} onChange={(e) => setConfig({ ...config, tipsEnabled: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          <FormField label="Tip Pooling"><select className={inputClass} value={config.tipPooling} onChange={(e) => setConfig({ ...config, tipPooling: e.target.value })}>
            <option value="per_server">Per Server</option><option value="equal">Equal Split</option><option value="percentage">Percentage</option>
          </select></FormField>
          <BtnPrimary onClick={saveConfig}><Save size={18} /> Save</BtnPrimary>
        </div>
      )}

      {tab === "commissions" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-4">
          {([["swiggyRate", "Swiggy"], ["zomatoRate", "Zomato"], ["ondcRate", "ONDC"]] as const).map(([key, label]) => (
            <FormField key={key} label={`${label} Rate (%)`}><input type="number" className={inputClass} value={config[key]} onChange={(e) => setConfig({ ...config, [key]: Number(e.target.value) })} /></FormField>
          ))}
          <BtnPrimary onClick={saveConfig}><Save size={18} /> Save</BtnPrimary>
        </div>
      )}

      {tab === "refunds" && <DenseGrid columns={refundColumns} data={refunds} selectable={false} onRowClick={() => {}} />}

      <Drawer open={showRefund} onClose={() => setShowRefund(false)} title="Issue Refund">
        <FormField label="Order"><select className={inputClass} value={refundForm.orderId} onChange={(e) => {
          const o = orderOptions.find((x) => x.id === e.target.value);
          setRefundForm({ ...refundForm, orderId: e.target.value, amount: o?.total ?? refundForm.amount });
        }}>
          <option value="">— Select order —</option>
          {orderOptions.map((o) => <option key={o.id} value={o.id}>{o.number} — {formatCurrency(o.total)}</option>)}
        </select></FormField>
        <FormField label="Amount (₹)"><input type="number" className={inputClass} value={refundForm.amount} onChange={(e) => setRefundForm({ ...refundForm, amount: Number(e.target.value) })} /></FormField>
        <FormField label="Reason"><input className={inputClass} value={refundForm.reason} onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })} /></FormField>
        <BtnPrimary onClick={issueRefund} className="mt-4"><Save size={18} /> Submit Refund</BtnPrimary>
      </Drawer>
    </div>
  );
}
