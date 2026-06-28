import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const sb = db();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

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
    revenueRows,
    orders,
    alertsResult,
    lastWeekSameHourCount,
    pendingOrders,
    occupiedTables,
    stockResult,
    recentOrdersResult,
  ] = await Promise.all([
    (async () => {
      let q = sb.from("Order").select("*", { count: "exact", head: true }).gte("createdAt", todayIso);
      if (locationId) q = q.eq("locationId", locationId);
      const { count, error } = await q;
      if (error) sbError(error, "dashboard/ordersToday");
      return count ?? 0;
    })(),
    (async () => {
      let q = sb
        .from("Order")
        .select("total")
        .gte("createdAt", todayIso)
        .not("status", "eq", "cancelled");
      if (locationId) q = q.eq("locationId", locationId);
      const { data, error } = await q;
      if (error) sbError(error, "dashboard/revenue");
      return data ?? [];
    })(),
    (async () => {
      let q = sb.from("Order").select("total, createdAt").gte("createdAt", todayIso).order("createdAt", { ascending: true });
      if (locationId) q = q.eq("locationId", locationId);
      const { data, error } = await q;
      if (error) sbError(error, "dashboard/orders");
      return data ?? [];
    })(),
    (async () => {
      let q = sb.from("Alert").select("*").order("createdAt", { ascending: false }).limit(10);
      if (locationId) q = q.eq("locationId", locationId);
      const { data, error } = await q;
      if (error) sbError(error, "dashboard/alerts");
      return data ?? [];
    })(),
    (async () => {
      let q = sb
        .from("Order")
        .select("*", { count: "exact", head: true })
        .gte("createdAt", lastWeekHourStart.toISOString())
        .lt("createdAt", lastWeekHourEnd.toISOString());
      if (locationId) q = q.eq("locationId", locationId);
      const { count, error } = await q;
      if (error) sbError(error, "dashboard/lastWeekHour");
      return count ?? 0;
    })(),
    (async () => {
      let q = sb
        .from("Order")
        .select("*", { count: "exact", head: true })
        .in("status", ["pending", "confirmed", "preparing", "ready"]);
      if (locationId) q = q.eq("locationId", locationId);
      const { count, error } = await q;
      if (error) sbError(error, "dashboard/pendingOrders");
      return count ?? 0;
    })(),
    (async () => {
      let q = sb.from("RestaurantTable").select("*", { count: "exact", head: true }).eq("isDeleted", false).eq("status", "occupied");
      if (locationId) q = q.eq("locationId", locationId);
      const { count, error } = await q;
      if (error) sbError(error, "dashboard/occupiedTables");
      return count ?? 0;
    })(),
    (async () => {
      let q = sb.from("Stock").select("*, ingredient:Ingredient(name, unit, threshold)");
      if (locationId) q = q.eq("locationId", locationId);
      const { data, error } = await q;
      if (error) sbError(error, "dashboard/stock");
      return data ?? [];
    })(),
    (async () => {
      let q = sb
        .from("Order")
        .select("id, number, status, total, tableLabel, source, createdAt")
        .order("createdAt", { ascending: false })
        .limit(6);
      if (locationId) q = q.eq("locationId", locationId);
      const { data, error } = await q;
      if (error) sbError(error, "dashboard/recentOrders");
      return data ?? [];
    })(),
  ]);

  const revenue = revenueRows.reduce((sum: number, o: { total: number }) => sum + Number(o.total), 0);
  const avgTicket = ordersToday > 0 ? revenue / ordersToday : 0;
  const thisHourOrders = orders.filter((o: { createdAt: string }) => new Date(o.createdAt).getHours() === currentHour).length;
  const hourDelta =
    lastWeekSameHourCount > 0
      ? Math.round(((thisHourOrders - lastWeekSameHourCount) / lastWeekSameHourCount) * 100)
      : thisHourOrders > 0
        ? 100
        : 0;

  const hourlyBuckets = Array.from({ length: 24 }, (_, h) => ({
    hour: h,
    count: orders.filter((o: { createdAt: string }) => new Date(o.createdAt).getHours() === h).length,
    revenue: orders
      .filter((o: { createdAt: string }) => new Date(o.createdAt).getHours() === h)
      .reduce((s: number, o: { total: number }) => s + Number(o.total), 0),
  }));

  const stockRows = stockResult as {
    id: string;
    quantity: number;
    ingredient: { name: string; unit: string; threshold: number };
  }[];
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
    alerts: alertsResult,
    lowStock,
    recentOrders: recentOrdersResult,
    sparklines: {
      orders: hourlyBuckets.slice(11, 19).map((b) => b.count),
      revenue: hourlyBuckets.slice(11, 19).map((b) => b.revenue),
    },
  });
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, isRead } = await req.json();
    const { data, error } = await db().from("Alert").update({ isRead }).eq("id", id).select().single();
    if (error) sbError(error, "dashboard/PATCH");
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
