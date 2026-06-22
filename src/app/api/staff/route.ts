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
    const [schedule, staff, locations] = await Promise.all([
      prisma.scheduleSlot.findMany({ orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
      prisma.user.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.location.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ schedule, staff, locations });
  }

  if (tab === "payroll") {
    const users = await prisma.user.findMany({
      where: { status: "active" },
      include: { attendance: true, locationRoles: { include: { role: true } } },
      orderBy: { name: "asc" },
    });
    const payroll = users.map((user) => {
      const hours = user.attendance.reduce((sum, row) => {
        const out = row.clockOut ?? new Date();
        return sum + Math.max(0, out.getTime() - row.clockIn.getTime()) / 3600000;
      }, 0);
      const roleName = user.locationRoles[0]?.role.name ?? "Staff";
      const hourlyRate = roleName === "Owner" ? 800 : roleName === "Manager" ? 450 : 250;
      return {
        id: user.id,
        name: user.name,
        role: roleName,
        hours: Math.round(hours * 10) / 10,
        hourlyRate,
        grossPay: Math.round(hours * hourlyRate),
      };
    });
    return NextResponse.json({ payroll });
  }

  const [staff, roles, locations] = await Promise.all([
    prisma.user.findMany({
      include: {
        locationRoles: { include: { role: true, location: { select: { name: true } } } },
        attendance: { orderBy: { clockIn: "desc" }, take: 1 },
      },
      orderBy: { name: "asc" },
    }),
    prisma.role.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({ staff, roles, locations });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();
    if (body.type === "schedule") {
      const slot = await prisma.scheduleSlot.create({
        data: {
          userId: body.userId,
          locationId: body.locationId,
          dayOfWeek: Number(body.dayOfWeek),
          startTime: body.startTime,
          endTime: body.endTime,
          status: body.status ?? "published",
        },
      });
      await audit("create", "schedule_slot", slot.id, slot);
      return NextResponse.json(slot, { status: 201 });
    }
    if (body.type === "clock_in") {
      const attendance = await prisma.attendance.create({
        data: { userId: body.userId, clockIn: new Date(), location: body.location ?? null },
      });
      await audit("create", "attendance", attendance.id, attendance);
      return NextResponse.json(attendance, { status: 201 });
    }
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
    const { id, type, ...data } = await req.json();
    if (type === "clock_out") {
      const attendance = await prisma.attendance.update({ where: { id }, data: { clockOut: new Date() } });
      await audit("update", "attendance", id, { clockOut: attendance.clockOut });
      return NextResponse.json(attendance);
    }
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
    const reason = req.nextUrl.searchParams.get("reason") ?? "No reason provided";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.user.update({ where: { id }, data: { status: "inactive" } });
    await audit("delete", "user", id, { deactivated: true, reason });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
