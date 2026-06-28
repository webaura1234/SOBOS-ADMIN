import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit, getRestaurantId } from "@/lib/api-helpers";

function safeJson(value: string | null | undefined) {
  if (!value) return {};
  try {
    return JSON.parse(value) as Record<string, unknown>;
  } catch {
    return {};
  }
}

export async function GET(req: NextRequest) {
  const restaurantId = await getRestaurantId();
  const scope = req.nextUrl.searchParams.get("scope") ?? "global";
  const key = req.nextUrl.searchParams.get("key");

  let q = db().from("AdminConfig").select("*").eq("restaurantId", restaurantId).eq("scope", scope).order("key", { ascending: true });
  if (key) q = q.eq("key", key);
  const { data: configs, error } = await q;
  if (error) sbError(error, "admin-config/GET");

  const data = Object.fromEntries((configs ?? []).map((config) => [config.key, safeJson(config.value as string)]));
  return NextResponse.json(key ? data[key] ?? {} : data);
}

export async function PATCH(req: NextRequest) {
  try {
    const restaurantId = await getRestaurantId();
    const body = await req.json();
    const scope = body.scope ?? "global";
    const key = body.key;
    const value = body.value ?? {};

    if (!key || typeof key !== "string") {
      return NextResponse.json({ error: "key is required" }, { status: 400 });
    }

    const { data: existing } = await db()
      .from("AdminConfig")
      .select("id")
      .eq("restaurantId", restaurantId)
      .eq("scope", scope)
      .eq("key", key)
      .maybeSingle();
    const { data: config, error } = await db()
      .from("AdminConfig")
      .upsert(
        { id: existing?.id ?? crypto.randomUUID(), restaurantId, scope, key, value: JSON.stringify(value) },
        { onConflict: "restaurantId,scope,key" },
      )
      .select()
      .single();
    if (error) sbError(error, "admin-config/PATCH");

    await audit("update", "admin_config", config.id, { scope, key, value });
    return NextResponse.json({ ...config, value });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
