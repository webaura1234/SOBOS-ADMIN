import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";

const DAY = 86400000;

function isHighPriority(action: string, resourceType: string) {
  if (resourceType === "refund") return true;
  if (resourceType === "stock" && action === "update") return true;
  if (resourceType === "role" || resourceType === "user_location_role") return true;
  if (resourceType === "order" && action === "update") return true;
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
  const sb = db();

  let q = sb.from("AuditLog").select("*").order("createdAt", { ascending: false }).limit(200);
  if (action) q = q.eq("action", action);
  if (actor) q = q.eq("actorName", actor);
  if (resourceType) q = q.eq("resourceType", resourceType);
  if (from) q = q.gte("createdAt", new Date(from).toISOString());
  if (to) q = q.lte("createdAt", new Date(to + "T23:59:59").toISOString());
  if (search) q = q.or(`actorName.ilike.%${search}%,resourceType.ilike.%${search}%,resourceId.ilike.%${search}%`);

  const { data: logs, error } = await q;
  if (error) sbError(error, "audit/logs");

  const { data: all, error: facetErr } = await sb
    .from("AuditLog")
    .select("actorName, action, resourceType")
    .order("createdAt", { ascending: false })
    .limit(1000);
  if (facetErr) sbError(facetErr, "audit/facets");

  const facets = {
    actors: [...new Set((all ?? []).map((a) => a.actorName))].sort(),
    actions: [...new Set((all ?? []).map((a) => a.action))].sort(),
    resources: [...new Set((all ?? []).map((a) => a.resourceType))].sort(),
  };

  const withPriority = (logs ?? []).map((l) => ({ ...l, priority: isHighPriority(l.action, l.resourceType) }));
  const highPriority = withPriority.filter((l) => l.priority).slice(0, 10);

  const { data: batches, error: batchErr } = await sb
    .from("Batch")
    .select("*, ingredient:Ingredient(*, stock:Stock(quantity)), supplier:Supplier(name, fssaiLicense)")
    .order("expiryDate", { ascending: true });
  if (batchErr) sbError(batchErr, "audit/batches");

  const fssai = (batches ?? []).map((b) => {
    const ingredient = b.ingredient as { name: string; stock: { quantity: number }[] };
    const supplier = b.supplier as { name: string; fssaiLicense: string } | null;
    const now = Date.now();
    const expiry = b.expiryDate ? new Date(b.expiryDate as string).getTime() : null;
    const currentStock = (ingredient.stock ?? []).reduce((s, x) => s + Number(x.quantity), 0);
    let flag = "compliant";
    if (!supplier?.fssaiLicense || !b.mfgDate || !b.expiryDate) flag = "incomplete";
    else if (expiry && expiry < now) flag = "expired";
    else if (expiry && expiry - now <= 7 * DAY) flag = "approaching";
    return {
      id: b.id,
      number: b.number,
      ingredient: ingredient.name,
      supplier: supplier?.name ?? null,
      fssaiLicense: supplier?.fssaiLicense ?? null,
      mfgDate: b.mfgDate,
      expiryDate: b.expiryDate,
      qtyReceived: b.quantity,
      currentStock,
      consumed: Math.max(0, Number(b.quantity) - currentStock),
      flag,
    };
  });

  return NextResponse.json({ logs: withPriority, facets, highPriority, fssai });
}
