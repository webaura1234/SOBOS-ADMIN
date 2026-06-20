import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, calcMargin, getRestaurantId } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const availability = req.nextUrl.searchParams.get("availability");

  const [items, categories] = await Promise.all([
    prisma.menuItem.findMany({
      where: {
        isDeleted: false,
        ...(search && { name: { contains: search } }),
        ...(categoryId && { categoryId }),
        ...(availability && { availability }),
      },
      include: { category: { select: { id: true, name: true } } },
      orderBy: { name: "asc" },
    }),
    prisma.menuCategory.findMany({ orderBy: { displayOrder: "asc" } }),
  ]);

  return NextResponse.json({ items, categories });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();
    const basePrice = Number(body.basePrice) || 0;
    const recipeCost = Number(body.recipeCost) || 0;
    const item = await prisma.menuItem.create({
      data: {
        restaurantId,
        name: body.name,
        description: body.description ?? null,
        categoryId: body.categoryId || null,
        basePrice,
        recipeCost,
        grossMargin: calcMargin(basePrice, recipeCost),
        prepTime: body.prepTime ? Number(body.prepTime) : null,
        availability: body.availability ?? "available",
        taxCategory: body.taxCategory ?? "GST_5",
      },
      include: { category: { select: { id: true, name: true } } },
    });
    await audit("create", "menu_item", item.id, item);
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, ids, bulkAvailability, ...data } = body;

    if (ids && bulkAvailability) {
      await prisma.menuItem.updateMany({
        where: { id: { in: ids } },
        data: { availability: bulkAvailability },
      });
      await audit("bulk_update", "menu_item", ids.join(","), { availability: bulkAvailability });
      return NextResponse.json({ updated: ids.length });
    }

    if (data.basePrice !== undefined || data.recipeCost !== undefined) {
      const existing = await prisma.menuItem.findUnique({ where: { id } });
      const price = data.basePrice ?? existing?.basePrice ?? 0;
      const cost = data.recipeCost ?? existing?.recipeCost ?? 0;
      data.grossMargin = calcMargin(Number(price), Number(cost));
    }

    const item = await prisma.menuItem.update({
      where: { id },
      data,
      include: { category: { select: { id: true, name: true } } },
    });
    await audit("update", "menu_item", id, data);
    return NextResponse.json(item);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const ids = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean);
    if (ids?.length) {
      await prisma.menuItem.updateMany({ where: { id: { in: ids } }, data: { isDeleted: true } });
      await audit("delete", "menu_item", ids.join(","), { softDelete: true });
      return NextResponse.json({ deleted: ids.length });
    }
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.menuItem.update({ where: { id }, data: { isDeleted: true } });
    await audit("delete", "menu_item", id, { softDelete: true });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
