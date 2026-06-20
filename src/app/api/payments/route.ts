import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET() {
  const config = await prisma.paymentConfig.findFirst();
  const refunds = await prisma.refund.findMany({
    include: { order: { select: { number: true, tableLabel: true } } },
    orderBy: { createdAt: "desc" },
    take: 20,
  });
  return NextResponse.json({ config, refunds });
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
