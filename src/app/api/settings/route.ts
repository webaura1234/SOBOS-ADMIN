import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET() {
  const [restaurant, locations, toggles, roles, permissions, users, holidays] = await Promise.all([
    prisma.restaurant.findFirst(),
    prisma.location.findMany({ include: { operatingHours: { orderBy: [{ dayOfWeek: "asc" }, { openTime: "asc" }] } } }),
    prisma.featureToggle.findMany({ orderBy: { group: "asc" } }),
    prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { assignments: true, permissions: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.permission.findMany({ orderBy: [{ group: "asc" }, { label: "asc" }] }),
    prisma.user.findMany({ where: { status: "active" }, include: { locationRoles: { include: { role: { select: { id: true, name: true } }, location: { select: { id: true, name: true } } } } }, orderBy: { name: "asc" } }),
    prisma.holidayClosure.findMany({ orderBy: { date: "asc" } }),
  ]);
  return NextResponse.json({ restaurant, locations, toggles, roles, permissions, users, holidays });
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, id, ...data } = body;

    if (type === "restaurant") {
      const restaurant = await prisma.restaurant.update({ where: { id }, data });
      await audit("update", "restaurant", id, data);
      return NextResponse.json(restaurant);
    }
    if (type === "location") {
      const location = await prisma.location.update({ where: { id }, data, include: { operatingHours: true } });
      await audit("update", "location", id, data);
      return NextResponse.json(location);
    }
    if (type === "toggle") {
      const toggle = await prisma.featureToggle.update({ where: { id }, data: { enabled: data.enabled } });
      await audit("update", "feature_toggle", id, data);
      return NextResponse.json(toggle);
    }
    if (type === "hours") {
      const hours = await prisma.operatingHours.update({ where: { id }, data: { ...(data.openTime !== undefined && { openTime: data.openTime }), ...(data.closeTime !== undefined && { closeTime: data.closeTime }), ...(data.isClosed !== undefined && { isClosed: !!data.isClosed }) } });
      await audit("update", "operating_hours", id, data);
      return NextResponse.json(hours);
    }
    if (type === "role") {
      const permissionIds = Array.isArray(data.permissionIds) ? data.permissionIds : [];
      const role = await prisma.role.update({
        where: { id },
        data: {
          name: data.name,
          description: data.description,
          permissions: {
            deleteMany: {},
            create: permissionIds.map((permissionId: string) => ({ permissionId })),
          },
        },
        include: { permissions: { include: { permission: true } }, _count: { select: { assignments: true, permissions: true } } },
      });
      await audit("update", "role", id, { name: data.name, description: data.description, permissionIds });
      return NextResponse.json(role);
    }
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.type === "location") {
      const location = await prisma.location.create({
        data: {
          restaurantId: body.restaurantId,
          name: body.name,
          address: body.address,
          city: body.city,
          pin: body.pin,
          phone: body.phone ?? null,
          taxSlab: body.taxSlab ?? 5,
        },
      });
      await prisma.operatingHours.createMany({
        data: Array.from({ length: 7 }, (_, dayOfWeek) => ({
          locationId: location.id,
          dayOfWeek,
          openTime: "11:00",
          closeTime: "23:00",
          isClosed: false,
        })),
      });
      await audit("create", "location", location.id, location);
      return NextResponse.json(location, { status: 201 });
    }
    if (body.type === "role") {
      const role = await prisma.role.create({
        data: {
          restaurantId: body.restaurantId,
          name: body.name,
          description: body.description ?? null,
          permissions: {
            create: (Array.isArray(body.permissionIds) ? body.permissionIds : []).map((permissionId: string) => ({ permissionId })),
          },
        },
        include: { permissions: { include: { permission: true } }, _count: { select: { assignments: true, permissions: true } } },
      });
      await audit("create", "role", role.id, role);
      return NextResponse.json(role, { status: 201 });
    }
    if (body.type === "hours_row") {
      // Add a second shift row for split shifts.
      const row = await prisma.operatingHours.create({ data: { locationId: body.locationId, dayOfWeek: Number(body.dayOfWeek), openTime: body.openTime ?? "17:00", closeTime: body.closeTime ?? "23:00", isClosed: false } });
      await audit("create", "operating_hours", row.id, row);
      return NextResponse.json(row, { status: 201 });
    }
    if (body.type === "holiday") {
      const holiday = await prisma.holidayClosure.create({ data: { locationId: body.locationId, date: new Date(body.date), name: body.name } });
      await audit("create", "holiday_closure", holiday.id, holiday);
      return NextResponse.json(holiday, { status: 201 });
    }
    if (body.type === "assignment") {
      const assignment = await prisma.userLocationRole.create({ data: { userId: body.userId, roleId: body.roleId, locationId: body.locationId || null } });
      await audit("create", "user_location_role", assignment.id, assignment);
      return NextResponse.json(assignment, { status: 201 });
    }
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    if (type === "role") {
      const role = await prisma.role.findUnique({ where: { id }, include: { _count: { select: { assignments: true } }, permissions: { include: { permission: true } } } });
      if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });
      if (role._count.assignments > 0) return NextResponse.json({ error: "Reassign staff before deleting this role" }, { status: 400 });
      const isFullAdmin = role.permissions.some((p) => p.permission.resource === "*");
      if (isFullAdmin) {
        const admins = await prisma.role.count({ where: { restaurantId: role.restaurantId, permissions: { some: { permission: { resource: "*" } } } } });
        if (admins <= 1) return NextResponse.json({ error: "Cannot delete the last full-admin role" }, { status: 400 });
      }
      await prisma.role.delete({ where: { id } });
      await audit("delete", "role", id);
      return NextResponse.json({ ok: true });
    }
    if (type === "assignment") { await prisma.userLocationRole.delete({ where: { id } }); await audit("delete", "user_location_role", id); return NextResponse.json({ ok: true }); }
    if (type === "holiday") { await prisma.holidayClosure.delete({ where: { id } }); await audit("delete", "holiday_closure", id); return NextResponse.json({ ok: true }); }
    if (type === "hours_row") { await prisma.operatingHours.delete({ where: { id } }); await audit("delete", "operating_hours", id); return NextResponse.json({ ok: true }); }
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
