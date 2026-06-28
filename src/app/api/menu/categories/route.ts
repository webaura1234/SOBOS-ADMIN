import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit, getRestaurantId } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();
    const sb = db();

    let maxOrder = 0;
    const parentId = body.parentId || null;
    let maxQ = sb.from("MenuCategory").select("displayOrder").order("displayOrder", { ascending: false }).limit(1);
    maxQ = parentId === null ? maxQ.is("parentId", null) : maxQ.eq("parentId", parentId);
    const { data: siblings, error: maxErr } = await maxQ;
    if (maxErr) sbError(maxErr, "menu/categories/maxOrder");
    maxOrder = siblings?.[0]?.displayOrder ?? 0;

    const now = new Date().toISOString();
    const { data: cat, error } = await sb
      .from("MenuCategory")
      .insert({
        id: crypto.randomUUID(),
        restaurantId,
        name: body.name,
        parentId,
        displayOrder: body.displayOrder ?? maxOrder + 1,
        dietaryTag: body.dietaryTag ?? null,
        icon: body.icon ?? null,
        hiddenLocations: JSON.stringify(body.hiddenLocations ?? []),
        updatedAt: now,
      })
      .select()
      .single();
    if (error) sbError(error, "menu/categories/POST");
    await audit("create", "menu_category", cat.id, cat);
    return NextResponse.json(cat, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = db();

    if (Array.isArray(body.order)) {
      await Promise.all(
        body.order.map(async (o: { id: string; displayOrder: number; parentId?: string | null }) => {
          const { error } = await sb
            .from("MenuCategory")
            .update({ displayOrder: o.displayOrder, parentId: o.parentId ?? null, updatedAt: new Date().toISOString() })
            .eq("id", o.id);
          if (error) sbError(error, "menu/categories/reorder");
        }),
      );
      await audit("reorder", "menu_category", null, body.order);
      return NextResponse.json({ ok: true });
    }

    const { id, hiddenLocations, ...data } = body;
    if (data.parentId) {
      if (data.parentId === id) return NextResponse.json({ error: "A category cannot be its own parent" }, { status: 400 });
      let cursor: string | null = data.parentId;
      while (cursor) {
        const { data: parent, error } = await sb.from("MenuCategory").select("parentId").eq("id", cursor).maybeSingle();
        if (error) sbError(error, "menu/categories/checkParent");
        if (!parent) break;
        if (parent.parentId === id)
          return NextResponse.json({ error: "Circular category nesting is not allowed" }, { status: 400 });
        cursor = parent.parentId;
      }
    }
    if (hiddenLocations !== undefined) data.hiddenLocations = JSON.stringify(hiddenLocations);
    data.updatedAt = new Date().toISOString();
    const { data: cat, error } = await sb.from("MenuCategory").update(data).eq("id", id).select().single();
    if (error) sbError(error, "menu/categories/PATCH");
    await audit("update", "menu_category", id, data);
    return NextResponse.json(cat);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const reassignTo = req.nextUrl.searchParams.get("reassignTo");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const sb = db();

    const { count: itemCount, error: countErr } = await sb
      .from("MenuItem")
      .select("*", { count: "exact", head: true })
      .eq("categoryId", id)
      .eq("isDeleted", false);
    if (countErr) sbError(countErr, "menu/categories/itemCount");

    const target = reassignTo && reassignTo !== "uncategorized" ? reassignTo : null;
    const { error: reassignErr } = await sb.from("MenuItem").update({ categoryId: target, updatedAt: new Date().toISOString() }).eq("categoryId", id);
    if (reassignErr) sbError(reassignErr, "menu/categories/reassign");

    const { data: cat, error: catErr } = await sb.from("MenuCategory").select("parentId").eq("id", id).maybeSingle();
    if (catErr) sbError(catErr, "menu/categories/find");

    const { error: reparentErr } = await sb
      .from("MenuCategory")
      .update({ parentId: cat?.parentId ?? null, updatedAt: new Date().toISOString() })
      .eq("parentId", id);
    if (reparentErr) sbError(reparentErr, "menu/categories/reparent");

    const { error: delErr } = await sb.from("MenuCategory").delete().eq("id", id);
    if (delErr) sbError(delErr, "menu/categories/DELETE");

    await audit("delete", "menu_category", id, { reassignedItems: itemCount ?? 0, reassignTo: target ?? "uncategorized" });
    return NextResponse.json({ ok: true, reassigned: itemCount ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
