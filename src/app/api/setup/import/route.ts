import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getRestaurantId, calcMargin } from "@/lib/api-helpers";

// CSV data-migration import for onboarding (F-02). Each entity has a simple column contract.
export async function POST(req: NextRequest) {
  try {
    const { entity, rows } = (await req.json()) as { entity: string; rows: Record<string, string>[] };
    const restaurantId = await getRestaurantId();
    let created = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < (rows ?? []).length; i++) {
      const r = rows[i];
      try {
        if (entity === "menu") {
          // name, category, price
          if (!r.name) throw new Error("Missing name");
          let categoryId: string | null = null;
          if (r.category) {
            const cat = await prisma.menuCategory.findFirst({ where: { restaurantId, name: r.category } }) ?? await prisma.menuCategory.create({ data: { restaurantId, name: r.category } });
            categoryId = cat.id;
          }
          const basePrice = Number(r.price) || 0;
          await prisma.menuItem.create({ data: { restaurantId, name: r.name, categoryId, basePrice, grossMargin: calcMargin(basePrice, 0) } });
        } else if (entity === "ingredient") {
          // name, unit, threshold
          if (!r.name) throw new Error("Missing name");
          const existing = await prisma.ingredient.findUnique({ where: { name: r.name } });
          if (existing) throw new Error("Duplicate ingredient");
          await prisma.ingredient.create({ data: { name: r.name, unit: r.unit || "unit", threshold: Number(r.threshold) || 5 } });
        } else if (entity === "customer") {
          // name, phone, email
          if (!r.phone) throw new Error("Missing phone");
          const existing = await prisma.customer.findUnique({ where: { phone: r.phone } });
          if (existing) throw new Error("Duplicate phone");
          await prisma.customer.create({ data: { name: r.name || r.phone, phone: r.phone, email: r.email || null } });
        } else if (entity === "supplier") {
          // name, phone, email
          if (!r.name) throw new Error("Missing name");
          await prisma.supplier.create({ data: { name: r.name, phone: r.phone || null, email: r.email || null } });
        } else if (entity === "staff") {
          // phone, name, role, location
          if (!r.phone) throw new Error("Missing phone");
          const existing = await prisma.user.findUnique({ where: { restaurantId_phone: { restaurantId, phone: r.phone } } });
          if (existing) throw new Error("Duplicate phone");
          const user = await prisma.user.create({ data: { restaurantId, name: r.name || r.phone, phone: r.phone, inviteStatus: "pending" } });
          if (r.role) {
            const role = await prisma.role.findFirst({ where: { restaurantId, name: r.role } });
            const loc = r.location ? await prisma.location.findFirst({ where: { restaurantId, name: r.location } }) : null;
            if (role) await prisma.userLocationRole.create({ data: { userId: user.id, roleId: role.id, locationId: loc?.id ?? null } });
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

// Completion gating: flip setup locations live (pending_setup → active).
export async function PATCH() {
  try {
    const restaurantId = await getRestaurantId();
    const result = await prisma.location.updateMany({ where: { restaurantId, status: { in: ["setup", "pending_setup"] } }, data: { status: "active" } });
    await audit("activate", "restaurant", restaurantId, { activated: result.count });
    return NextResponse.json({ activated: result.count });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
