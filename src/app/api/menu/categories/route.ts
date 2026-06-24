import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getRestaurantId } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();
    const maxOrder = await prisma.menuCategory.aggregate({ _max: { displayOrder: true }, where: { parentId: body.parentId || null } });
    const cat = await prisma.menuCategory.create({
      data: {
        restaurantId,
        name: body.name,
        parentId: body.parentId || null,
        displayOrder: body.displayOrder ?? (maxOrder._max.displayOrder ?? 0) + 1,
        dietaryTag: body.dietaryTag ?? null,
        icon: body.icon ?? null,
        hiddenLocations: JSON.stringify(body.hiddenLocations ?? []),
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
    const body = await req.json();

    // Reorder: array of { id, displayOrder, parentId }
    if (Array.isArray(body.order)) {
      await Promise.all(
        body.order.map((o: { id: string; displayOrder: number; parentId?: string | null }) =>
          prisma.menuCategory.update({ where: { id: o.id }, data: { displayOrder: o.displayOrder, parentId: o.parentId ?? null } })
        )
      );
      await audit("reorder", "menu_category", null, body.order);
      return NextResponse.json({ ok: true });
    }

    const { id, hiddenLocations, ...data } = body;
    // Guard against circular parenting.
    if (data.parentId) {
      if (data.parentId === id) return NextResponse.json({ error: "A category cannot be its own parent" }, { status: 400 });
      let cursor: string | null = data.parentId;
      while (cursor) {
        const parent: { parentId: string | null } | null = await prisma.menuCategory.findUnique({ where: { id: cursor }, select: { parentId: true } });
        if (!parent) break;
        if (parent.parentId === id) return NextResponse.json({ error: "Circular category nesting is not allowed" }, { status: 400 });
        cursor = parent.parentId;
      }
    }
    if (hiddenLocations !== undefined) data.hiddenLocations = JSON.stringify(hiddenLocations);
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
    const reassignTo = req.nextUrl.searchParams.get("reassignTo"); // category id | "uncategorized" | null
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

    const itemCount = await prisma.menuItem.count({ where: { categoryId: id, isDeleted: false } });
    // Reassign items: to a parent/target category, or to "uncategorized" (null).
    const target = reassignTo && reassignTo !== "uncategorized" ? reassignTo : null;
    await prisma.menuItem.updateMany({ where: { categoryId: id }, data: { categoryId: target } });
    // Re-parent any child categories up to this category's parent.
    const cat = await prisma.menuCategory.findUnique({ where: { id }, select: { parentId: true } });
    await prisma.menuCategory.updateMany({ where: { parentId: id }, data: { parentId: cat?.parentId ?? null } });
    await prisma.menuCategory.delete({ where: { id } });
    await audit("delete", "menu_category", id, { reassignedItems: itemCount, reassignTo: target ?? "uncategorized" });
    return NextResponse.json({ ok: true, reassigned: itemCount });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
