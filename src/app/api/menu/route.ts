import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit, calcMargin, getRestaurantId } from "@/lib/api-helpers";

const itemSelect =
  "*, category:MenuCategory(id, name), variants:MenuItemVariant(*), modifierGroups:ModifierGroup(*, options:ModifierOption(*)), substitutions:SubstitutionRule(*), recipe:Recipe(*, ingredients:RecipeIngredient(*, ingredient:Ingredient(*)), snapshots:RecipeVersionSnapshot(*))";

function asOne<T>(value: T | T[] | null | undefined): T | null {
  if (value == null) return null;
  if (Array.isArray(value)) return value[0] ?? null;
  return value;
}

function normalizeRecipe(raw: unknown) {
  const recipe = asOne(raw as Record<string, unknown> | Record<string, unknown>[] | null);
  if (!recipe) return null;

  const rawIngredients = recipe.ingredients ?? recipe.RecipeIngredient ?? [];
  const ingredients = (Array.isArray(rawIngredients) ? rawIngredients : []).map((line) => {
    const row = line as Record<string, unknown>;
    return {
      ...row,
      ingredient: asOne(row.ingredient ?? row.Ingredient),
    };
  });

  const rawSnapshots = recipe.snapshots ?? recipe.RecipeVersionSnapshot ?? [];
  const snapshots = (Array.isArray(rawSnapshots) ? rawSnapshots : [])
    .sort((a, b) => Number((b as { version: number }).version) - Number((a as { version: number }).version))
    .slice(0, 10);

  return { ...recipe, ingredients, snapshots };
}

function normalizeMenuItem(item: Record<string, unknown>) {
  const rawGroups = item.modifierGroups ?? item.ModifierGroup ?? [];
  const modifierGroups = (Array.isArray(rawGroups) ? rawGroups : []).map((group) => {
    const g = group as Record<string, unknown>;
    return {
      ...g,
      options: g.options ?? g.ModifierOption ?? [],
    };
  });

  return {
    ...item,
    category: asOne(item.category ?? item.MenuCategory),
    variants: item.variants ?? item.MenuItemVariant ?? [],
    substitutions: item.substitutions ?? item.SubstitutionRule ?? [],
    modifierGroups,
    recipe: normalizeRecipe(item.recipe ?? item.Recipe),
  };
}

async function fetchItem(id: string) {
  const { data, error } = await db().from("MenuItem").select(itemSelect).eq("id", id).single();
  if (error) sbError(error, "menu/fetchItem");
  return normalizeMenuItem(data as Record<string, unknown>);
}

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const categoryId = req.nextUrl.searchParams.get("categoryId");
  const availability = req.nextUrl.searchParams.get("availability");
  const dietary = req.nextUrl.searchParams.get("dietary");
  const sb = db();

  let itemsQ = sb.from("MenuItem").select(itemSelect).eq("isDeleted", false).order("name", { ascending: true });
  if (search) itemsQ = itemsQ.ilike("name", `%${search}%`);
  if (categoryId) itemsQ = itemsQ.eq("categoryId", categoryId);
  if (availability) itemsQ = itemsQ.eq("availability", availability);
  if (dietary) itemsQ = itemsQ.ilike("dietaryFlags", `%${dietary}%`);

  const [itemsResult, categoriesResult, ingredientsResult, seasonalResult, menuItemsForCount] = await Promise.all([
    itemsQ,
    sb.from("MenuCategory").select("*").order("displayOrder", { ascending: true }),
    sb.from("Ingredient").select("*").order("name", { ascending: true }),
    sb.from("SeasonalSchedule").select("*").order("startDate", { ascending: false }),
    sb.from("MenuItem").select("categoryId").eq("isDeleted", false),
  ]);

  if (itemsResult.error) sbError(itemsResult.error, "menu/items");
  if (categoriesResult.error) sbError(categoriesResult.error, "menu/categories");
  if (ingredientsResult.error) sbError(ingredientsResult.error, "menu/ingredients");
  if (seasonalResult.error) sbError(seasonalResult.error, "menu/seasonal");
  if (menuItemsForCount.error) sbError(menuItemsForCount.error, "menu/itemCounts");

  const countByCategory = (menuItemsForCount.data ?? []).reduce<Record<string, number>>((acc, row) => {
    if (row.categoryId) acc[row.categoryId as string] = (acc[row.categoryId as string] ?? 0) + 1;
    return acc;
  }, {});

  const categories = (categoriesResult.data ?? []).map((cat) => ({
    ...cat,
    _count: { items: countByCategory[cat.id as string] ?? 0 },
  }));

  const items = (itemsResult.data ?? []).map((item) => normalizeMenuItem(item as Record<string, unknown>));

  return NextResponse.json({
    items,
    categories,
    ingredients: ingredientsResult.data ?? [],
    seasonal: seasonalResult.data ?? [],
  });
}

