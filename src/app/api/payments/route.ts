import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET() {
  const config = await prisma.paymentConfig.findFirst();
  const recentOrders = await prisma.order.findMany({
    where: { status: { not: "cancelled" } },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, number: true, source: true, total: true, createdAt: true },
  });
  const refunds = await prisma.refund.findMany({
    include: { order: { select: { number: true, tableLabel: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  const commissionRates = {
    swiggy: config?.swiggyRate ?? 18,
    zomato: config?.zomatoRate ?? 20,
    ondc: config?.ondcRate ?? 10,
  };
  const settlements = Object.entries(recentOrders.reduce<Record<string, { source: string; orderCount: number; gross: number; commission: number; net: number }>>((acc, order) => {
    const rate = commissionRates[order.source as keyof typeof commissionRates] ?? 0;
    const commission = Math.round(order.total * rate) / 100;
    const row = acc[order.source] ?? { source: order.source, orderCount: 0, gross: 0, commission: 0, net: 0 };
    row.orderCount += 1;
    row.gross += order.total;
    row.commission += commission;
    row.net += order.total - commission;
    acc[order.source] = row;
    return acc;
  }, {})).map(([, row]) => row);
  return NextResponse.json({ config, refunds, settlements });
}

export async function PATCH(req: NextRequest) {
  try {
    const data = await req.json();
    const { id, ...fields } = data;
    const config = await prisma.paymentConfig.update({ where: { id }, data: fields });
    await audit("update", "payment_config", id, fields);
    return NextResponse.json(config);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const refund = await prisma.refund.create({
      data: {
        orderId: body.orderId,
        amount: Number(body.amount),
        reason: body.reason,
        status: "processing",
        issuedBy: body.issuedBy ?? "Admin",
      },
      include: { order: { select: { number: true, tableLabel: true } } },
    });
    await audit("create", "refund", refund.id, refund);
    return NextResponse.json(refund, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
