import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "margin";

  if (tab === "waste") {
    const wastage = await prisma.wastageLog.findMany({
      include: { ingredient: true },
      orderBy: { createdAt: "desc" },
    });
    const byReason = wastage.reduce<Record<string, number>>((acc, w) => {
      acc[w.reason] = (acc[w.reason] ?? 0) + w.estCost;
      return acc;
    }, {});
    return NextResponse.json({ wastage, byReason });
  }

  if (tab === "margin") {
    const items = await prisma.menuItem.findMany({
      where: { isDeleted: false },
      select: { id: true, name: true, basePrice: true, recipeCost: true, grossMargin: true, unitsSold: true },
      orderBy: { grossMargin: "asc" },
    });
    return NextResponse.json({ items });
  }

  if (tab === "top-selling") {
    const items = await prisma.menuItem.findMany({
      where: { isDeleted: false },
      orderBy: { unitsSold: "desc" },
      take: 20,
    });
    return NextResponse.json({ items });
  }

  const orders = await prisma.order.groupBy({
    by: ["source"],
    _count: true,
    _sum: { total: true },
  });
  return NextResponse.json({ paymentBreakdown: orders });
}
