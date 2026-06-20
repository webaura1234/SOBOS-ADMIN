import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const orderWhere = locationId ? { locationId } : {};
  const stockWhere = locationId ? { locationId } : {};
  const tableWhere = locationId ? { locationId, isDeleted: false } : { isDeleted: false };

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);

  const [pendingOrders, preparingOrders, readyOrders, occupiedTables, stockRows, revenueToday] = await Promise.all([
    prisma.order.count({
      where: { ...orderWhere, status: { in: ["pending", "confirmed"] } },
    }),
    prisma.order.count({ where: { ...orderWhere, status: "preparing" } }),
    prisma.order.count({ where: { ...orderWhere, status: "ready" } }),
    prisma.restaurantTable.count({ where: { ...tableWhere, status: "occupied" } }),
    prisma.stock.findMany({
      where: stockWhere,
      include: { ingredient: { select: { name: true, threshold: true } } },
    }),
    prisma.order.aggregate({
      where: { ...orderWhere, createdAt: { gte: todayStart }, status: { not: "cancelled" } },
      _sum: { total: true },
    }),
  ]);

  const lowStock = stockRows.filter((s) => s.quantity <= s.ingredient.threshold);

  return NextResponse.json({
    pendingOrders,
    preparingOrders,
    readyOrders,
    activeOrders: pendingOrders + preparingOrders + readyOrders,
    occupiedTables,
    lowStockCount: lowStock.length,
    lowStock: lowStock.slice(0, 5).map((s) => ({
      id: s.id,
      name: s.ingredient.name,
      quantity: s.quantity,
      threshold: s.ingredient.threshold,
    })),
    revenueToday: revenueToday._sum.total ?? 0,
  });
}