async function saveRecipe(
  itemId: string,
  recipeCost: number,
  recipeIngredients: { ingredientId: string; quantity: number; unit: string }[],
) {
  const sb = db();
  const { data: existing, error: findErr } = await sb
    .from("Recipe")
    .select("*, ingredients:RecipeIngredient(*, ingredient:Ingredient(*))")
    .eq("itemId", itemId)
    .maybeSingle();
  if (findErr) sbError(findErr, "menu/saveRecipe/find");

  if (existing) {
    const rawIngredients = existing.ingredients ?? existing.RecipeIngredient ?? [];
    const ingredients = (Array.isArray(rawIngredients) ? rawIngredients : []) as Record<string, unknown>[];
    if (ingredients.length > 0) {
      const normalizedIngredients = ingredients.map((l) => ({
        quantity: Number(l.quantity),
        unit: String(l.unit),
        name:
          asOne(l.ingredient as { name: string } | { name: string }[] | null)?.name ??
          asOne(l.Ingredient as { name: string } | { name: string }[] | null)?.name ??
          "",
      }));
      const { error: snapErr } = await sb.from("RecipeVersionSnapshot").insert({
        id: crypto.randomUUID(),
        recipeId: existing.id,
        version: existing.version,
        recipeCost,
        ingredientsJson: JSON.stringify(
          normalizedIngredients.map((l) => ({ name: l.name, quantity: l.quantity, unit: l.unit })),
        ),
      });
      if (snapErr) sbError(snapErr, "menu/saveRecipe/snapshot");
    }
  }

  let recipeId = existing?.id as string | undefined;
  if (existing) {
    const { error } = await sb
      .from("Recipe")
      .update({ version: Number(existing.version) + 1 })
      .eq("itemId", itemId);
    if (error) sbError(error, "menu/saveRecipe/update");
  } else {
    recipeId = crypto.randomUUID();
    const { error } = await sb.from("Recipe").insert({ id: recipeId, itemId, version: 1 });
    if (error) sbError(error, "menu/saveRecipe/create");
  }

  const { error: delErr } = await sb.from("RecipeIngredient").delete().eq("recipeId", recipeId!);
  if (delErr) sbError(delErr, "menu/saveRecipe/deleteIngredients");

  const lines = recipeIngredients.filter((line) => line.ingredientId && Number(line.quantity) > 0);
  if (lines.length > 0) {
    const { error } = await sb.from("RecipeIngredient").insert(
      lines.map((line) => ({
        id: crypto.randomUUID(),
        recipeId: recipeId!,
        ingredientId: line.ingredientId,
        quantity: Number(line.quantity),
        unit: line.unit,
      })),
    );
    if (error) sbError(error, "menu/saveRecipe/insertIngredients");
  }
  return { id: recipeId };
}

interface VariantInput {
  label: string;
  price: number;
  recipeNote?: string;
}
interface ModifierInput {
  name: string;
  required: boolean;
  minSelect: number;
  maxSelect: number;
  options: { label: string; priceDelta: number }[];
}
interface SubstitutionInput {
  primaryIngredientId: string;
  primaryName: string;
  substituteIngredientId: string;
  substituteName: string;
  ratio: number;
  requiresApproval: boolean;
}

async function saveVariants(itemId: string, variants: VariantInput[]) {
  const sb = db();
  const { error: delErr } = await sb.from("MenuItemVariant").delete().eq("itemId", itemId);
  if (delErr) sbError(delErr, "menu/saveVariants/delete");
  const rows = (variants ?? []).filter((v) => v.label?.trim());
  if (rows.length) {
    const { error } = await sb.from("MenuItemVariant").insert(
      rows.map((v) => ({
        id: crypto.randomUUID(),
        itemId,
        label: v.label,
        price: Number(v.price) || 0,
        recipeNote: v.recipeNote || null,
      })),
    );
    if (error) sbError(error, "menu/saveVariants/insert");
  }
}

