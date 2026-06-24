import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, calcMargin, getRestaurantId } from "@/lib/api-helpers";

const itemInclude = {
  category: { select: { id: true, name: true } },
  variants: true,
  modifierGroups: { include: { options: true } },
  substitutions: true,
  recipe: { include: { ingredients: { include: { ingredient: true } }, snapshots: { orderBy: { version: "desc" as const }, take: 10 } } },
};

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const availability = req.nextUrl.searchParams.get("availability");
  const dietary = req.nextUrl.searchParams.get("dietary");

  const [items, categories, ingredients, seasonal] = await Promise.all([
    prisma.menuItem.findMany({
      where: {
        isDeleted: false,
        ...(search && { name: { contains: search } }),
        ...(categoryId && { categoryId }),
        ...(availability && { availability }),
        ...(dietary && { dietaryFlags: { contains: dietary } }),
      },
      include: itemInclude,
      orderBy: { name: "asc" },
    }),
    prisma.menuCategory.findMany({
      orderBy: { displayOrder: "asc" },
      include: { _count: { select: { items: { where: { isDeleted: false } } } } },
    }),
    prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
    prisma.seasonalSchedule.findMany({ orderBy: { startDate: "desc" } }),
  ]);

  return NextResponse.json({ items, categories, ingredients, seasonal });
}

async function saveRecipe(itemId: string, recipeCost: number, recipeIngredients: { ingredientId: string; quantity: number; unit: string }[]) {
  const existing = await prisma.recipe.findUnique({ where: { itemId }, include: { ingredients: { include: { ingredient: true } } } });
  // Snapshot the previous version before mutating, so we keep a version history.
  if (existing && existing.ingredients.length > 0) {
    await prisma.recipeVersionSnapshot.create({
      data: {
        recipeId: existing.id,
        version: existing.version,
        recipeCost,
        ingredientsJson: JSON.stringify(existing.ingredients.map((l) => ({ name: l.ingredient.name, quantity: l.quantity, unit: l.unit }))),
      },
    });
  }
  const recipe = existing
    ? await prisma.recipe.update({ where: { itemId }, data: { version: { increment: 1 } } })
    : await prisma.recipe.create({ data: { itemId } });
  await prisma.recipeIngredient.deleteMany({ where: { recipeId: recipe.id } });
  if (recipeIngredients.length > 0) {
    await prisma.recipeIngredient.createMany({
      data: recipeIngredients
        .filter((line) => line.ingredientId && Number(line.quantity) > 0)
        .map((line) => ({ recipeId: recipe.id, ingredientId: line.ingredientId, quantity: Number(line.quantity), unit: line.unit })),
    });
  }
  return recipe;
}

interface VariantInput { label: string; price: number; recipeNote?: string }
interface ModifierInput { name: string; required: boolean; minSelect: number; maxSelect: number; options: { label: string; priceDelta: number }[] }
interface SubstitutionInput { primaryIngredientId: string; primaryName: string; substituteIngredientId: string; substituteName: string; ratio: number; requiresApproval: boolean }

async function saveVariants(itemId: string, variants: VariantInput[]) {
  await prisma.menuItemVariant.deleteMany({ where: { itemId } });
  if (variants?.length) {
    await prisma.menuItemVariant.createMany({
      data: variants.filter((v) => v.label?.trim()).map((v) => ({ itemId, label: v.label, price: Number(v.price) || 0, recipeNote: v.recipeNote || null })),
    });
  }
}

async function saveModifiers(itemId: string, groups: ModifierInput[]) {
  await prisma.modifierGroup.deleteMany({ where: { itemId } });
  for (const g of groups ?? []) {
    if (!g.name?.trim()) continue;
    await prisma.modifierGroup.create({
      data: {
        itemId, name: g.name, required: !!g.required, minSelect: Number(g.minSelect) || 0, maxSelect: Number(g.maxSelect) || 1,
        options: { create: (g.options ?? []).filter((o) => o.label?.trim()).map((o) => ({ label: o.label, priceDelta: Number(o.priceDelta) || 0 })) },
      },
    });
  }
}

