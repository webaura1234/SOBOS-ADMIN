import { prisma } from "@/lib/prisma";

export async function getRestaurantId() {
  const r = await prisma.restaurant.findFirst({ select: { id: true } });
  if (!r) throw new Error("No restaurant found");
  return r.id;
}

export async function audit(
  action: string,
  resourceType: string,
  resourceId: string | null,
  after?: unknown,
  before?: unknown
) {
  await prisma.auditLog.create({
    data: {
      actorName: "Rajesh Kumar",
      action,
      resourceType,
      resourceId,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: after ? JSON.stringify(after) : null,
    },
  });
}

export function calcMargin(price: number, cost: number) {
  if (price <= 0) return 0;
  return Math.round(((price - cost) / price) * 1000) / 10;
}

/**
 * When an ingredient's stock at any location drops to/below zero, auto-flag the
 * menu items whose recipe uses it as Out of Stock (F-13). When it is replenished,
 * restore items that were auto-flagged (admins can still override manually).
 */
export async function syncAutoOutOfStock(ingredientId: string) {
  const totalStock = await prisma.stock.aggregate({ _sum: { quantity: true }, where: { ingredientId } });
  const depleted = (totalStock._sum.quantity ?? 0) <= 0;
  const recipeLinks = await prisma.recipeIngredient.findMany({ where: { ingredientId }, select: { recipe: { select: { itemId: true } } } });
  const itemIds = [...new Set(recipeLinks.map((r) => r.recipe.itemId))];
  if (itemIds.length === 0) return;
  if (depleted) {
    await prisma.menuItem.updateMany({
      where: { id: { in: itemIds }, availability: "available" },
      data: { availability: "out_of_stock", autoOutOfStock: true },
    });
  } else {
    await prisma.menuItem.updateMany({
      where: { id: { in: itemIds }, autoOutOfStock: true },
      data: { availability: "available", autoOutOfStock: false },
    });
  }
}

/**
 * Recompute recipe cost + gross margin for every item using an ingredient, after
 * its unit price changes (e.g. PO received). recipeCost = Σ(qty × latest unit price).
 */
export async function recomputeRecipeCostsForIngredient(ingredientId: string) {
  const recipes = await prisma.recipeIngredient.findMany({ where: { ingredientId }, select: { recipe: { select: { itemId: true } } } });
  const itemIds = [...new Set(recipes.map((r) => r.recipe.itemId))];
  for (const itemId of itemIds) {
    const item = await prisma.menuItem.findUnique({ where: { id: itemId }, include: { recipe: { include: { ingredients: { include: { ingredient: true } } } } } });
    if (!item?.recipe) continue;
    const cost = item.recipe.ingredients.reduce((sum, line) => sum + line.quantity * (line.ingredient.lastUnitPrice || 0), 0);
    await prisma.menuItem.update({ where: { id: itemId }, data: { recipeCost: cost, grossMargin: calcMargin(item.basePrice, cost) } });
  }
}
