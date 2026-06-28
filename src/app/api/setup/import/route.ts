import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit, getRestaurantId, calcMargin } from "@/lib/api-helpers";

export async function POST(req: NextRequest) {
  try {
    const { entity, rows } = (await req.json()) as { entity: string; rows: Record<string, string>[] };
    const restaurantId = await getRestaurantId();
    const sb = db();
    let created = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < (rows ?? []).length; i++) {
      const r = rows[i];
      try {
        if (entity === "menu") {
          if (!r.name) throw new Error("Missing name");
          let categoryId: string | null = null;
          if (r.category) {
            const { data: existingCat } = await sb
              .from("MenuCategory")
              .select("id")
              .eq("restaurantId", restaurantId)
              .eq("name", r.category)
              .maybeSingle();
            if (existingCat) {
              categoryId = existingCat.id;
            } else {
              const newId = crypto.randomUUID();
              const now = new Date().toISOString();
              const { error } = await sb.from("MenuCategory").insert({
                id: newId,
                restaurantId,
                name: r.category,
                updatedAt: now,
              });
              if (error) throw new Error(error.message);
              categoryId = newId;
            }
          }
          const basePrice = Number(r.price) || 0;
          const now = new Date().toISOString();
          const { error } = await sb.from("MenuItem").insert({
            id: crypto.randomUUID(),
            restaurantId,
            name: r.name,
            categoryId,
            basePrice,
            grossMargin: calcMargin(basePrice, 0),
            updatedAt: now,
          });
          if (error) throw new Error(error.message);
        } else if (entity === "ingredient") {
          if (!r.name) throw new Error("Missing name");
          const { data: existing } = await sb.from("Ingredient").select("id").eq("name", r.name).maybeSingle();
          if (existing) throw new Error("Duplicate ingredient");
          const { error } = await sb.from("Ingredient").insert({
            id: crypto.randomUUID(),
            name: r.name,
            unit: r.unit || "unit",
            threshold: Number(r.threshold) || 5,
          });
          if (error) throw new Error(error.message);
        } else if (entity === "customer") {
          if (!r.phone) throw new Error("Missing phone");
          const { data: existing } = await sb.from("Customer").select("id").eq("phone", r.phone).maybeSingle();
          if (existing) throw new Error("Duplicate phone");
          const { error } = await sb.from("Customer").insert({
            id: crypto.randomUUID(),
            name: r.name || r.phone,
            phone: r.phone,
            email: r.email || null,
          });
          if (error) throw new Error(error.message);
        } else if (entity === "supplier") {
          if (!r.name) throw new Error("Missing name");
          const { error } = await sb.from("Supplier").insert({
            id: crypto.randomUUID(),
            name: r.name,
            phone: r.phone || null,
            email: r.email || null,
          });
          if (error) throw new Error(error.message);
        } else if (entity === "staff") {
          if (!r.phone) throw new Error("Missing phone");
          const { data: existing } = await sb
            .from("User")
            .select("id")
            .eq("restaurantId", restaurantId)
            .eq("phone", r.phone)
            .maybeSingle();
          if (existing) throw new Error("Duplicate phone");
          const userId = crypto.randomUUID();
          const now = new Date().toISOString();
          const { error } = await sb.from("User").insert({
            id: userId,
            restaurantId,
            name: r.name || r.phone,
            phone: r.phone,
            inviteStatus: "pending",
            updatedAt: now,
          });
          if (error) throw new Error(error.message);
          if (r.role) {
            const { data: role } = await sb.from("Role").select("id").eq("restaurantId", restaurantId).eq("name", r.role).maybeSingle();
            const { data: loc } = r.location
              ? await sb.from("Location").select("id").eq("restaurantId", restaurantId).eq("name", r.location).maybeSingle()
              : { data: null };
            if (role) {
              const { error: assignErr } = await sb.from("UserLocationRole").insert({
                id: crypto.randomUUID(),
                userId,
                roleId: role.id,
                locationId: loc?.id ?? null,
              });
              if (assignErr) throw new Error(assignErr.message);
            }
          }
        } else {
          throw new Error("Unknown entity");
        }
        created += 1;
      } catch (e) {
        errors.push({ row: i + 1, error: e instanceof Error ? e.message : String(e) });
      }
    }

    await audit("import", entity, null, { created, errors: errors.length });
    return NextResponse.json({ created, total: rows?.length ?? 0, errors });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH() {
  try {
    const restaurantId = await getRestaurantId();
    const { data, error } = await db()
      .from("Location")
      .update({ status: "active", updatedAt: new Date().toISOString() })
      .eq("restaurantId", restaurantId)
      .in("status", ["setup", "pending_setup"])
      .select("id");
    if (error) sbError(error, "setup/import/PATCH");
    await audit("activate", "restaurant", restaurantId, { activated: data?.length ?? 0 });
    return NextResponse.json({ activated: data?.length ?? 0 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