async function saveSubstitutions(itemId: string, subs: SubstitutionInput[]) {
  await prisma.substitutionRule.deleteMany({ where: { itemId } });
  if (subs?.length) {
    await prisma.substitutionRule.createMany({
      data: subs.filter((s) => s.primaryIngredientId && s.substituteIngredientId).map((s) => ({
        itemId, primaryIngredientId: s.primaryIngredientId, primaryName: s.primaryName,
        substituteIngredientId: s.substituteIngredientId, substituteName: s.substituteName,
        ratio: Number(s.ratio) || 1, requiresApproval: !!s.requiresApproval,
      })),
    });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();

    if (body.type === "seasonal") {
      const sched = await prisma.seasonalSchedule.create({
        data: {
          restaurantId, name: body.name, itemId: body.itemId || null, categoryId: body.categoryId || null,
          startDate: new Date(body.startDate), endDate: new Date(body.endDate), recurring: !!body.recurring, active: body.active ?? true,
        },
      });
      await audit("create", "seasonal_schedule", sched.id, sched);
      return NextResponse.json(sched, { status: 201 });
    }

    const basePrice = Number(body.basePrice) || 0;
    const recipeCost = Number(body.recipeCost) || 0;
    const item = await prisma.menuItem.create({
      data: {
        restaurantId,
        name: body.name,
        description: body.description ?? null,
        categoryId: body.categoryId || null,
        basePrice,
        locationPrice: body.locationPrice != null && body.locationPrice !== "" ? Number(body.locationPrice) : null,
        recipeCost,
        grossMargin: calcMargin(basePrice, recipeCost),
        marginAlertThreshold: body.marginAlertThreshold != null && body.marginAlertThreshold !== "" ? Number(body.marginAlertThreshold) : null,
        prepTime: body.prepTime ? Number(body.prepTime) : null,
        availability: body.availability ?? "available",
        taxCategory: body.taxCategory ?? "GST_5",
        dietaryFlags: JSON.stringify(body.dietaryFlags ?? []),
        allergenTags: JSON.stringify(body.allergenTags ?? []),
        photos: JSON.stringify(body.photos ?? []),
      },
      include: itemInclude,
    });
    if (Array.isArray(body.recipeIngredients)) await saveRecipe(item.id, recipeCost, body.recipeIngredients);
    if (Array.isArray(body.variants)) await saveVariants(item.id, body.variants);
    if (Array.isArray(body.modifierGroups)) await saveModifiers(item.id, body.modifierGroups);
    if (Array.isArray(body.substitutions)) await saveSubstitutions(item.id, body.substitutions);
    await audit("create", "menu_item", item.id, item);
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.type === "seasonal") {
      const { type, id, ...data } = body;
      void type;
      const sched = await prisma.seasonalSchedule.update({
        where: { id },
        data: {
          ...(data.name !== undefined && { name: data.name }),
          ...(data.startDate && { startDate: new Date(data.startDate) }),
          ...(data.endDate && { endDate: new Date(data.endDate) }),
          ...(data.recurring !== undefined && { recurring: !!data.recurring }),
          ...(data.active !== undefined && { active: !!data.active }),
        },
      });
      return NextResponse.json(sched);
    }

    const { id, ids, bulkAvailability, recipeIngredients, variants, modifierGroups, substitutions, dietaryFlags, allergenTags, photos, ...data } = body;

    if (ids && bulkAvailability) {
      await prisma.menuItem.updateMany({ where: { id: { in: ids } }, data: { availability: bulkAvailability } });
      await audit("bulk_update", "menu_item", ids.join(","), { availability: bulkAvailability });
      return NextResponse.json({ updated: ids.length });
    }

    if (data.basePrice !== undefined || data.recipeCost !== undefined) {
      const existing = await prisma.menuItem.findUnique({ where: { id } });
      const price = data.basePrice ?? existing?.basePrice ?? 0;
      const cost = data.recipeCost ?? existing?.recipeCost ?? 0;
      data.grossMargin = calcMargin(Number(price), Number(cost));
    }
    if (data.locationPrice === "" || data.locationPrice === null) data.locationPrice = null;
    else if (data.locationPrice !== undefined) data.locationPrice = Number(data.locationPrice);
    if (data.marginAlertThreshold === "" || data.marginAlertThreshold === null) data.marginAlertThreshold = null;
    else if (data.marginAlertThreshold !== undefined) data.marginAlertThreshold = Number(data.marginAlertThreshold);
    // An admin override to Available clears the auto-OOS flag.
    if (data.availability === "available") data.autoOutOfStock = false;
    if (dietaryFlags !== undefined) data.dietaryFlags = JSON.stringify(dietaryFlags);
    if (allergenTags !== undefined) data.allergenTags = JSON.stringify(allergenTags);
    if (photos !== undefined) data.photos = JSON.stringify(photos);

    const item = await prisma.menuItem.update({ where: { id }, data, include: itemInclude });
    if (Array.isArray(recipeIngredients)) await saveRecipe(id, Number(item.recipeCost), recipeIngredients);
    if (Array.isArray(variants)) await saveVariants(id, variants);
    if (Array.isArray(modifierGroups)) await saveModifiers(id, modifierGroups);
    if (Array.isArray(substitutions)) await saveSubstitutions(id, substitutions);
    await audit("update", "menu_item", id, data);
    return NextResponse.json(item);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const seasonalId = req.nextUrl.searchParams.get("seasonalId");
    if (seasonalId) {
      await prisma.seasonalSchedule.delete({ where: { id: seasonalId } });
      await audit("delete", "seasonal_schedule", seasonalId);
      return NextResponse.json({ ok: true });
    }
    const id = req.nextUrl.searchParams.get("id");
    const ids = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean);
    const reason = req.nextUrl.searchParams.get("reason") ?? "No reason provided";
    if (ids?.length) {
      await prisma.menuItem.updateMany({ where: { id: { in: ids } }, data: { isDeleted: true } });
      await audit("delete", "menu_item", ids.join(","), { softDelete: true, reason });
      return NextResponse.json({ deleted: ids.length });
    }
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    await prisma.menuItem.update({ where: { id }, data: { isDeleted: true } });
    await audit("delete", "menu_item", id, { softDelete: true, reason });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
