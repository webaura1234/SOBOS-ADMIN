import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const status = req.nextUrl.searchParams.get("status");
  const source = req.nextUrl.searchParams.get("source");
  const period = req.nextUrl.searchParams.get("period");
  const tableFilter = req.nextUrl.searchParams.get("table");
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const id = req.nextUrl.searchParams.get("id");

  if (id) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true, refunds: true },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(order);
  }

  const createdAt: { gte?: Date } = {};
  if (period === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    createdAt.gte = start;
  } else if (period === "week") {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    createdAt.gte = start;
  }

  const orders = await prisma.order.findMany({
    where: {
      ...(locationId && { locationId }),
      ...(status && { status }),
      ...(source && { source }),
      ...(Object.keys(createdAt).length && { createdAt }),
      ...(tableFilter === "with_table" && { tableLabel: { not: null } }),
      ...(tableFilter === "no_table" && { tableLabel: null }),
      ...(search && { OR: [{ number: { contains: search } }, { tableLabel: { contains: search } }] }),
    },
    include: { items: true, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(orders);
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, status, cancelReason } = await req.json();
    const order = await prisma.order.update({
      where: { id },
      data: { status },
      include: { items: true },
    });
    if (status === "cancelled") {
      await prisma.orderItem.updateMany({ where: { orderId: id }, data: { status: "cancelled" } });
    }
    await audit("update", "order", id, { status, cancelReason });
    return NextResponse.json(order);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
