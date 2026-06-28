import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit, getRestaurantId } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const status = req.nextUrl.searchParams.get("status");
  const source = req.nextUrl.searchParams.get("source");
  const period = req.nextUrl.searchParams.get("period");
  const tableFilter = req.nextUrl.searchParams.get("table");
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const id = req.nextUrl.searchParams.get("id");
  const sb = db();

  if (req.nextUrl.searchParams.get("stations") === "1") {
    const restaurantId = await getRestaurantId();
    const [stationsResult, itemsResult] = await Promise.all([
      sb.from("KdsStation").select("*").eq("restaurantId", restaurantId).order("createdAt", { ascending: true }),
      sb.from("MenuItem").select("id, name").eq("isDeleted", false).order("name", { ascending: true }),
    ]);
    if (stationsResult.error) sbError(stationsResult.error, "orders/stations");
    if (itemsResult.error) sbError(itemsResult.error, "orders/items");
    return NextResponse.json({ stations: stationsResult.data ?? [], items: itemsResult.data ?? [] });
  }

  if (id) {
    const { data: order, error } = await sb
      .from("Order")
      .select("*, items:OrderItem(*), refunds:Refund(*)")
      .eq("id", id)
      .maybeSingle();
    if (error) sbError(error, "orders/getById");
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(order);
  }

  let q = sb.from("Order").select("*, items:OrderItem(*)").order("createdAt", { ascending: false }).limit(100);
  if (locationId) q = q.eq("locationId", locationId);
  if (status) q = q.eq("status", status);
  if (source) q = q.eq("source", source);
  if (period === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    q = q.gte("createdAt", start.toISOString());
  } else if (period === "week") {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    q = q.gte("createdAt", start.toISOString());
  }
  if (tableFilter === "with_table") q = q.not("tableLabel", "is", null);
  if (tableFilter === "no_table") q = q.is("tableLabel", null);
  if (search) q = q.or(`number.ilike.%${search}%,tableLabel.ilike.%${search}%`);

  const { data: orders, error } = await q;
  if (error) sbError(error, "orders/GET");

  const withCounts = (orders ?? []).map((o) => ({
    ...o,
    _count: { items: (o.items as unknown[] | null)?.length ?? 0 },
  }));

  return NextResponse.json(withCounts);
}

async function loadOrderControls(restaurantId: string) {
  const { data: cfg, error } = await db()
    .from("AdminConfig")
    .select("value")
    .eq("restaurantId", restaurantId)
    .eq("scope", "orders")
    .eq("key", "orderControls")
    .maybeSingle();
  if (error) sbError(error, "orders/loadOrderControls");
  try {
    return cfg ? (JSON.parse(cfg.value as string) as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();
    const sb = db();

    if (body.type === "station") {
      if (body.id) {
        const updates: Record<string, unknown> = {};
        if (body.name !== undefined) updates.name = body.name;
        if (body.itemIds !== undefined) updates.itemIds = JSON.stringify(body.itemIds);
        const { data: station, error } = await sb.from("KdsStation").update(updates).eq("id", body.id).select().single();
        if (error) sbError(error, "orders/updateStation");
        await audit("update", "kds_station", station.id, body);
        return NextResponse.json(station);
      }
      const { data: station, error } = await sb
        .from("KdsStation")
        .insert({ id: crypto.randomUUID(), restaurantId, name: body.name, itemIds: JSON.stringify(body.itemIds ?? []) })
        .select()
        .single();
      if (error) sbError(error, "orders/createStation");
      await audit("create", "kds_station", station.id, station);
      return NextResponse.json(station, { status: 201 });
    }

    const { id, status, cancelReason } = body;
    const { data: existing, error: findErr } = await sb.from("Order").select("*").eq("id", id).maybeSingle();
    if (findErr) sbError(findErr, "orders/find");
    if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (status === "cancelled") {
      if (!String(cancelReason ?? "").trim()) return NextResponse.json({ error: "Cancellation reason is required" }, { status: 400 });
      if (existing.status === "preparing") {
        const controls = await loadOrderControls(restaurantId);
        if (controls.allowCancelPreparing === false) {
          return NextResponse.json({ error: "Policy does not allow cancelling orders once Preparing" }, { status: 403 });
        }
      }
    }

    const { data: order, error: updateErr } = await sb
      .from("Order")
      .update({ status, updatedAt: new Date().toISOString() })
      .eq("id", id)
      .select("*, items:OrderItem(*)")
      .single();
    if (updateErr) sbError(updateErr, "orders/update");

    if (status === "cancelled") {
      const { error: itemErr } = await sb.from("OrderItem").update({ status: "cancelled" }).eq("orderId", id);
      if (itemErr) sbError(itemErr, "orders/cancelItems");
    }

    await audit("update", "order", id, { from: existing.status, to: status, cancelReason });
    return NextResponse.json(order);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const stationId = req.nextUrl.searchParams.get("stationId");
    if (stationId) {
      const { error } = await db().from("KdsStation").delete().eq("id", stationId);
      if (error) sbError(error, "orders/deleteStation");
      await audit("delete", "kds_station", stationId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Nothing to delete" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
