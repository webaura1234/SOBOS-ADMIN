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
    activeOrders,
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
        .select("id, number, status, createdAt")
        .in("status", ["pending", "confirmed", "preparing", "ready"]);
      if (locationId) q = q.eq("locationId", locationId);
      const { data, error } = await q;
      if (error) sbError(error, "dashboard/activeOrders");
      return data ?? [];
    })(),
    (async () => {
      let q = sb.from("RestaurantTable").select("*", { count: "exact", head: true }).eq("isDeleted", false).eq("status", "occupied");
      if (locationId) q = q.eq("locationId", locationId);
      const { count, error } = await q;
      if (error) sbError(error, "dashboard/occupiedTables");
      return count ?? 0;
    })(),
    (async () => {
      let q = sb.from("Stock").select("*, ingredient:Ingredient(name, unit, threshold), location:Location(name)");
      if (locationId) q = q.eq("locationId", locationId);
      const { data, error } = await q;
      if (error) sbError(error, "dashboard/stock");
      return data ?? [];
    })(),
    (async () => {
      let q = sb
        .from("Order")
        .select("id, number, status, total, tableLabel, source, createdAt")
        .gte("createdAt", todayIso)
        .order("createdAt", { ascending: false })
        .limit(6);
      if (locationId) q = q.eq("locationId", locationId);
      const { data, error } = await q;
      if (error) sbError(error, "dashboard/recentOrders");
      return data ?? [];
    })(),
  ]);

  const useMock = req.nextUrl.searchParams.get("mock") === "true" || process.env.DASHBOARD_USE_MOCK_DATA !== "false";
  const isDevMock = useMock || (ordersToday === 0 && process.env.NODE_ENV !== "production");

  /* ---------- Real DB calculations ---------- */
  const realRevenue = revenueRows.reduce((sum: number, o: { total: number }) => sum + Number(o.total), 0);
  const realAvgTicket = ordersToday > 0 ? realRevenue / ordersToday : 0;
  const thisHourOrders = orders.filter((o: { createdAt: string }) => new Date(o.createdAt).getHours() === currentHour).length;
  const realHourDelta =
    lastWeekSameHourCount > 0
      ? Math.round(((thisHourOrders - lastWeekSameHourCount) / lastWeekSameHourCount) * 100)
      : thisHourOrders > 0
        ? 100
        : 0;

  const stockRows = stockResult as {
    id: string;
    quantity: number;
    ingredient: { name: string; unit: string; threshold: number };
    location: { name: string } | null;
  }[];
  const multiBranch = !locationId && new Set(stockRows.map((s) => s.location?.name)).size > 1;
  const allLowStock = stockRows
    .filter((s) => s.quantity <= s.ingredient.threshold)
    .map((s) => ({
      id: s.id,
      name: s.ingredient.name,
      quantity: s.quantity,
      unit: s.ingredient.unit,
      threshold: s.ingredient.threshold,
      branch: s.location?.name ?? null,
    }))
    .sort((a, b) => a.quantity / a.threshold - b.quantity / b.threshold);
  const lowStock = allLowStock.slice(0, 6);

  const activeOrderRows = activeOrders as { id: string; number: string; status: string; createdAt: string }[];
  const minsSince = (iso: string) => Math.floor((now.getTime() - new Date(iso).getTime()) / 60000);

  const SERVICE_OPEN_HOUR = 11;
  const SERVICE_CLOSE_HOUR = 23;
  const OPERATING_DAY_MINS = (SERVICE_CLOSE_HOUR - SERVICE_OPEN_HOUR) * 60;

  const isStale = (o: { createdAt: string }) =>
    new Date(o.createdAt) < todayStart || minsSince(o.createdAt) > OPERATING_DAY_MINS;

  const staleOrders = activeOrderRows.filter(isStale);
  const todaysActive = activeOrderRows.filter((o) => !isStale(o));

  const countByStatus = (status: string) => todaysActive.filter((o) => o.status === status).length;
  const statusBreakdown = {
    pending: countByStatus("pending") + countByStatus("confirmed"),
    preparing: countByStatus("preparing"),
    ready: countByStatus("ready"),
  };
  const pendingOrders = todaysActive.length;

  const inKitchen = todaysActive.filter((o) => o.status !== "ready");
  const DELAY_MINS = 15;
  const READY_HOLD_MINS = 10;

  const delayedOrders = inKitchen.filter((o) => minsSince(o.createdAt) > DELAY_MINS);
  const longestWait = inKitchen.reduce((max, o) => Math.max(max, minsSince(o.createdAt)), 0);
  const heldReady = todaysActive.filter(
    (o) => o.status === "ready" && minsSince(o.createdAt) > READY_HOLD_MINS
  );

  type AttentionItem = {
    id: string;
    severity: "critical" | "warning";
    count: number;
    title: string;
    detail?: string;
    href: string;
    dismissible?: boolean;
  };
  const attention: AttentionItem[] = [];

  if (delayedOrders.length > 0) {
    attention.push({
      id: "delayed-orders",
      severity: delayedOrders.length >= 3 ? "critical" : "warning",
      count: delayedOrders.length,
      title: "Delayed orders",
      detail: `Over ${DELAY_MINS} min · longest ${longestWait} min`,
      href: "/orders",
    });
  }

  if (heldReady.length > 0) {
    attention.push({
      id: "held-ready",
      severity: "warning",
      count: heldReady.length,
      title: "Ready, not served",
      detail: `Waiting over ${READY_HOLD_MINS} min at the pass`,
      href: "/orders",
    });
  }

  const criticalStock = allLowStock.filter((s) => s.quantity <= s.threshold / 2);
  const warningStock = allLowStock.filter((s) => s.quantity > s.threshold / 2);
  const nameList = (items: { name: string; branch: string | null }[]) => {
    const labels = items.map((i) => (multiBranch && i.branch ? `${i.name} (${i.branch})` : i.name));
    return labels.length > 3 ? `${labels.slice(0, 3).join(" · ")} +${labels.length - 3} more` : labels.join(" · ");
  };

  if (criticalStock.length > 0) {
    attention.push({
      id: "critical-stock",
      severity: "critical",
      count: criticalStock.length,
      title: "Critical stock",
      detail: nameList(criticalStock),
      href: "/inventory?filter=low",
    });
  }

  if (warningStock.length > 0) {
    attention.push({
      id: "low-stock",
      severity: "warning",
      count: warningStock.length,
      title: "Low stock",
      detail: nameList(warningStock),
      href: "/inventory?filter=low",
    });
  }

  if (staleOrders.length > 0) {
    attention.push({
      id: "stale-orders",
      severity: "warning",
      count: staleOrders.length,
      title: "Unclosed tickets",
      detail: `Open longer than a full service (${OPERATING_DAY_MINS / 60}h) — needs cleanup`,
      href: "/orders",
    });
  }

  const alertRows = alertsResult as { id: string; title: string; message: string; severity: string; isRead: boolean }[];
  for (const a of alertRows.filter((r) => !r.isRead)) {
    attention.push({
      id: a.id,
      severity: a.severity === "critical" ? "critical" : "warning",
      count: 1,
      title: a.title,
      detail: a.message,
      href: a.title.toLowerCase().includes("stock") ? "/inventory?filter=low" : "/orders",
      dismissible: true,
    });
  }

  attention.sort((a, b) => (a.severity === b.severity ? b.count - a.count : a.severity === "critical" ? -1 : 1));

  /* ---------- Realistic development mock dataset ---------- */
  const MOCK_HOURLY_PATTERN: Record<number, number> = {
    11: 11,
    12: 7,
    13: 5,
    14: 6,
    15: 4,
    16: 6,
    17: 7,
    18: 8,
    19: 7,
    20: 9,
    21: 7,
    22: 5,
    23: 3,
  };

  const MOCK_RECENT_ORDERS = [
    { id: "ord-38", number: "ORD-0038", source: "zomato", createdAt: new Date(Date.now() - 3 * 60000).toISOString(), total: 784, status: "pending", tableLabel: null },
    { id: "ord-32", number: "ORD-0032", source: "swiggy", createdAt: new Date(Date.now() - 10 * 60000).toISOString(), total: 2040, status: "cancelled", tableLabel: null },
    { id: "ord-47", number: "ORD-0047", source: "dine_in", createdAt: new Date(Date.now() - 12 * 60000).toISOString(), total: 664, status: "ready", tableLabel: "T-04" },
    { id: "ord-30", number: "ORD-0030", source: "qr", createdAt: new Date(Date.now() - 14 * 60000).toISOString(), total: 1920, status: "pending", tableLabel: "T-02" },
    { id: "ord-19", number: "ORD-0019", source: "takeaway", createdAt: new Date(Date.now() - 15 * 60000).toISOString(), total: 2100, status: "preparing", tableLabel: null },
  ];

  const MOCK_LOW_STOCK = [
    { id: "stk-1", name: "Paneer", quantity: 2.1, unit: "kg", threshold: 5, branch: "Main Branch" },
    { id: "stk-2", name: "Paneer", quantity: 2.1, unit: "kg", threshold: 5, branch: "Patio" },
    { id: "stk-3", name: "Rice", quantity: 14.2, unit: "kg", threshold: 20, branch: "Main Branch" },
    { id: "stk-4", name: "Chicken", quantity: 7.4, unit: "kg", threshold: 10, branch: "Main Branch" },
    { id: "stk-5", name: "Chicken", quantity: 7.9, unit: "kg", threshold: 10, branch: "Patio" },
  ];

  const MOCK_ATTENTION: AttentionItem[] = [
    { id: "crit-stock-mock", severity: "critical", count: 2, title: "Critical Stock", detail: "Paneer (Main Branch) · Paneer (Patio)", href: "/inventory?filter=low" },
    { id: "low-stock-mock", severity: "warning", count: 4, title: "Low Stock", detail: "Rice · Chicken · Chicken +1 more", href: "/inventory?filter=low" },
    { id: "del-orders-mock", severity: "warning", count: 1, title: "Delayed Orders", detail: "Over 15 min · longest 18 min", href: "/orders" },
  ];

  const finalKpis = isDevMock
    ? {
        ordersToday: 50,
        revenueToday: 49050,
        revenueTarget: 60000,
        avgTicket: 981,
        hourDelta: 8.4,
        pendingOrders: 31,
        occupiedTables: 3,
        lowStockCount: 5,
        delayedOrders: 1,
        longestWait: 18,
        staleOrders: 0,
      }
    : {
        ordersToday,
        revenueToday: realRevenue,
        revenueTarget: 60000,
        avgTicket: Math.round(realAvgTicket),
        hourDelta: realHourDelta,
        pendingOrders,
        occupiedTables,
        lowStockCount: lowStock.length,
        delayedOrders: delayedOrders.length,
        longestWait,
        staleOrders: staleOrders.length,
      };

  const finalStatusBreakdown = isDevMock
    ? { pending: 13, preparing: 10, ready: 8 }
    : statusBreakdown;

  const finalHourlyBuckets = Array.from({ length: 24 }, (_, h) => {
    const realCount = orders.filter((o: { createdAt: string }) => new Date(o.createdAt).getHours() === h).length;
    const realRev = orders
      .filter((o: { createdAt: string }) => new Date(o.createdAt).getHours() === h)
      .reduce((s: number, o: { total: number }) => s + Number(o.total), 0);

    const count = isDevMock ? (MOCK_HOURLY_PATTERN[h] ?? 0) : realCount;
    const revenue = isDevMock ? count * 981 : Math.round(realRev);

    return { hour: h, count, revenue };
  });

  const finalRecentOrders = isDevMock ? MOCK_RECENT_ORDERS : recentOrdersResult;
  const finalLowStock = isDevMock ? MOCK_LOW_STOCK : lowStock;
  const finalAttention = isDevMock ? MOCK_ATTENTION : attention;

  return NextResponse.json({
    kpis: finalKpis,
    multiBranch: isDevMock ? true : multiBranch,
    statusBreakdown: finalStatusBreakdown,
    attention: finalAttention,
    hourlyBuckets: finalHourlyBuckets,
    alerts: alertsResult,
    lowStock: finalLowStock,
    recentOrders: finalRecentOrders,
    sparklines: {
      orders: finalHourlyBuckets.slice(11, 19).map((b) => b.count),
      revenue: finalHourlyBuckets.slice(11, 19).map((b) => b.revenue),
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
