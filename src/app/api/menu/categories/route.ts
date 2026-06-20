import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getRestaurantId } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();
    const cat = await prisma.menuCategory.create({
      data: {
        restaurantId,
        name: body.name,
        displayOrder: body.displayOrder ?? 0,
        dietaryTag: body.dietaryTag ?? null,
      },
    });
    await audit("create", "menu_category", cat.id, cat);
    return NextResponse.json(cat, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, ...data } = await req.json();
    const cat = await prisma.menuCategory.update({ where: { id }, data });
    await audit("update", "menu_category", id, data);
    return NextResponse.json(cat);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.menuCategory.delete({ where: { id } });
    await audit("delete", "menu_category", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
