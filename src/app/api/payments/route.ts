import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit, getRestaurantId } from "@/lib/api-helpers";

function currentPeriod() {
  return new Date().toISOString().slice(0, 7);
}

export async function GET() {
  const restaurantId = await getRestaurantId();
  const sb = db();

  const [configResult, ordersResult, refundsResult, reconciliationsResult, settlementsResult] = await Promise.all([
    sb.from("PaymentConfig").select("*").limit(1).maybeSingle(),
    sb
      .from("Order")
      .select("id, number, source, total, createdAt")
      .not("status", "eq", "cancelled")
      .order("createdAt", { ascending: false })
      .limit(200),
    sb
      .from("Refund")
      .select("*, order:Order(number, tableLabel)")
      .order("createdAt", { ascending: false })
      .limit(30),
    sb.from("CashReconciliation").select("*").order("date", { ascending: false }).limit(20),
    sb.from("Settlement").select("*").eq("restaurantId", restaurantId).eq("period", currentPeriod()),
  ]);

  if (configResult.error) sbError(configResult.error, "payments/config");
  if (ordersResult.error) sbError(ordersResult.error, "payments/orders");
  if (refundsResult.error) sbError(refundsResult.error, "payments/refunds");
  if (reconciliationsResult.error) sbError(reconciliationsResult.error, "payments/reconciliations");
  if (settlementsResult.error) sbError(settlementsResult.error, "payments/settlements");

  const config = configResult.data;
  const recentOrders = ordersResult.data ?? [];
  const refunds = (refundsResult.data ?? []).map((r) => ({
    ...r,
    order: r.order,
  }));
  const reconciliations = reconciliationsResult.data ?? [];
  const commissionRates = { swiggy: config?.swiggyRate ?? 18, zomato: config?.zomatoRate ?? 20, ondc: config?.ondcRate ?? 10 };
  const period = currentPeriod();

  const computed = Object.values(
    recentOrders.reduce<
      Record<string, { source: string; orderCount: number; gross: number; commission: number; net: number }>
    >((acc, order) => {
      const rate = commissionRates[order.source as keyof typeof commissionRates] ?? 0;
      const commission = Math.round(Number(order.total) * rate) / 100;
      const row = acc[order.source] ?? { source: order.source, orderCount: 0, gross: 0, commission: 0, net: 0 };
      row.orderCount += 1;
      row.gross += Number(order.total);
      row.commission += commission;
      row.net += Number(order.total) - commission;
      acc[order.source] = row;
      return acc;
    }, {}),
  );

  const aggregatorRows = computed.filter((r) => ["swiggy", "zomato", "ondc"].includes(r.source));
  const existingMap = new Map((settlementsResult.data ?? []).map((s) => [s.source, s]));
  const settlements = computed.map((r) => {
    const rec = existingMap.get(r.source);
    return {
      ...r,
      period,
      status: rec?.status ?? (["swiggy", "zomato", "ondc"].includes(r.source) ? "pending" : "n/a"),
      settlementId: rec?.id ?? null,
    };
  });

  return NextResponse.json({
    config,
    refunds,
    settlements,
    reconciliations,
    period,
    aggregatorSources: aggregatorRows.map((r) => r.source),
  });
}

export async function PATCH(req: NextRequest) {
  try {
    const data = await req.json();
    const restaurantId = await getRestaurantId();
    const sb = db();

    if (data.type === "settle") {
      const period = data.period ?? currentPeriod();
      const sources: string[] = data.sources ?? [];
      for (const source of sources) {
        const gross = Number(data.totals?.[source]?.gross ?? 0);
        const commission = Number(data.totals?.[source]?.commission ?? 0);
        const net = Number(data.totals?.[source]?.net ?? 0);
        const { data: existing } = await sb
          .from("Settlement")
          .select("id")
          .eq("restaurantId", restaurantId)
          .eq("source", source)
          .eq("period", period)
          .maybeSingle();
        const payload = {
          id: existing?.id ?? crypto.randomUUID(),
          restaurantId,
          source,
          period,
          status: "received",
          markedAt: new Date().toISOString(),
          gross,
          commission,
          net,
        };
        const { error } = await sb.from("Settlement").upsert(payload, { onConflict: "restaurantId,source,period" });
        if (error) sbError(error, "payments/settle");
      }
      await audit("settle", "settlement", null, { period, sources });
      return NextResponse.json({ ok: true });
    }

    if (data.type === "check_status") {
      const { data: refund, error: findErr } = await sb.from("Refund").select("*").eq("id", data.id).maybeSingle();
      if (findErr) sbError(findErr, "payments/findRefund");
      if (!refund) return NextResponse.json({ error: "Refund not found" }, { status: 404 });
      const next = refund.status === "processing" ? "completed" : refund.status;
      const { data: updated, error } = await sb.from("Refund").update({ status: next }).eq("id", data.id).select().single();
      if (error) sbError(error, "payments/checkStatus");
      await audit("check_status", "refund", data.id, { status: next });
      return NextResponse.json(updated);
    }

    const { id, ...fields } = data;
    const { data: config, error } = await sb.from("PaymentConfig").update(fields).eq("id", id).select().single();
    if (error) sbError(error, "payments/updateConfig");
    await audit("update", "payment_config", id, { ...fields, razorpaySecret: fields.razorpaySecret ? "***" : undefined });
    return NextResponse.json(config);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = db();

    if (body.type === "reconcile") {
      const expected = Number(body.expected);
      const actual = Number(body.actual);
      const { data: rec, error } = await sb
        .from("CashReconciliation")
        .insert({
          id: crypto.randomUUID(),
          locationId: body.locationId,
          expected,
          actual,
          variance: actual - expected,
          note: body.note ?? null,
        })
        .select()
        .single();
      if (error) sbError(error, "payments/reconcile");
      await audit("create", "cash_reconciliation", rec.id, rec);
      return NextResponse.json(rec, { status: 201 });
    }

    const { data: refund, error } = await sb
      .from("Refund")
      .insert({
        id: crypto.randomUUID(),
        orderId: body.orderId,
        amount: Number(body.amount),
        reason: body.reason,
        status: "processing",
        issuedBy: body.issuedBy ?? "Admin",
      })
      .select("*, order:Order(number, tableLabel)")
      .single();
    if (error) sbError(error, "payments/refund");
    await audit("create", "refund", refund.id, refund);
    return NextResponse.json(refund, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
