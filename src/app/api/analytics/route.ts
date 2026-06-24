import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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
  if (mode === "year") return { start: new Date(start.getTime() - 365 * DAY), end: new Date(end.getTime() - 365 * DAY) };
  return { start: new Date(start.getTime() - span), end: new Date(start.getTime()) };
}

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "margin";
  const locationId = req.nextUrl.searchParams.get("locationId");
  const compare = req.nextUrl.searchParams.get("compare") ?? "none";
  const { start, end } = rangeFromParams(req);
  const locWhere = locationId ? { locationId } : {};
  const dateWhere = { createdAt: { gte: start, lte: end } };

  if (tab === "waste") {
    const wastage = await prisma.wastageLog.findMany({ where: { ...locWhere, ...dateWhere }, include: { ingredient: true }, orderBy: { createdAt: "desc" } });
    const byReason = wastage.reduce<Record<string, number>>((acc, w) => { acc[w.reason] = (acc[w.reason] ?? 0) + w.estCost; return acc; }, {});
    return NextResponse.json({ wastage, byReason });
  }

  if (tab === "margin") {
    const items = await prisma.menuItem.findMany({ where: { isDeleted: false }, select: { id: true, name: true, basePrice: true, recipeCost: true, grossMargin: true, unitsSold: true }, orderBy: { grossMargin: "asc" } });
    return NextResponse.json({ items });
  }

  if (tab === "top-selling") {
    const items = await prisma.menuItem.findMany({ where: { isDeleted: false }, orderBy: { unitsSold: "desc" }, take: 20 });
    return NextResponse.json({ items });
  }

  if (tab === "payments") {
    const breakdown = await prisma.order.groupBy({ by: ["source"], _count: true, _sum: { total: true }, where: { ...locWhere, ...dateWhere } });
    let comparison = null;
    if (compare !== "none") {
      const prev = priorRange(start, end, compare);
      const prevAgg = await prisma.order.aggregate({ _sum: { total: true }, _count: true, where: { ...locWhere, createdAt: { gte: prev.start, lte: prev.end } } });
      const curAgg = await prisma.order.aggregate({ _sum: { total: true }, _count: true, where: { ...locWhere, ...dateWhere } });
      comparison = { current: { revenue: curAgg._sum.total ?? 0, orders: curAgg._count }, previous: { revenue: prevAgg._sum.total ?? 0, orders: prevAgg._count } };
    }
    return NextResponse.json({ paymentBreakdown: breakdown, comparison });
  }

  if (tab === "customer-behavior") {
    const customers = await prisma.customer.findMany();
    const now = Date.now();
    const repeat = customers.filter((c) => c.visitCount > 1).length;
    const totalVisits = customers.reduce((s, c) => s + c.visitCount, 0);
    const totalSpend = customers.reduce((s, c) => s + c.totalSpend, 0);
    const distribution = { new: 0, returning: 0, lapsed: 0 };
    for (const c of customers) {
      const since = c.lastVisit ? now - new Date(c.lastVisit).getTime() : Infinity;
      if (c.visitCount <= 1) distribution.new += 1;
      else if (since < 60 * DAY) distribution.returning += 1;
      else distribution.lapsed += 1;
    }
    const topCustomers = [...customers].sort((a, b) => b.totalSpend - a.totalSpend).slice(0, 10).map((c) => ({ id: c.id, name: c.name, totalSpend: c.totalSpend, visitCount: c.visitCount }));
    return NextResponse.json({ behavior: { unique: customers.length, repeatRate: customers.length ? Math.round((repeat / customers.length) * 100) : 0, avgSpendPerVisit: totalVisits ? Math.round(totalSpend / totalVisits) : 0, distribution, topCustomers } });
  }

  if (tab === "heatmap") {
    const orders = await prisma.order.findMany({ where: { ...locWhere, ...dateWhere }, select: { createdAt: true, total: true } });
    // 7 days × 24 hours grid of counts + revenue.
    const grid = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => ({ count: 0, revenue: 0 })));
    for (const o of orders) { const d = new Date(o.createdAt); const cell = grid[d.getDay()][d.getHours()]; cell.count += 1; cell.revenue += o.total; }
    return NextResponse.json({ heatmap: grid });
  }

  if (tab === "inventory-trend") {
    const since = new Date(Date.now() - 14 * DAY);
    const [recipeLinks, sold, stocks, ingredients] = await Promise.all([
      prisma.recipeIngredient.findMany({ select: { ingredientId: true, quantity: true, recipe: { select: { itemId: true } } } }),
      prisma.orderItem.groupBy({ by: ["itemId"], _sum: { quantity: true }, where: { order: { createdAt: { gte: since } }, itemId: { not: null } } }),
      prisma.stock.groupBy({ by: ["ingredientId"], _sum: { quantity: true } }),
      prisma.ingredient.findMany(),
    ]);
    const soldByItem = new Map(sold.map((s) => [s.itemId, (s._sum.quantity ?? 0) / 14]));
    const usage: Record<string, number> = {};
    for (const l of recipeLinks) usage[l.ingredientId] = (usage[l.ingredientId] ?? 0) + l.quantity * (soldByItem.get(l.recipe.itemId) ?? 0);
    const stockMap = new Map(stocks.map((s) => [s.ingredientId, s._sum.quantity ?? 0]));
    const rows = ingredients.map((ing) => {
      const perDay = usage[ing.id] ?? 0; const cur = stockMap.get(ing.id) ?? 0;
      return { id: ing.id, name: ing.name, unit: ing.unit, dailyUsage: Math.round(perDay * 100) / 100, currentStock: cur, daysToDepletion: perDay > 0.01 ? Math.round(cur / perDay) : null, reorder: cur <= ing.threshold };
    }).sort((a, b) => (a.daysToDepletion ?? 9999) - (b.daysToDepletion ?? 9999));
    return NextResponse.json({ trend: rows });
  }

  if (tab === "reviews") {
    const restaurantId = await getRestaurantId();
    const reviews = await prisma.review.findMany({ where: { restaurantId }, orderBy: { reviewedAt: "desc" }, take: 50 });
    const avg = reviews.length ? Math.round((reviews.reduce((s, r) => s + r.rating, 0) / reviews.length) * 10) / 10 : 0;
    const dist = [5, 4, 3, 2, 1].map((star) => ({ star, count: reviews.filter((r) => r.rating === star).length }));
    return NextResponse.json({ reviews: { avg, total: reviews.length, distribution: dist, recent: reviews.slice(0, 20) } });
  }

  return NextResponse.json({ error: "unknown tab" }, { status: 400 });
}
