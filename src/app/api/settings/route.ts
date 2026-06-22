import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET() {
  const [restaurant, locations, toggles, roles, permissions] = await Promise.all([
    prisma.restaurant.findFirst(),
    prisma.location.findMany({ include: { operatingHours: true } }),
    prisma.featureToggle.findMany({ orderBy: { group: "asc" } }),
    prisma.role.findMany({
      include: {
        permissions: { include: { permission: true } },
        _count: { select: { assignments: true, permissions: true } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.permission.findMany({ orderBy: [{ group: "asc" }, { label: "asc" }] }),
  ]);
  return NextResponse.json({ restaurant, locations, toggles, roles, permissions });
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
      const hours = await prisma.operatingHours.update({ where: { id }, data });
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
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
