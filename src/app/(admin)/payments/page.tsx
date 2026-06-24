"use client";

import { useEffect, useState } from "react";
import { DenseGrid, type Column } from "@/components/ui/dense-grid";
import { Drawer, PageHeader, StatusDot, TabBar, BtnPrimary } from "@/components/ui/shared";
import { FormField, inputClass, selectClass } from "@/components/ui/forms";
import { formatCurrency, cn } from "@/lib/utils";
import { apiFetch, useToast } from "@/lib/toast";
import { useApp } from "@/lib/context";
import { format } from "date-fns";
import { Save, Plus } from "lucide-react";

interface PaymentConfig {
  id: string; razorpayKey: string | null; razorpaySecret: string | null; webhookUrl: string | null; testMode: boolean;
  cashEnabled: boolean; cardEnabled: boolean; upiEnabled: boolean; walletEnabled: boolean;
  splitEnabled: boolean; splitMax: number; tipsEnabled: boolean; tipPooling: string; tipType: string;
  swiggyRate: number; zomatoRate: number; ondcRate: number;
}
interface RefundRow { id: string; amount: number; reason: string; status: string; orderId: string; order: { number: string; tableLabel: string | null }; }
interface SettlementRow { source: string; orderCount: number; gross: number; commission: number; net: number; period: string; status: string; settlementId: string | null; }
interface Reconciliation { id: string; date: string; expected: number; actual: number; variance: number; note: string | null; }

