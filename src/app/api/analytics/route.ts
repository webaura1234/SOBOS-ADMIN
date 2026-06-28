import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { getRestaurantId } from "@/lib/api-helpers";

const DAY = 86400000;

function rangeFromParams(req: NextRequest) {
  const from = req.nextUrl.searchParams.get("from");
  const to = req.nextUrl.searchParams.get("to");
  const now = new Date();
  const end = to ? new Date(to + "T23:59:59") : now;
  const start = from ? new Date(from) : new Date(now.getTime() - 30 * DAY);
  return { start, end };
}

function priorRange(start: Date, end: Date, mode: string) {
  const span = end.getTime() - start.getTime();
  if (mode === "year")
    return { start: new Date(start.getTime() - 365 * DAY), end: new Date(end.getTime() - 365 * DAY) };
  return { start: new Date(start.getTime() - span), end: new Date(start.getTime()) };
}

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "margin";
  const locationId = req.nextUrl.searchParams.get("locationId");
  const compare = req.nextUrl.searchParams.get("compare") ?? "none";
  const { start, end } = rangeFromParams(req);
  const sb = db();

  if (tab === "waste") {
    let q = sb
      .from("WastageLog")
      .select("*, ingredient:Ingredient(*)")
      .gte("createdAt", start.toISOString())
      .lte("createdAt", end.toISOString())
      .order("createdAt", { ascending: false });
    if (locationId) q = q.eq("locationId", locationId);
    const { data: wastage, error } = await q;
    if (error) sbError(error, "analytics/waste");
    const byReason = (wastage ?? []).reduce<Record<string, number>>((acc, w) => {
      acc[w.reason as string] = (acc[w.reason as string] ?? 0) + Number(w.estCost);
      return acc;
    }, {});
    return NextResponse.json({ wastage, byReason });
  }

  if (tab === "margin") {
    const { data: items, error } = await sb
      .from("MenuItem")
      .select("id, name, basePrice, recipeCost, grossMargin, unitsSold")
      .eq("isDeleted", false)
      .order("grossMargin", { ascending: true });
    if (error) sbError(error, "analytics/margin");
    return NextResponse.json({ items });
  }

  if (tab === "top-selling") {
    const { data: items, error } = await sb
      .from("MenuItem")
      .select("*")
      .eq("isDeleted", false)
      .order("unitsSold", { ascending: false })
      .limit(20);
    if (error) sbError(error, "analytics/top-selling");
    return NextResponse.json({ items });
  }

  if (tab === "payments") {
    let q = sb
      .from("Order")
      .select("source, total")
      .gte("createdAt", start.toISOString())
      .lte("createdAt", end.toISOString());
    if (locationId) q = q.eq("locationId", locationId);
    const { data: orders, error } = await q;
    if (error) sbError(error, "analytics/payments");

    const breakdownMap = (orders ?? []).reduce<
      Record<string, { source: string; _count: number; _sum: { total: number } }>
    >((acc, o) => {
      const row = acc[o.source as string] ?? { source: o.source as string, _count: 0, _sum: { total: 0 } };
      row._count += 1;
      row._sum.total += Number(o.total);
      acc[o.source as string] = row;
      return acc;
    }, {});
    const breakdown = Object.values(breakdownMap);

    let comparison = null;
    if (compare !== "none") {
      const prev = priorRange(start, end, compare);
      let curQ = sb
        .from("Order")
        .select("total")
        .gte("createdAt", start.toISOString())
        .lte("createdAt", end.toISOString());
      let prevQ = sb
        .from("Order")
        .select("total")
        .gte("createdAt", prev.start.toISOString())
        .lte("createdAt", prev.end.toISOString());
      if (locationId) {
        curQ = curQ.eq("locationId", locationId);
        prevQ = prevQ.eq("locationId", locationId);
      }
      const [curResult, prevResult] = await Promise.all([curQ, prevQ]);
      if (curResult.error) sbError(curResult.error, "analytics/payments/current");
      if (prevResult.error) sbError(prevResult.error, "analytics/payments/previous");
      const curOrders = curResult.data ?? [];
      const prevOrders = prevResult.data ?? [];
      comparison = {
        current: { revenue: curOrders.reduce((s, o) => s + Number(o.total), 0), orders: curOrders.length },
        previous: { revenue: prevOrders.reduce((s, o) => s + Number(o.total), 0), orders: prevOrders.length },
      };
    }
    return NextResponse.json({ paymentBreakdown: breakdown, comparison });
  }

  if (tab === "customer-behavior") {
    const { data: customers, error } = await sb.from("Customer").select("*");
    if (error) sbError(error, "analytics/customers");
    const rows = customers ?? [];
    const now = Date.now();
    const repeat = rows.filter((c) => c.visitCount > 1).length;
    const totalVisits = rows.reduce((s, c) => s + Number(c.visitCount), 0);
    const totalSpend = rows.reduce((s, c) => s + Number(c.totalSpend), 0);
    const distribution = { new: 0, returning: 0, lapsed: 0 };
    for (const c of rows) {
      const since = c.lastVisit ? now - new Date(c.lastVisit as string).getTime() : Infinity;
      if (Number(c.visitCount) <= 1) distribution.new += 1;
      else if (since < 60 * DAY) distribution.returning += 1;
      else distribution.lapsed += 1;
    }
    const topCustomers = [...rows]
      .sort((a, b) => Number(b.totalSpend) - Number(a.totalSpend))
      .slice(0, 10)
      .map((c) => ({ id: c.id, name: c.name, totalSpend: c.totalSpend, visitCount: c.visitCount }));
    return NextResponse.json({
      behavior: {
        unique: rows.length,
        repeatRate: rows.length ? Math.round((repeat / rows.length) * 100) : 0,
        avgSpendPerVisit: totalVisits ? Math.round(totalSpend / totalVisits) : 0,
        distribution,
        topCustomers,
      },
    });
  }

  if (tab === "heatmap") {
    let q = sb
      .from("Order")
      .select("createdAt, total")
      .gte("createdAt", start.toISOString())
      .lte("createdAt", end.toISOString());
    if (locationId) q = q.eq("locationId", locationId);
    const { data: orders, error } = await q;
    if (error) sbError(error, "analytics/heatmap");
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ count: 0, revenue: 0 })));
    for (const o of orders ?? []) {
      const d = new Date(o.createdAt as string);
      const cell = grid[d.getDay()][d.getHours()];
      cell.count += 1;
      cell.revenue += Number(o.total);
    }
    return NextResponse.json({ heatmap: grid });
  }

  if (tab === "inventory-trend") {
    const since = new Date(Date.now() - 14 * DAY);
    const [linksResult, soldResult, stocksResult, ingredientsResult] = await Promise.all([
      sb.from("RecipeIngredient").select("ingredientId, quantity, recipe:Recipe(itemId)"),
      sb
        .from("OrderItem")
        .select("itemId, quantity, order:Order!inner(createdAt)")
        .gte("order.createdAt", since.toISOString())
        .not("itemId", "is", null),
      sb.from("Stock").select("ingredientId, quantity"),
      sb.from("Ingredient").select("*"),
    ]);
    if (linksResult.error) sbError(linksResult.error, "analytics/recipeLinks");
    if (soldResult.error) sbError(soldResult.error, "analytics/sold");
    if (stocksResult.error) sbError(stocksResult.error, "analytics/stocks");
    if (ingredientsResult.error) sbError(ingredientsResult.error, "analytics/ingredients");

    const soldByItem = new Map<string, number>();
    for (const row of soldResult.data ?? []) {
      const itemId = row.itemId as string;
      soldByItem.set(itemId, (soldByItem.get(itemId) ?? 0) + Number(row.quantity));
    }
    for (const [itemId, qty] of soldByItem) soldByItem.set(itemId, qty / 14);

    const usage: Record<string, number> = {};
    for (const l of linksResult.data ?? []) {
      const recipe = l.recipe as unknown as { itemId: string } | null;
      if (!recipe) continue;
      const perDay = soldByItem.get(recipe.itemId) ?? 0;
      usage[l.ingredientId as string] = (usage[l.ingredientId as string] ?? 0) + Number(l.quantity) * perDay;
    }

    const stockMap = new Map<string, number>();
    for (const s of stocksResult.data ?? []) {
      stockMap.set(
        s.ingredientId as string,
        (stockMap.get(s.ingredientId as string) ?? 0) + Number(s.quantity),
      );
    }

    const rows = (ingredientsResult.data ?? [])
      .map((ing) => {
        const perDay = usage[ing.id] ?? 0;
        const cur = stockMap.get(ing.id) ?? 0;
        return {
          id: ing.id,
          name: ing.name,
          unit: ing.unit,
          dailyUsage: Math.round(perDay * 100) / 100,
          currentStock: cur,
          daysToDepletion: perDay > 0.01 ? Math.round(cur / perDay) : null,
          reorder: cur <= Number(ing.threshold),
        };
      })
      .sort((a, b) => (a.daysToDepletion ?? 9999) - (b.daysToDepletion ?? 9999));
    return NextResponse.json({ trend: rows });
  }

  if (tab === "reviews") {
    const restaurantId = await getRestaurantId();
    const { data: reviews, error } = await sb
      .from("Review")
      .select("*")
      .eq("restaurantId", restaurantId)
      .order("reviewedAt", { ascending: false })
      .limit(50);
    if (error) sbError(error, "analytics/reviews");
    const rows = reviews ?? [];
    const avg = rows.length ? Math.round((rows.reduce((s, r) => s + Number(r.rating), 0) / rows.length) * 10) / 10 : 0;
    const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: rows.filter((r) => r.rating === star).length }));
    return NextResponse.json({ reviews: { avg, total: rows.length, distribution: dist, recent: rows.slice(0, 20) } });
  }

  return NextResponse.json({ error: "unknown tab" }, { status: 400 });
}
