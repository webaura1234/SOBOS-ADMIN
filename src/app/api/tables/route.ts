import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const status = req.nextUrl.searchParams.get("status");

  const [tables, sections] = await Promise.all([
    prisma.restaurantTable.findMany({
      where: {
        isDeleted: false,
        ...(locationId && { locationId }),
        ...(status && { status }),
      },
      include: {
        section: { select: { id: true, name: true } },
        sessions: { where: { status: "open" }, take: 1 },
      },
      orderBy: { label: "asc" },
    }),
    prisma.tableSection.findMany({
      where: locationId ? { locationId } : {},
      include: { _count: { select: { tables: true } } },
    }),
  ]);

  return NextResponse.json({ tables, sections });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.type === "section") {
      const section = await prisma.tableSection.create({
        data: { locationId: body.locationId, name: body.name },
        include: { _count: { select: { tables: true } } },
      });
      await audit("create", "table_section", section.id, section);
      return NextResponse.json(section, { status: 201 });
    }
    const table = await prisma.restaurantTable.create({
      data: {
        locationId: body.locationId,
        sectionId: body.sectionId || null,
        label: body.label,
        minCapacity: body.minCapacity ?? 1,
        maxCapacity: body.maxCapacity ?? 4,
        shape: body.shape ?? "square",
        posX: body.posX ?? Math.random() * 300,
        posY: body.posY ?? Math.random() * 200,
        status: "available",
      },
      include: { section: { select: { id: true, name: true } }, sessions: true },
    });
    await audit("create", "restaurant_table", table.id, table);
    return NextResponse.json(table, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, type, ...data } = body;
    if (type === "section") {
      const section = await prisma.tableSection.update({
        where: { id },
        data,
        include: { _count: { select: { tables: true } } },
      });
      await audit("update", "table_section", id, data);
      return NextResponse.json(section);
    }
    const table = await prisma.restaurantTable.update({
      where: { id },
      data,
      include: { section: { select: { id: true, name: true } }, sessions: { where: { status: "open" }, take: 1 } },
    });
    await audit("update", "restaurant_table", id, data);
    return NextResponse.json(table);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const type = req.nextUrl.searchParams.get("type");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (type === "section") {
      await prisma.tableSection.delete({ where: { id } });
    } else {
      await prisma.restaurantTable.update({ where: { id }, data: { isDeleted: true } });
    }
    await audit("delete", type ?? "restaurant_table", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
