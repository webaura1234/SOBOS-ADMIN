import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getRestaurantId } from "@/lib/api-helpers";

function parseFilters(filters: string) {
  try {
    return JSON.parse(filters) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const restaurantId = await getRestaurantId();
  const module = req.nextUrl.searchParams.get("module");
  if (!module) return NextResponse.json({ error: "module is required" }, { status: 400 });

  const views = await prisma.savedView.findMany({
    where: { restaurantId, module },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
  });

  return NextResponse.json({
    views: views.map((view) => ({ ...view, filters: parseFilters(view.filters) })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const restaurantId = await getRestaurantId();
    const body = await req.json();
    if (!body.module || !body.name) {
      return NextResponse.json({ error: "module and name are required" }, { status: 400 });
    }

    if (body.isDefault) {
      await prisma.savedView.updateMany({
        where: { restaurantId, module: body.module },
        data: { isDefault: false },
      });
    }

    const view = await prisma.savedView.upsert({
      where: { restaurantId_module_name: { restaurantId, module: body.module, name: body.name } },
      update: { filters: JSON.stringify(body.filters ?? {}), isDefault: Boolean(body.isDefault) },
      create: {
        restaurantId,
        module: body.module,
        name: body.name,
        filters: JSON.stringify(body.filters ?? {}),
        isDefault: Boolean(body.isDefault),
      },
    });

    await audit("upsert", "saved_view", view.id, { module: body.module, name: body.name, filters: body.filters });
    return NextResponse.json({ ...view, filters: parseFilters(view.filters) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const restaurantId = await getRestaurantId();
    const { id, isDefault } = await req.json();
    const existing = await prisma.savedView.findUnique({ where: { id } });
    if (!existing) return NextResponse.json({ error: "Saved view not found" }, { status: 404 });

    if (isDefault) {
      await prisma.savedView.updateMany({
        where: { restaurantId, module: existing.module },
        data: { isDefault: false },
      });
    }

    const view = await prisma.savedView.update({ where: { id }, data: { isDefault: Boolean(isDefault) } });
    await audit("update", "saved_view", id, { isDefault });
    return NextResponse.json({ ...view, filters: parseFilters(view.filters) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    await prisma.savedView.delete({ where: { id } });
    await audit("delete", "saved_view", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
