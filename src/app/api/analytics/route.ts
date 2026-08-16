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
  const span = Math.max(DAY, end.getTime() - start.getTime());
  if (mode === "year") {
    return { start: new Date(start.getTime() - 365 * DAY), end: new Date(end.getTime() - 365 * DAY) };
  }
  return { start: new Date(start.getTime() - span), end: new Date(start.getTime()) };
}

async function computeComparison(sb: any, start: Date, end: Date, compare: string, locationId: string | null) {
  if (compare === "none") return null;
  const prev = priorRange(start, end, compare);
  let curQ = sb.from("Order").select("total").gte("createdAt", start.toISOString()).lte("createdAt", end.toISOString());
  let prevQ = sb.from("Order").select("total").gte("createdAt", prev.start.toISOString()).lte("createdAt", prev.end.toISOString());
  if (locationId) {
    curQ = curQ.eq("locationId", locationId);
    prevQ = prevQ.eq("locationId", locationId);
  }
  const [curResult, prevResult] = await Promise.all([curQ, prevQ]);
  const curOrders = curResult.data ?? [];
  const prevOrders = prevResult.data ?? [];
  const curRev = curOrders.reduce((s: number, o: any) => s + Number(o.total), 0);
  const prevRev = prevOrders.reduce((s: number, o: any) => s + Number(o.total), 0);
  const revDiff = prevRev > 0 ? Math.round(((curRev - prevRev) / prevRev) * 1000) / 10 : curRev > 0 ? 100 : 0;
  const countDiff = prevOrders.length > 0 ? Math.round(((curOrders.length - prevOrders.length) / prevOrders.length) * 1000) / 10 : curOrders.length > 0 ? 100 : 0;

  return {
    mode: compare,
    current: { revenue: curRev, orders: curOrders.length },
    previous: { revenue: prevRev, orders: prevOrders.length },
    diffPercentage: { revenue: revDiff, orders: countDiff },
  };
}

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "margin";
  const locationId = req.nextUrl.searchParams.get("locationId");
  const compare = req.nextUrl.searchParams.get("compare") ?? "none";
  const { start, end } = rangeFromParams(req);
  const sb = db();

  const comparisonPromise = computeComparison(sb, start, end, compare, locationId);

  if (tab === "waste") {
    let q = sb
      .from("WastageLog")
      .select("*, ingredient:Ingredient(*)")
      .gte("createdAt", start.toISOString())
      .lte("createdAt", end.toISOString())
      .order("createdAt", { ascending: false });
    if (locationId) q = q.eq("locationId", locationId);
    const [wastageRes, comparison] = await Promise.all([q, comparisonPromise]);
    if (wastageRes.error) sbError(wastageRes.error, "analytics/waste");
    const wastage = wastageRes.data ?? [];
    const byReason = wastage.reduce((acc: Record<string, number>, w: any) => {
      acc[w.reason as string] = (acc[w.reason as string] ?? 0) + Number(w.estCost);
      return acc;
    }, {});
    return NextResponse.json({ wastage, byReason, comparison });
  }

  if (tab === "margin" || tab === "top-selling") {
    const [itemsRes, soldRes, comparison] = await Promise.all([
      sb.from("MenuItem").select("id, name, basePrice, recipeCost, grossMargin, unitsSold").eq("isDeleted", false),
      sb
        .from("OrderItem")
        .select("itemId, quantity, order:Order!inner(createdAt, locationId)")
        .gte("order.createdAt", start.toISOString())
        .lte("order.createdAt", end.toISOString())
        .not("itemId", "is", null),
      comparisonPromise,
    ]);
    if (itemsRes.error) sbError(itemsRes.error, "analytics/items");
    if (soldRes.error) sbError(soldRes.error, "analytics/sold");

    const itemsSoldInRange = new Map<string, number>();
    for (const row of soldRes.data ?? []) {
      const order = row.order as unknown as { locationId: string } | null;
      if (locationId && order?.locationId && order.locationId !== locationId) continue;
      const itemId = row.itemId as string;
      itemsSoldInRange.set(itemId, (itemsSoldInRange.get(itemId) ?? 0) + Number(row.quantity));
    }

    const items = (itemsRes.data ?? []).map((item: any) => ({
      ...item,
      unitsSold: itemsSoldInRange.has(item.id) ? itemsSoldInRange.get(item.id)! : 0,
    }));

    if (tab === "margin") {
      items.sort((a: any, b: any) => a.grossMargin - b.grossMargin);
      return NextResponse.json({ items, comparison });
    } else {
      items.sort((a: any, b: any) => b.unitsSold - a.unitsSold);
      return NextResponse.json({ items: items.slice(0, 20), comparison });
    }
  }

  if (tab === "payments") {
    let q = sb
      .from("Order")
      .select("source, total")
      .gte("createdAt", start.toISOString())
      .lte("createdAt", end.toISOString());
    if (locationId) q = q.eq("locationId", locationId);
    const [ordersRes, comparison] = await Promise.all([q, comparisonPromise]);
    if (ordersRes.error) sbError(ordersRes.error, "analytics/payments");

    const breakdownMap = (ordersRes.data ?? []).reduce(
      (acc: Record<string, { source: string; _count: number; _sum: { total: number } }>, o: any) => {
        const row = acc[o.source as string] ?? { source: o.source as string, _count: 0, _sum: { total: 0 } };
        row._count += 1;
        row._sum.total += Number(o.total);
        acc[o.source as string] = row;
        return acc;
      },
      {},
    );
    const breakdown = Object.values(breakdownMap);
    return NextResponse.json({ paymentBreakdown: breakdown, comparison });
  }

  if (tab === "customer-behavior") {
    const [custRes, comparison] = await Promise.all([sb.from("Customer").select("*"), comparisonPromise]);
    if (custRes.error) sbError(custRes.error, "analytics/customers");
    const rows = custRes.data ?? [];
    const now = Date.now();
    const repeat = rows.filter((c: any) => c.visitCount > 1).length;
    const totalVisits = rows.reduce((s: number, c: any) => s + Number(c.visitCount), 0);
    const totalSpend = rows.reduce((s: number, c: any) => s + Number(c.totalSpend), 0);
    const distribution = { new: 0, returning: 0, lapsed: 0 };
    for (const c of rows) {
      const since = c.lastVisit ? now - new Date(c.lastVisit as string).getTime() : Infinity;
      if (Number(c.visitCount) <= 1) distribution.new += 1;
      else if (since < 60 * DAY) distribution.returning += 1;
      else distribution.lapsed += 1;
    }
    const topCustomers = [...rows]
      .sort((a: any, b: any) => Number(b.totalSpend) - Number(a.totalSpend))
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
      comparison,
    });
  }

  if (tab === "heatmap") {
    let q = sb
      .from("Order")
      .select("createdAt, total")
      .gte("createdAt", start.toISOString())
      .lte("createdAt", end.toISOString())
      .not("status", "eq", "cancelled");
    if (locationId) q = q.eq("locationId", locationId);
    const [ordersRes, comparison] = await Promise.all([q, comparisonPromise]);
    if (ordersRes.error) sbError(ordersRes.error, "analytics/heatmap");
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ count: 0, revenue: 0 })));
    for (const o of ordersRes.data ?? []) {
      const d = new Date(o.createdAt as string);
      const cell = grid[d.getDay()]?.[d.getHours()];
      if (!cell) continue;
      cell.count += 1;
      cell.revenue += Number(o.total);
    }
    return NextResponse.json({ heatmap: grid, heatmapMatrix: grid, comparison });
  }

  if (tab === "inventory-trend") {
    const daysSpan = Math.max(1, Math.round((end.getTime() - start.getTime()) / DAY));
    const [linksResult, soldResult, stocksResult, ingredientsResult, comparison] = await Promise.all([
      sb.from("RecipeIngredient").select("ingredientId, quantity, recipe:Recipe(itemId)"),
      sb
        .from("OrderItem")
        .select("itemId, quantity, order:Order!inner(createdAt)")
        .gte("order.createdAt", start.toISOString())
        .lte("order.createdAt", end.toISOString())
        .not("itemId", "is", null),
      sb.from("Stock").select("ingredientId, quantity"),
      sb.from("Ingredient").select("*"),
      comparisonPromise,
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
    for (const [itemId, qty] of soldByItem) soldByItem.set(itemId, qty / daysSpan);

    const usage: Record<string, number> = {};
    for (const l of linksResult.data ?? []) {
      const recipe = (l.recipe ?? (l as { Recipe?: { itemId: string } }).Recipe) as { itemId: string } | null;
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
      .map((ing: any) => {
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
      .sort((a: any, b: any) => (a.daysToDepletion ?? 9999) - (b.daysToDepletion ?? 9999));
    return NextResponse.json({ trend: rows, comparison });
  }

  if (tab === "reviews") {
    const restaurantId = await getRestaurantId();
    let q = sb
      .from("Review")
      .select("*")
      .gte("reviewedAt", start.toISOString())
      .lte("reviewedAt", end.toISOString())
      .order("reviewedAt", { ascending: false })
      .limit(50);
    if (restaurantId) q = q.eq("restaurantId", restaurantId);
    const [reviewsRes, comparison] = await Promise.all([q, comparisonPromise]);
    if (reviewsRes.error) sbError(reviewsRes.error, "analytics/reviews");
    const rows = reviewsRes.data ?? [];
    const avg = rows.length ? Math.round((rows.reduce((s: number, r: any) => s + Number(r.rating), 0) / rows.length) * 10) / 10 : 0;
    const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: rows.filter((r: any) => r.rating === star).length }));
    return NextResponse.json({ reviews: { avg, total: rows.length, distribution: dist, recent: rows.slice(0, 20) }, comparison });
  }

  return NextResponse.json({ error: "unknown tab" }, { status: 400 });
}
