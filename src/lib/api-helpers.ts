import { db, sbError } from "@/lib/db";

export async function getRestaurantId() {
  const { data, error } = await db().from("Restaurant").select("id").limit(1).maybeSingle();
  if (error) sbError(error, "getRestaurantId");
  if (!data) throw new Error("No restaurant found");
  return data.id as string;
}

export async function audit(
  action: string,
  resourceType: string,
  resourceId: string | null,
  after?: unknown,
  before?: unknown,
) {
  const { error } = await db().from("AuditLog").insert({
    id: crypto.randomUUID(),
    actorName: "Rajesh Kumar",
    action,
    resourceType,
    resourceId,
    beforeJson: before ? JSON.stringify(before) : null,
    afterJson: after ? JSON.stringify(after) : null,
  });
  if (error) sbError(error, "audit");
}

export function calcMargin(price: number, cost: number) {
  if (price <= 0) return 0;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

export async function syncAutoOutOfStock(ingredientId: string) {
  const sb = db();
  const { data: stockRows, error: stockErr } = await sb
    .from("Stock")
    .select("quantity")
    .eq("ingredientId", ingredientId);
  if (stockErr) sbError(stockErr, "syncAutoOutOfStock/stock");

  const total = (stockRows ?? []).reduce((sum, row) => sum + Number(row.quantity), 0);
  const depleted = total <= 0;

  const { data: recipeLinks, error: linkErr } = await sb
    .from("RecipeIngredient")
    .select("recipeId, Recipe(itemId)")
    .eq("ingredientId", ingredientId);
  if (linkErr) sbError(linkErr, "syncAutoOutOfStock/recipes");

  const itemIds = [
    ...new Set(
      (recipeLinks ?? [])
        .map((row) => {
          const recipe = row.Recipe as unknown as { itemId: string } | null;
          return recipe?.itemId;
        })
        .filter(Boolean) as string[],
    ),
  ];
  if (itemIds.length === 0) return;

  if (depleted) {
    const { error } = await sb
      .from("MenuItem")
      .update({ availability: "out_of_stock", autoOutOfStock: true })
      .in("id", itemIds)
      .eq("availability", "available");
    if (error) sbError(error, "syncAutoOutOfStock/deplete");
  } else {
    const { error } = await sb
      .from("MenuItem")
      .update({ availability: "available", autoOutOfStock: false })
      .in("id", itemIds)
      .eq("autoOutOfStock", true);
    if (error) sbError(error, "syncAutoOutOfStock/restock");
  }
}

export async function recomputeRecipeCostsForIngredient(ingredientId: string) {
  const sb = db();
  const { data: recipeLinks, error: linkErr } = await sb
    .from("RecipeIngredient")
    .select("recipeId, Recipe(itemId)")
    .eq("ingredientId", ingredientId);
  if (linkErr) sbError(linkErr, "recomputeRecipeCosts/links");

  const itemIds = [
    ...new Set(
      (recipeLinks ?? [])
        .map((row) => {
          const recipe = row.Recipe as unknown as { itemId: string } | null;
          return recipe?.itemId;
        })
        .filter(Boolean) as string[],
    ),
  ];

  for (const itemId of itemIds) {
    const { data: item, error: itemErr } = await sb
      .from("MenuItem")
      .select("id, basePrice, Recipe(id, RecipeIngredient(quantity, Ingredient(lastUnitPrice)))")
      .eq("id", itemId)
      .maybeSingle();
    if (itemErr) sbError(itemErr, "recomputeRecipeCosts/item");
    if (!item) continue;
    const recipeData = item.Recipe as unknown as
      | {
          RecipeIngredient: { quantity: number; Ingredient: { lastUnitPrice: number } | null }[];
        }
      | null;
    if (!recipeData) continue;

    const cost = (recipeData.RecipeIngredient ?? []).reduce(
      (sum, line) => sum + line.quantity * (line.Ingredient?.lastUnitPrice ?? 0),
      0,
    );
    const { error } = await sb
      .from("MenuItem")
      .update({ recipeCost: cost, grossMargin: calcMargin(item.basePrice as number, cost) })
      .eq("id", itemId);
    if (error) sbError(error, "recomputeRecipeCosts/update");
  }
}
