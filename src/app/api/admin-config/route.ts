import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
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

  const configs = await prisma.adminConfig.findMany({
    where: { restaurantId, scope, ...(key && { key }) },
    orderBy: { key: "asc" },
  });

  const data = Object.fromEntries(configs.map((config) => [config.key, safeJson(config.value)]));
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

    const config = await prisma.adminConfig.upsert({
      where: { restaurantId_scope_key: { restaurantId, scope, key } },
      update: { value: JSON.stringify(value) },
      create: { restaurantId, scope, key, value: JSON.stringify(value) },
    });

    await audit("update", "admin_config", config.id, { scope, key, value });
    return NextResponse.json({ ...config, value });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