export default function PaymentsPage() {
  const { toast } = useToast();
  const { locations, locationId } = useApp();
  const [config, setConfig] = useState<PaymentConfig | null>(null);
  const [refunds, setRefunds] = useState<RefundRow[]>([]);
  const [settlements, setSettlements] = useState<SettlementRow[]>([]);
  const [reconciliations, setReconciliations] = useState<Reconciliation[]>([]);
  const [period, setPeriod] = useState("");
  const [tab, setTab] = useState("methods");
  const [showRefund, setShowRefund] = useState(false);
  const [refundForm, setRefundForm] = useState({ orderId: "", amount: 0, reason: "" });
  const [orderOptions, setOrderOptions] = useState<{ id: string; number: string; total: number }[]>([]);
  const [reconForm, setReconForm] = useState({ locationId: "", expected: 0, actual: 0, note: "" });

  const load = async () => {
    const data = await apiFetch<{ config: PaymentConfig; refunds: RefundRow[]; settlements: SettlementRow[]; reconciliations: Reconciliation[]; period: string }>("/api/payments");
    setConfig(data.config); setRefunds(data.refunds); setSettlements(data.settlements); setReconciliations(data.reconciliations); setPeriod(data.period);
    const orders = await apiFetch<{ id: string; number: string; total: number }[]>("/api/orders");
    setOrderOptions(orders.slice(0, 20));
  };
  useEffect(() => { load().catch((e) => toast(e.message, "error")); }, [toast]);

  const saveConfig = async () => { if (!config) return; try { await apiFetch("/api/payments", { method: "PATCH", body: JSON.stringify(config) }); toast("Payment settings saved"); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const issueRefund = async () => { try { await apiFetch("/api/payments", { method: "POST", body: JSON.stringify(refundForm) }); toast("Refund initiated"); setShowRefund(false); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const checkStatus = async (id: string) => { try { await apiFetch("/api/payments", { method: "PATCH", body: JSON.stringify({ type: "check_status", id }) }); toast("Status refreshed"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };
  const markSettled = async () => {
    const pending = settlements.filter((s) => s.status === "pending");
    if (pending.length === 0) { toast("No pending settlements", "error"); return; }
    const totals = Object.fromEntries(pending.map((s) => [s.source, { gross: s.gross, commission: s.commission, net: s.net }]));
    try { await apiFetch("/api/payments", { method: "PATCH", body: JSON.stringify({ type: "settle", period, sources: pending.map((s) => s.source), totals }) }); toast("Marked settlements as Received"); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); }
  };
  const addReconciliation = async () => { try { await apiFetch("/api/payments", { method: "POST", body: JSON.stringify({ type: "reconcile", ...reconForm, locationId: reconForm.locationId || locationId || locations[0]?.id }) }); toast("Reconciliation recorded"); setReconForm({ locationId: "", expected: 0, actual: 0, note: "" }); load(); } catch (e) { toast(e instanceof Error ? e.message : "Failed", "error"); } };

  const refundColumns: Column<RefundRow>[] = [
    { key: "order", header: "Order", render: (r) => r.order.number },
    { key: "amount", header: "Amount", align: "right", render: (r) => formatCurrency(r.amount) },
    { key: "reason", header: "Reason" },
    { key: "status", header: "Status", render: (r) => <StatusDot status={r.status} /> },
    { key: "act", header: "", render: (r) => r.status === "processing" ? <button type="button" onClick={(e) => { e.stopPropagation(); checkStatus(r.id); }} className="text-xs font-bold underline">Check status</button> : null },
  ];
  const settlementColumns: Column<SettlementRow & { id: string }>[] = [
    { key: "source", header: "Source", render: (r) => <span className="capitalize font-bold">{r.source.replace(/_/g, " ")}</span> },
    { key: "orderCount", header: "Orders", align: "right" },
    { key: "gross", header: "Gross", align: "right", render: (r) => formatCurrency(r.gross) },
    { key: "commission", header: "Commission", align: "right", render: (r) => formatCurrency(r.commission) },
    { key: "net", header: "Net Payable", align: "right", render: (r) => formatCurrency(r.net) },
    { key: "status", header: "Settlement", render: (r) => r.status === "n/a" ? <span className="text-muted text-sm">—</span> : <StatusDot status={r.status === "received" ? "completed" : "pending"} label={r.status} /> },
  ];

  if (!config) return <div className="animate-pulse h-32 bg-cream rounded-xl" />;

  return (
    <div>
      <PageHeader title="Payments" subtitle="Gateway, methods, split, tips, commissions, settlements, cash drawer, refunds"
        actions={tab === "refunds" ? <BtnPrimary onClick={() => setShowRefund(true)}><Plus size={18} /> Issue Refund</BtnPrimary> : undefined} />
      <TabBar tabs={[{ id: "methods", label: "Methods" }, { id: "gateway", label: "Gateway" }, { id: "tips", label: "Tips" }, { id: "commissions", label: "Commissions" }, { id: "settlements", label: "Settlements" }, { id: "cash", label: "Cash Drawer" }, { id: "refunds", label: "Refunds" }]} active={tab} onChange={setTab} />

      {tab === "methods" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-4">
          {([["cashEnabled", "Cash"], ["cardEnabled", "Card"], ["upiEnabled", "UPI"], ["walletEnabled", "Wallet"]] as const).map(([key, label]) => (
            <label key={key} className="flex justify-between font-bold text-black"><span>{label}{(key === "cardEnabled" || key === "upiEnabled" || key === "walletEnabled") && !config.razorpayKey && <span className="text-xs text-muted font-medium ml-2">needs Razorpay</span>}</span><input type="checkbox" checked={config[key]} onChange={(e) => setConfig({ ...config, [key]: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          ))}
          <div className="pt-2 border-t border-border space-y-3">
            <label className="flex justify-between font-bold"><span>Split payment</span><input type="checkbox" checked={config.splitEnabled} onChange={(e) => setConfig({ ...config, splitEnabled: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
            <FormField label="Max splits (0 = unlimited)"><input type="number" className={inputClass} value={config.splitMax} onChange={(e) => setConfig({ ...config, splitMax: Number(e.target.value) })} /></FormField>
          </div>
          <BtnPrimary onClick={saveConfig}><Save size={18} /> Save</BtnPrimary>
        </div>
      )}

      {tab === "gateway" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-1">
          <label className="flex justify-between font-bold mb-3"><span>Test mode</span><input type="checkbox" checked={config.testMode} onChange={(e) => setConfig({ ...config, testMode: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          <FormField label="Razorpay Key ID"><input className={inputClass} value={config.razorpayKey ?? ""} onChange={(e) => setConfig({ ...config, razorpayKey: e.target.value })} /></FormField>
          <FormField label="Razorpay Secret" hint="Stored encrypted; shown masked"><input type="password" className={inputClass} value={config.razorpaySecret ?? ""} onChange={(e) => setConfig({ ...config, razorpaySecret: e.target.value })} placeholder="••••••••" /></FormField>
          <FormField label="Webhook endpoint" hint="Auto-generated; point Razorpay here"><input className={inputClass} value={config.webhookUrl ?? `${typeof window !== "undefined" ? window.location.origin : ""}/api/webhooks/razorpay`} onChange={(e) => setConfig({ ...config, webhookUrl: e.target.value })} /></FormField>
          <BtnPrimary onClick={saveConfig} className="mt-3"><Save size={18} /> Save Gateway</BtnPrimary>
        </div>
      )}

      {tab === "tips" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-4">
          <label className="flex justify-between font-bold"><span>Enable tips</span><input type="checkbox" checked={config.tipsEnabled} onChange={(e) => setConfig({ ...config, tipsEnabled: e.target.checked })} className="w-5 h-5 accent-[#F4B315]" /></label>
          <FormField label="Tip type"><select className={selectClass} value={config.tipType} onChange={(e) => setConfig({ ...config, tipType: e.target.value })}><option value="percentage">Percentage</option><option value="fixed">Fixed amount</option></select></FormField>
          <FormField label="Pooling rule"><select className={selectClass} value={config.tipPooling} onChange={(e) => setConfig({ ...config, tipPooling: e.target.value })}><option value="per_server">Per server</option><option value="equal">Equal split</option><option value="percentage">Percentage ratio</option></select></FormField>
          <BtnPrimary onClick={saveConfig}><Save size={18} /> Save</BtnPrimary>
        </div>
      )}

      {tab === "commissions" && (
        <div className="bg-white border-2 border-border rounded-xl p-5 max-w-lg space-y-4">
          <p className="text-sm text-muted font-medium">Rate changes apply to new orders only.</p>
          {([["swiggyRate", "Swiggy"], ["zomatoRate", "Zomato"], ["ondcRate", "ONDC"]] as const).map(([key, label]) => (
            <FormField key={key} label={`${label} Rate (%)`}><input type="number" className={inputClass} value={config[key]} onChange={(e) => setConfig({ ...config, [key]: Number(e.target.value) })} /></FormField>
          ))}
          <BtnPrimary onClick={saveConfig}><Save size={18} /> Save</BtnPrimary>
        </div>
      )}

      {tab === "settlements" && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-bold text-muted">Period {period} · {settlements.filter((s) => s.status === "pending").length} pending</span>
            <BtnPrimary onClick={markSettled}><Save size={18} /> Mark pending as Received</BtnPrimary>
          </div>
          <DenseGrid columns={settlementColumns} data={settlements.map((row) => ({ ...row, id: row.source }))} selectable={false} onRowClick={() => {}} />
        </div>
      )}

      {tab === "cash" && (
        <div className="space-y-4 max-w-2xl">
          <div className="page-surface p-5">
            <h3 className="font-bold mb-3">Drawer reconciliation</h3>
            <div className="grid grid-cols-2 gap-3">
              {locations.length > 1 && <FormField label="Location"><select className={selectClass} value={reconForm.locationId} onChange={(e) => setReconForm({ ...reconForm, locationId: e.target.value })}>{locations.map((l) => <option key={l.id} value={l.id}>{l.name}</option>)}</select></FormField>}
              <FormField label="Expected (₹)"><input type="number" className={inputClass} value={reconForm.expected} onChange={(e) => setReconForm({ ...reconForm, expected: Number(e.target.value) })} /></FormField>
              <FormField label="Actual counted (₹)"><input type="number" className={inputClass} value={reconForm.actual} onChange={(e) => setReconForm({ ...reconForm, actual: Number(e.target.value) })} /></FormField>
            </div>
            <p className={cn("font-bold mb-2", reconForm.actual - reconForm.expected === 0 ? "text-green-700" : "text-red-600")}>Variance: {formatCurrency(reconForm.actual - reconForm.expected)}</p>
            <FormField label="Note"><input className={inputClass} value={reconForm.note} onChange={(e) => setReconForm({ ...reconForm, note: e.target.value })} /></FormField>
            <BtnPrimary onClick={addReconciliation}><Save size={18} /> Record</BtnPrimary>
          </div>
          <DenseGrid columns={[
            { key: "date", header: "Date", render: (r: Reconciliation) => format(new Date(r.date), "dd MMM HH:mm") },
            { key: "expected", header: "Expected", align: "right", render: (r: Reconciliation) => formatCurrency(r.expected) },
            { key: "actual", header: "Actual", align: "right", render: (r: Reconciliation) => formatCurrency(r.actual) },
            { key: "variance", header: "Variance", align: "right", render: (r: Reconciliation) => <span className={cn("font-bold", r.variance !== 0 && "text-red-600")}>{formatCurrency(r.variance)}</span> },
          ]} data={reconciliations} selectable={false} onRowClick={() => {}} emptyMessage="No reconciliations yet" />
        </div>
      )}

      {tab === "refunds" && <DenseGrid columns={refundColumns} data={refunds} selectable={false} onRowClick={() => {}} />}

      <Drawer open={showRefund} onClose={() => setShowRefund(false)} title="Issue Refund">
        <FormField label="Order"><select className={selectClass} value={refundForm.orderId} onChange={(e) => { const o = orderOptions.find((x) => x.id === e.target.value); setRefundForm({ ...refundForm, orderId: e.target.value, amount: o?.total ?? refundForm.amount }); }}>
          <option value="">— Select order —</option>{orderOptions.map((o) => <option key={o.id} value={o.id}>{o.number} — {formatCurrency(o.total)}</option>)}
        </select></FormField>
        <FormField label="Amount (₹)" hint="Full or partial"><input type="number" className={inputClass} value={refundForm.amount} onChange={(e) => setRefundForm({ ...refundForm, amount: Number(e.target.value) })} /></FormField>
        <FormField label="Reason"><input className={inputClass} value={refundForm.reason} onChange={(e) => setRefundForm({ ...refundForm, reason: e.target.value })} /></FormField>
        <BtnPrimary onClick={issueRefund} className="mt-4"><Save size={18} /> Submit Refund</BtnPrimary>
      </Drawer>
    </div>
  );
}
