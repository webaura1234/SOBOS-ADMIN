import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
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

  const { data: views, error } = await db()
    .from("SavedView")
    .select("*")
    .eq("restaurantId", restaurantId)
    .eq("module", module)
    .order("isDefault", { ascending: false })
    .order("name", { ascending: true });
  if (error) sbError(error, "saved-views/GET");

  return NextResponse.json({
    views: (views ?? []).map((view) => ({ ...view, filters: parseFilters(view.filters as string) })),
  });
}

export async function POST(req: NextRequest) {
  try {
    const restaurantId = await getRestaurantId();
    const body = await req.json();
    if (!body.module || !body.name) {
      return NextResponse.json({ error: "module and name are required" }, { status: 400 });
    }

    const sb = db();
    if (body.isDefault) {
      const { error } = await sb
        .from("SavedView")
        .update({ isDefault: false })
        .eq("restaurantId", restaurantId)
        .eq("module", body.module);
      if (error) sbError(error, "saved-views/clearDefault");
    }

    const { data: existing } = await sb
      .from("SavedView")
      .select("id")
      .eq("restaurantId", restaurantId)
      .eq("module", body.module)
      .eq("name", body.name)
      .maybeSingle();

    const { data: view, error } = await sb
      .from("SavedView")
      .upsert(
        {
          id: existing?.id ?? crypto.randomUUID(),
          restaurantId,
          module: body.module,
          name: body.name,
          filters: JSON.stringify(body.filters ?? {}),
          isDefault: Boolean(body.isDefault),
        },
        { onConflict: "restaurantId,module,name" },
      )
      .select()
      .single();
    if (error) sbError(error, "saved-views/POST");

    await audit("upsert", "saved_view", view.id, { module: body.module, name: body.name, filters: body.filters });
    return NextResponse.json({ ...view, filters: parseFilters(view.filters as string) }, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const restaurantId = await getRestaurantId();
    const { id, isDefault } = await req.json();
    const sb = db();

    const { data: existing, error: findErr } = await sb.from("SavedView").select("*").eq("id", id).maybeSingle();
    if (findErr) sbError(findErr, "saved-views/find");
    if (!existing) return NextResponse.json({ error: "Saved view not found" }, { status: 404 });

    if (isDefault) {
      const { error } = await sb
        .from("SavedView")
        .update({ isDefault: false })
        .eq("restaurantId", restaurantId)
        .eq("module", existing.module);
      if (error) sbError(error, "saved-views/clearDefault");
    }

    const { data: view, error } = await sb
      .from("SavedView")
      .update({ isDefault: Boolean(isDefault) })
      .eq("id", id)
      .select()
      .single();
    if (error) sbError(error, "saved-views/PATCH");

    await audit("update", "saved_view", id, { isDefault });
    return NextResponse.json({ ...view, filters: parseFilters(view.filters as string) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id is required" }, { status: 400 });
    const { error } = await db().from("SavedView").delete().eq("id", id);
    if (error) sbError(error, "saved-views/DELETE");
    await audit("delete", "saved_view", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
