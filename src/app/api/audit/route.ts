import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const DAY = 86400000;

// Events the operator should be nudged about (F-69/70).
function isHighPriority(action: string, resourceType: string) {
  if (resourceType === "refund") return true;
  if (resourceType === "stock" && action === "update") return true;
  if (resourceType === "role" || resourceType === "user_location_role") return true;
  if (resourceType === "order" && action === "update") return true; // includes manager cancellations
  if (action === "adjust") return true;
  return false;
}

export async function GET(req: NextRequest) {
  const p = req.nextUrl.searchParams;
  const search = p.get("search") ?? "";
  const action = p.get("action");
  const actor = p.get("actor");
  const resourceType = p.get("resource");
  const from = p.get("from");
  const to = p.get("to");

  const createdAt: { gte?: Date; lte?: Date } = {};
  if (from) createdAt.gte = new Date(from);
  if (to) createdAt.lte = new Date(to + "T23:59:59");

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(search && { OR: [{ actorName: { contains: search } }, { resourceType: { contains: search } }, { resourceId: { contains: search } }] }),
      ...(action && { action }),
      ...(actor && { actorName: actor }),
      ...(resourceType && { resourceType }),
      ...(Object.keys(createdAt).length && { createdAt }),
    },
    orderBy: { createdAt: "desc" },
    take: 200,
  });

  // Filter facets.
  const all = await prisma.auditLog.findMany({ select: { actorName: true, action: true, resourceType: true }, take: 1000, orderBy: { createdAt: "desc" } });
  const facets = {
    actors: [...new Set(all.map((a) => a.actorName))].sort(),
    actions: [...new Set(all.map((a) => a.action))].sort(),
    resources: [...new Set(all.map((a) => a.resourceType))].sort(),
  };

  const withPriority = logs.map((l) => ({ ...l, priority: isHighPriority(l.action, l.resourceType) }));
  const highPriority = withPriority.filter((l) => l.priority).slice(0, 10);

  // FSSAI compliance report rows.
  const batches = await prisma.batch.findMany({ include: { ingredient: { include: { stock: { select: { quantity: true } } } }, supplier: { select: { name: true, fssaiLicense: true } } }, orderBy: { expiryDate: "asc" } });
  const fssai = batches.map((b) => {
    const now = Date.now();
    const expiry = b.expiryDate ? new Date(b.expiryDate).getTime() : null;
    const currentStock = b.ingredient.stock.reduce((s, x) => s + x.quantity, 0);
    let flag = "compliant";
    if (!b.supplier?.fssaiLicense || !b.mfgDate || !b.expiryDate) flag = "incomplete";
    else if (expiry && expiry < now) flag = "expired";
    else if (expiry && expiry - now <= 7 * DAY) flag = "approaching";
    return {
      id: b.id, number: b.number, ingredient: b.ingredient.name, supplier: b.supplier?.name ?? null, fssaiLicense: b.supplier?.fssaiLicense ?? null,
      mfgDate: b.mfgDate, expiryDate: b.expiryDate, qtyReceived: b.quantity, currentStock, consumed: Math.max(0, b.quantity - currentStock), flag,
    };
  });

  return NextResponse.json({ logs: withPriority, facets, highPriority, fssai });
}
