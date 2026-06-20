import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const where = locationId ? { locationId } : {};
  const stockWhere = locationId ? { locationId } : {};
  const tableWhere = locationId ? { locationId, isDeleted: false } : { isDeleted: false };

  const now = new Date();
  const currentHour = now.getHours();

  const lastWeekDayStart = new Date(todayStart);
  lastWeekDayStart.setDate(lastWeekDayStart.getDate() - 7);
  const lastWeekHourStart = new Date(lastWeekDayStart);
  lastWeekHourStart.setHours(currentHour, 0, 0, 0);
  const lastWeekHourEnd = new Date(lastWeekHourStart);
  lastWeekHourEnd.setHours(currentHour + 1, 0, 0, 0);

  const [
    ordersToday,
    revenueToday,
    orders,
    alerts,
    lastWeekSameHourCount,
    pendingOrders,
    occupiedTables,
    stockRows,
    recentOrders,
  ] = await Promise.all([
    prisma.order.count({ where: { ...where, createdAt: { gte: todayStart } } }),
    prisma.order.aggregate({
      where: { ...where, createdAt: { gte: todayStart }, status: { not: "cancelled" } },
      _sum: { total: true },
    }),
    prisma.order.findMany({
      where: { ...where, createdAt: { gte: todayStart } },
      select: { total: true, createdAt: true },
      orderBy: { createdAt: "asc" },
    }),
    prisma.alert.findMany({
      where: locationId ? { locationId } : {},
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    prisma.order.count({
      where: {
        ...where,
        createdAt: { gte: lastWeekHourStart, lt: lastWeekHourEnd },
      },
    }),
    prisma.order.count({
      where: { ...where, status: { in: ["pending", "confirmed", "preparing", "ready"] } },
    }),
    prisma.restaurantTable.count({ where: { ...tableWhere, status: "occupied" } }),
    prisma.stock.findMany({
      where: stockWhere,
      include: { ingredient: { select: { name: true, unit: true, threshold: true } } },
    }),
    prisma.order.findMany({
      where,
      select: {
        id: true,
        number: true,
        status: true,
        total: true,
        tableLabel: true,
        source: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
      take: 6,
    }),
  ]);

  const revenue = revenueToday._sum.total ?? 0;
  const avgTicket = ordersToday > 0 ? revenue / ordersToday : 0;
  const thisHourOrders = orders.filter((o) => new Date(o.createdAt).getHours() === currentHour).length;
  const hourDelta =
    lastWeekSameHourCount > 0
      ? Math.round(((thisHourOrders - lastWeekSameHourCount) / lastWeekSameHourCount) * 100)
      : thisHourOrders > 0
        ? 100
        : 0;

  const hourlyBuckets = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: orders.filter((o) => new Date(o.createdAt).getHours() === h).length,
    revenue: orders.filter((o) => new Date(o.createdAt).getHours() === h).reduce((s, o) => s + o.total, 0),
  }));

  const lowStock = stockRows
    .filter((s) => s.quantity <= s.ingredient.threshold)
    .map((s) => ({
      id: s.id,
      name: s.ingredient.name,
      quantity: s.quantity,
      unit: s.ingredient.unit,
      threshold: s.ingredient.threshold,
    }))
    .slice(0, 6);

  return NextResponse.json({
    kpis: {
      ordersToday,
      revenueToday: revenue,
      avgTicket: Math.round(avgTicket),
      hourDelta,
      pendingOrders,
      occupiedTables,
      lowStockCount: lowStock.length,
    },
    hourlyBuckets,
    alerts,
    lowStock,
    recentOrders,
    sparklines: {
      orders: hourlyBuckets.slice(11, 19).map((b) => b.count),
      revenue: hourlyBuckets.slice(11, 19).map((b) => b.revenue),
    },
  });
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, isRead } = await req.json();
    const alert = await prisma.alert.update({ where: { id }, data: { isRead } });
    return NextResponse.json(alert);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
