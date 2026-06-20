import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getRestaurantId } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "list";

  if (tab === "attendance") {
    const attendance = await prisma.attendance.findMany({
      include: { user: { select: { name: true } } },
      orderBy: { clockIn: "desc" },
      take: 50,
    });
    return NextResponse.json({ attendance });
  }

  if (tab === "schedule") {
    const schedule = await prisma.scheduleSlot.findMany({ orderBy: [{ dayOfWeek: "asc" }] });
    return NextResponse.json({ schedule });
  }

  const staff = await prisma.user.findMany({
    include: {
      locationRoles: { include: { role: true, location: { select: { name: true } } } },
      attendance: { orderBy: { clockIn: "desc" }, take: 1 },
    },
    orderBy: { name: "asc" },
  });
  return NextResponse.json({ staff });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();
    const user = await prisma.user.create({
      data: {
        restaurantId,
        name: body.name,
        phone: body.phone,
        email: body.email ?? null,
        status: "active",
        inviteStatus: "pending",
      },
    });
    if (body.roleId) {
      await prisma.userLocationRole.create({
        data: { userId: user.id, roleId: body.roleId, locationId: body.locationId ?? null },
      });
    }
    await audit("create", "user", user.id, user);
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, ...data } = await req.json();
    const user = await prisma.user.update({ where: { id }, data });
    await audit("update", "user", id, data);
    return NextResponse.json(user);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.user.update({ where: { id }, data: { status: "inactive" } });
    await audit("delete", "user", id, { deactivated: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
