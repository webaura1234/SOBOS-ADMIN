import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getRestaurantId } from "@/lib/api-helpers";

function currentPeriod() { return new Date().toISOString().slice(0, 7); } // YYYY-MM

export async function GET() {
  const restaurantId = await getRestaurantId();
  const config = await prisma.paymentConfig.findFirst();
  const recentOrders = await prisma.order.findMany({ where: { status: { not: "cancelled" } }, orderBy: { createdAt: "desc" }, take: 200, select: { id: true, number: true, source: true, total: true, createdAt: true } });
  const refunds = await prisma.refund.findMany({ include: { order: { select: { number: true, tableLabel: true } } }, orderBy: { createdAt: "desc" }, take: 30 });
  const reconciliations = await prisma.cashReconciliation.findMany({ orderBy: { date: "desc" }, take: 20 });
  const commissionRates = { swiggy: config?.swiggyRate ?? 18, zomato: config?.zomatoRate ?? 20, ondc: config?.ondcRate ?? 10 };
  const period = currentPeriod();

  const computed = Object.values(recentOrders.reduce<Record<string, { source: string; orderCount: number; gross: number; commission: number; net: number }>>((acc, order) => {
    const rate = commissionRates[order.source as keyof typeof commissionRates] ?? 0;
    const commission = Math.round(order.total * rate) / 100;
    const row = acc[order.source] ?? { source: order.source, orderCount: 0, gross: 0, commission: 0, net: 0 };
    row.orderCount += 1; row.gross += order.total; row.commission += commission; row.net += order.total - commission;
    acc[order.source] = row; return acc;
  }, {}));

  // Persisted settlement status per aggregator source for the current period.
  const aggregatorRows = computed.filter((r) => ["swiggy", "zomato", "ondc"].includes(r.source));
  const existing = await prisma.settlement.findMany({ where: { restaurantId, period } });
  const existingMap = new Map(existing.map((s) => [s.source, s]));
  const settlements = computed.map((r) => {
    const rec = existingMap.get(r.source);
    return { ...r, period, status: rec?.status ?? (["swiggy", "zomato", "ondc"].includes(r.source) ? "pending" : "n/a"), settlementId: rec?.id ?? null };
  });

  return NextResponse.json({ config, refunds, settlements, reconciliations, period, aggregatorSources: aggregatorRows.map((r) => r.source) });
}

export async function PATCH(req: NextRequest) {
  try {
    const data = await req.json();
    const restaurantId = await getRestaurantId();

    if (data.type === "settle") {
      // Batch-mark aggregator settlements as Received for a period.
      const period = data.period ?? currentPeriod();
      const sources: string[] = data.sources ?? [];
      for (const source of sources) {
        const gross = Number(data.totals?.[source]?.gross ?? 0), commission = Number(data.totals?.[source]?.commission ?? 0), net = Number(data.totals?.[source]?.net ?? 0);
        await prisma.settlement.upsert({
          where: { restaurantId_source_period: { restaurantId, source, period } },
          update: { status: "received", markedAt: new Date(), gross, commission, net },
          create: { restaurantId, source, period, status: "received", markedAt: new Date(), gross, commission, net },
        });
      }
      await audit("settle", "settlement", null, { period, sources });
      return NextResponse.json({ ok: true });
    }

    if (data.type === "check_status") {
      // Manual payment status poll (webhook fallback) — refresh a refund's status.
      const refund = await prisma.refund.findUnique({ where: { id: data.id } });
      if (!refund) return NextResponse.json({ error: "Refund not found" }, { status: 404 });
      const next = refund.status === "processing" ? "completed" : refund.status;
      const updated = await prisma.refund.update({ where: { id: data.id }, data: { status: next } });
      await audit("check_status", "refund", data.id, { status: next });
      return NextResponse.json(updated);
    }

    const { id, ...fields } = data;
    const config = await prisma.paymentConfig.update({ where: { id }, data: fields });
    await audit("update", "payment_config", id, { ...fields, razorpaySecret: fields.razorpaySecret ? "***" : undefined });
    return NextResponse.json(config);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.type === "reconcile") {
      const expected = Number(body.expected), actual = Number(body.actual);
      const rec = await prisma.cashReconciliation.create({ data: { locationId: body.locationId, expected, actual, variance: actual - expected, note: body.note ?? null } });
      await audit("create", "cash_reconciliation", rec.id, rec);
      return NextResponse.json(rec, { status: 201 });
    }

    const refund = await prisma.refund.create({
      data: { orderId: body.orderId, amount: Number(body.amount), reason: body.reason, status: "processing", issuedBy: body.issuedBy ?? "Admin" },
      include: { order: { select: { number: true, tableLabel: true } } },
    });
    await audit("create", "refund", refund.id, refund);
    return NextResponse.json(refund, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