async function saveModifiers(itemId: string, groups: ModifierInput[]) {
  const sb = db();
  const { error: delErr } = await sb.from("ModifierGroup").delete().eq("itemId", itemId);
  if (delErr) sbError(delErr, "menu/saveModifiers/delete");
  for (const g of groups ?? []) {
    if (!g.name?.trim()) continue;
    const groupId = crypto.randomUUID();
    const { error: gErr } = await sb.from("ModifierGroup").insert({
      id: groupId,
      itemId,
      name: g.name,
      required: !!g.required,
      minSelect: Number(g.minSelect) || 0,
      maxSelect: Number(g.maxSelect) || 1,
    });
    if (gErr) sbError(gErr, "menu/saveModifiers/group");
    const options = (g.options ?? []).filter((o) => o.label?.trim());
    if (options.length) {
      const { error: oErr } = await sb.from("ModifierOption").insert(
        options.map((o) => ({
          id: crypto.randomUUID(),
          groupId,
          label: o.label,
          priceDelta: Number(o.priceDelta) || 0,
        })),
      );
      if (oErr) sbError(oErr, "menu/saveModifiers/options");
    }
  }
}

async function saveSubstitutions(itemId: string, subs: SubstitutionInput[]) {
  const sb = db();
  const { error: delErr } = await sb.from("SubstitutionRule").delete().eq("itemId", itemId);
  if (delErr) sbError(delErr, "menu/saveSubstitutions/delete");
  const rows = (subs ?? []).filter((s) => s.primaryIngredientId && s.substituteIngredientId);
  if (rows.length) {
    const { error } = await sb.from("SubstitutionRule").insert(
      rows.map((s) => ({
        id: crypto.randomUUID(),
        itemId,
        primaryIngredientId: s.primaryIngredientId,
        primaryName: s.primaryName,
        substituteIngredientId: s.substituteIngredientId,
        substituteName: s.substituteName,
        ratio: Number(s.ratio) || 1,
        requiresApproval: !!s.requiresApproval,
      })),
    );
    if (error) sbError(error, "menu/saveSubstitutions/insert");
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();
    const sb = db();

    if (body.type === "seasonal") {
      const { data: sched, error } = await sb
        .from("SeasonalSchedule")
        .insert({
          id: crypto.randomUUID(),
          restaurantId,
          name: body.name,
          itemId: body.itemId || null,
          categoryId: body.categoryId || null,
          startDate: new Date(body.startDate).toISOString(),
          endDate: new Date(body.endDate).toISOString(),
          recurring: !!body.recurring,
          active: body.active ?? true,
        })
        .select()
        .single();
      if (error) sbError(error, "menu/seasonal/create");
      await audit("create", "seasonal_schedule", sched.id, sched);
      return NextResponse.json(sched, { status: 201 });
    }

    const basePrice = Number(body.basePrice) || 0;
    const recipeCost = Number(body.recipeCost) || 0;
    const itemId = crypto.randomUUID();
    const now = new Date().toISOString();
    const { error: createErr } = await sb.from("MenuItem").insert({
      id: itemId,
      restaurantId,
      name: body.name,
      description: body.description ?? null,
      categoryId: body.categoryId || null,
      basePrice,
      locationPrice: body.locationPrice != null && body.locationPrice !== "" ? Number(body.locationPrice) : null,
      recipeCost,
      grossMargin: calcMargin(basePrice, recipeCost),
      marginAlertThreshold:
        body.marginAlertThreshold != null && body.marginAlertThreshold !== "" ? Number(body.marginAlertThreshold) : null,
      prepTime: body.prepTime ? Number(body.prepTime) : null,
      availability: body.availability ?? "available",
      taxCategory: body.taxCategory ?? "GST_5",
      dietaryFlags: JSON.stringify(body.dietaryFlags ?? []),
      allergenTags: JSON.stringify(body.allergenTags ?? []),
      photos: JSON.stringify(body.photos ?? []),
      updatedAt: now,
    });
    if (createErr) sbError(createErr, "menu/create");

    if (Array.isArray(body.recipeIngredients)) await saveRecipe(itemId, recipeCost, body.recipeIngredients);
    if (Array.isArray(body.variants)) await saveVariants(itemId, body.variants);
    if (Array.isArray(body.modifierGroups)) await saveModifiers(itemId, body.modifierGroups);
    if (Array.isArray(body.substitutions)) await saveSubstitutions(itemId, body.substitutions);

    const item = await fetchItem(itemId);
    await audit("create", "menu_item", itemId, item);
    return NextResponse.json(item, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = db();

    if (body.type === "seasonal") {
      const { type, id, ...data } = body;
      void type;
      const updates: Record<string, unknown> = {};
      if (data.name !== undefined) updates.name = data.name;
      if (data.startDate) updates.startDate = new Date(data.startDate).toISOString();
      if (data.endDate) updates.endDate = new Date(data.endDate).toISOString();
      if (data.recurring !== undefined) updates.recurring = !!data.recurring;
      if (data.active !== undefined) updates.active = !!data.active;
      const { data: sched, error } = await sb.from("SeasonalSchedule").update(updates).eq("id", id).select().single();
      if (error) sbError(error, "menu/seasonal/update");
      return NextResponse.json(sched);
    }

    const {
      id,
      ids,
      bulkAvailability,
      recipeIngredients,
      variants,
      modifierGroups,
      substitutions,
      dietaryFlags,
      allergenTags,
      photos,
      ...data
    } = body;

    if (ids && bulkAvailability) {
      const { error } = await sb
        .from("MenuItem")
        .update({ availability: bulkAvailability, updatedAt: new Date().toISOString() })
        .in("id", ids);
      if (error) sbError(error, "menu/bulkUpdate");
      await audit("bulk_update", "menu_item", ids.join(","), { availability: bulkAvailability });
      return NextResponse.json({ updated: ids.length });
    }

    if (data.basePrice !== undefined || data.recipeCost !== undefined) {
      const { data: existing } = await sb.from("MenuItem").select("basePrice, recipeCost").eq("id", id).maybeSingle();
      const price = data.basePrice ?? existing?.basePrice ?? 0;
      const cost = data.recipeCost ?? existing?.recipeCost ?? 0;
      data.grossMargin = calcMargin(Number(price), Number(cost));
    }
    if (data.locationPrice === "" || data.locationPrice === null) data.locationPrice = null;
    else if (data.locationPrice !== undefined) data.locationPrice = Number(data.locationPrice);
    if (data.marginAlertThreshold === "" || data.marginAlertThreshold === null) data.marginAlertThreshold = null;
    else if (data.marginAlertThreshold !== undefined) data.marginAlertThreshold = Number(data.marginAlertThreshold);
    if (data.availability === "available") data.autoOutOfStock = false;
    if (dietaryFlags !== undefined) data.dietaryFlags = JSON.stringify(dietaryFlags);
    if (allergenTags !== undefined) data.allergenTags = JSON.stringify(allergenTags);
    if (photos !== undefined) data.photos = JSON.stringify(photos);
    data.updatedAt = new Date().toISOString();

    const { error: updateErr } = await sb.from("MenuItem").update(data).eq("id", id);
    if (updateErr) sbError(updateErr, "menu/update");

    if (Array.isArray(recipeIngredients)) {
      const { data: itemCost } = await sb.from("MenuItem").select("recipeCost").eq("id", id).maybeSingle();
      await saveRecipe(id, Number(itemCost?.recipeCost ?? 0), recipeIngredients);
    }
    if (Array.isArray(variants)) await saveVariants(id, variants);
    if (Array.isArray(modifierGroups)) await saveModifiers(id, modifierGroups);
    if (Array.isArray(substitutions)) await saveSubstitutions(id, substitutions);

    const item = await fetchItem(id);
    await audit("update", "menu_item", id, data);
    return NextResponse.json(item);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const seasonalId = req.nextUrl.searchParams.get("seasonalId");
    const sb = db();
    if (seasonalId) {
      const { error } = await sb.from("SeasonalSchedule").delete().eq("id", seasonalId);
      if (error) sbError(error, "menu/deleteSeasonal");
      await audit("delete", "seasonal_schedule", seasonalId);
      return NextResponse.json({ ok: true });
    }
    const id = req.nextUrl.searchParams.get("id");
    const ids = req.nextUrl.searchParams.get("ids")?.split(",").filter(Boolean);
    const reason = req.nextUrl.searchParams.get("reason") ?? "No reason provided";
    if (ids?.length) {
      const { error } = await sb.from("MenuItem").update({ isDeleted: true, updatedAt: new Date().toISOString() }).in("id", ids);
      if (error) sbError(error, "menu/bulkDelete");
      await audit("delete", "menu_item", ids.join(","), { softDelete: true, reason });
      return NextResponse.json({ deleted: ids.length });
    }
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { error } = await sb.from("MenuItem").update({ isDeleted: true, updatedAt: new Date().toISOString() }).eq("id", id);
    if (error) sbError(error, "menu/delete");
    await audit("delete", "menu_item", id, { softDelete: true, reason });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
