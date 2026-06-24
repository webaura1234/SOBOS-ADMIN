import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getRestaurantId } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const status = req.nextUrl.searchParams.get("status");
  const source = req.nextUrl.searchParams.get("source");
  const period = req.nextUrl.searchParams.get("period");
  const tableFilter = req.nextUrl.searchParams.get("table");
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const id = req.nextUrl.searchParams.get("id");

  // KDS station management data: stations + menu items to assign.
  if (req.nextUrl.searchParams.get("stations") === "1") {
    const restaurantId = await getRestaurantId();
    const [stations, items] = await Promise.all([
      prisma.kdsStation.findMany({ where: { restaurantId }, orderBy: { createdAt: "asc" } }),
      prisma.menuItem.findMany({ where: { isDeleted: false }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ stations, items });
  }

  if (id) {
    const order = await prisma.order.findUnique({
      where: { id },
      include: { items: true, refunds: true },
    });
    if (!order) return NextResponse.json({ error: "Order not found" }, { status: 404 });
    return NextResponse.json(order);
  }

  const createdAt: { gte?: Date } = {};
  if (period === "today") {
    const start = new Date();
    start.setHours(0, 0, 0, 0);
    createdAt.gte = start;
  } else if (period === "week") {
    const start = new Date();
    start.setDate(start.getDate() - 7);
    createdAt.gte = start;
  }

  const orders = await prisma.order.findMany({
    where: {
      ...(locationId && { locationId }),
      ...(status && { status }),
      ...(source && { source }),
      ...(Object.keys(createdAt).length && { createdAt }),
      ...(tableFilter === "with_table" && { tableLabel: { not: null } }),
      ...(tableFilter === "no_table" && { tableLabel: null }),
      ...(search && { OR: [{ number: { contains: search } }, { tableLabel: { contains: search } }] }),
    },
    include: { items: true, _count: { select: { items: true } } },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json(orders);
}

async function loadOrderControls(restaurantId: string) {
  const cfg = await prisma.adminConfig.findUnique({ where: { restaurantId_scope_key: { restaurantId, scope: "orders", key: "orderControls" } } });
  try { return cfg ? (JSON.parse(cfg.value) as Record<string, unknown>) : {}; } catch { return {}; }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();

    // ── KDS station management ──
    if (body.type === "station") {
      if (body.id) {
        const station = await prisma.kdsStation.update({ where: { id: body.id }, data: { ...(body.name !== undefined && { name: body.name }), ...(body.itemIds !== undefined && { itemIds: JSON.stringify(body.itemIds) }) } });
        await audit("update", "kds_station", station.id, body);
        return NextResponse.json(station);
      }
      const station = await prisma.kdsStation.create({ data: { restaurantId, name: body.name, itemIds: JSON.stringify(body.itemIds ?? []) } });
      await audit("create", "kds_station", station.id, station);
      return NextResponse.json(station, { status: 201 });
    }

    const { id, status, cancelReason } = body;
    const existing = await prisma.order.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Order not found" }, { status: 404 });

    if (status === "cancelled") {
      if (!String(cancelReason ?? "").trim()) return NextResponse.json({ error: "Cancellation reason is required" }, { status: 400 });
      // Enforce the modification policy: cancelling a Preparing order is gated by config (manager-only action).
      if (existing.status === "preparing") {
        const controls = await loadOrderControls(restaurantId);
        if (controls.allowCancelPreparing === false) {
          return NextResponse.json({ error: "Policy does not allow cancelling orders once Preparing" }, { status: 403 });
        }
      }
    }

    const order = await prisma.order.update({ where: { id }, data: { status }, include: { items: true } });
    if (status === "cancelled") {
      await prisma.orderItem.updateMany({ where: { orderId: id }, data: { status: "cancelled" } });
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
      await prisma.kdsStation.delete({ where: { id: stationId } });
      await audit("delete", "kds_station", stationId);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Nothing to delete" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
