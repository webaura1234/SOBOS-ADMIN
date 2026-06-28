import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const sb = db();

  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const todayIso = todayStart.toISOString();

  const [pendingOrders, preparingOrders, readyOrders, occupiedTables, stockResult, revenueRows] = await Promise.all([
    (async () => {
      let q = sb.from("Order").select("*", { count: "exact", head: true }).in("status", ["pending", "confirmed"]);
      if (locationId) q = q.eq("locationId", locationId);
      const { count, error } = await q;
      if (error) sbError(error, "ops-summary/pending");
      return count ?? 0;
    })(),
    (async () => {
      let q = sb.from("Order").select("*", { count: "exact", head: true }).eq("status", "preparing");
      if (locationId) q = q.eq("locationId", locationId);
      const { count, error } = await q;
      if (error) sbError(error, "ops-summary/preparing");
      return count ?? 0;
    })(),
    (async () => {
      let q = sb.from("Order").select("*", { count: "exact", head: true }).eq("status", "ready");
      if (locationId) q = q.eq("locationId", locationId);
      const { count, error } = await q;
      if (error) sbError(error, "ops-summary/ready");
      return count ?? 0;
    })(),
    (async () => {
      let q = sb.from("RestaurantTable").select("*", { count: "exact", head: true }).eq("isDeleted", false).eq("status", "occupied");
      if (locationId) q = q.eq("locationId", locationId);
      const { count, error } = await q;
      if (error) sbError(error, "ops-summary/occupiedTables");
      return count ?? 0;
    })(),
    (async () => {
      let q = sb.from("Stock").select("*, ingredient:Ingredient(name, threshold)");
      if (locationId) q = q.eq("locationId", locationId);
      const { data, error } = await q;
      if (error) sbError(error, "ops-summary/stock");
      return data ?? [];
    })(),
    (async () => {
      let q = sb
        .from("Order")
        .select("total")
        .gte("createdAt", todayIso)
        .not("status", "eq", "cancelled");
      if (locationId) q = q.eq("locationId", locationId);
      const { data, error } = await q;
      if (error) sbError(error, "ops-summary/revenue");
      return data ?? [];
    })(),
  ]);

  const stockRows = stockResult as { id: string; quantity: number; ingredient: { name: string; threshold: number } }[];
  const lowStock = stockRows.filter((s) => s.quantity <= s.ingredient.threshold);
  const revenueToday = revenueRows.reduce((sum: number, o: { total: number }) => sum + Number(o.total), 0);

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
    revenueToday,
  });
}
