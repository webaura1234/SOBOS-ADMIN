import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";

export interface SearchResult {
  id: string;
  type: "order" | "menu" | "customer" | "staff" | "inventory";
  label: string;
  sublabel?: string;
  href: string;
}

export async function GET(req: NextRequest) {
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  const locationId = req.nextUrl.searchParams.get("locationId");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 8), 20);

  if (q.length < 2) {
    return NextResponse.json({ results: [] as SearchResult[] });
  }

  const sb = db();
  const pattern = `%${q}%`;

  const [ordersResult, menuResult, customersResult, staffResult, stockResult] = await Promise.all([
    (async () => {
      let query = sb
        .from("Order")
        .select("id, number, status, tableLabel, total")
        .or(`number.ilike.${pattern},tableLabel.ilike.${pattern}`)
        .order("createdAt", { ascending: false })
        .limit(limit);
      if (locationId) query = query.eq("locationId", locationId);
      const { data, error } = await query;
      if (error) sbError(error, "search/orders");
      return data ?? [];
    })(),
    sb
      .from("MenuItem")
      .select("id, name, availability, category:MenuCategory(name)")
      .eq("isDeleted", false)
      .or(`name.ilike.${pattern},description.ilike.${pattern}`)
      .order("name", { ascending: true })
      .limit(limit),
    sb
      .from("Customer")
      .select("id, name, phone, tier")
      .or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
      .order("name", { ascending: true })
      .limit(limit),
    sb
      .from("User")
      .select("id, name, phone, status")
      .or(`name.ilike.${pattern},phone.ilike.${pattern},email.ilike.${pattern}`)
      .order("name", { ascending: true })
      .limit(limit),
    (async () => {
      let query = sb.from("Stock").select("*, ingredient:Ingredient(name, unit, threshold)").limit(50);
      if (locationId) query = query.eq("locationId", locationId);
      const { data, error } = await query;
      if (error) sbError(error, "search/stock");
      return data ?? [];
    })(),
  ]);

  if (menuResult.error) sbError(menuResult.error, "search/menu");
  if (customersResult.error) sbError(customersResult.error, "search/customers");
  if (staffResult.error) sbError(staffResult.error, "search/staff");

  const orders = ordersResult;
  const menuItems = (menuResult.data ?? []) as unknown as {
    id: string;
    name: string;
    availability: string;
    category: { name: string } | null;
  }[];
  const customers = customersResult.data ?? [];
  const staff = staffResult.data ?? [];
  const stock = stockResult as {
    id: string;
    quantity: number;
    ingredient: { name: string; unit: string; threshold: number };
  }[];

  const inventoryMatches = stock
    .filter((s) => s.ingredient.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, limit);

  const results: SearchResult[] = [
    ...orders.map((o) => ({
      id: o.id,
      type: "order" as const,
      label: o.number,
      sublabel: [o.tableLabel, o.status, `₹${Math.round(Number(o.total))}`].filter(Boolean).join(" · "),
      href: `/orders?open=${o.id}`,
    })),
    ...menuItems.map((m) => ({
      id: m.id,
      type: "menu" as const,
      label: m.name,
      sublabel: [m.category?.name, m.availability].filter(Boolean).join(" · "),
      href: `/menu?open=${m.id}`,
    })),
    ...customers.map((c) => ({
      id: c.id,
      type: "customer" as const,
      label: c.name,
      sublabel: [c.phone, c.tier].filter(Boolean).join(" · "),
      href: `/customers?open=${c.id}`,
    })),
    ...staff.map((s) => ({
      id: s.id,
      type: "staff" as const,
      label: s.name,
      sublabel: [s.phone, s.status].filter(Boolean).join(" · "),
      href: `/staff?open=${s.id}`,
    })),
    ...inventoryMatches.map((s) => ({
      id: s.id,
      type: "inventory" as const,
      label: s.ingredient.name,
      sublabel: `${s.quantity} ${s.ingredient.unit}${s.quantity <= s.ingredient.threshold ? " · low stock" : ""}`,
      href: `/inventory?search=${encodeURIComponent(s.ingredient.name)}`,
    })),
  ];

  return NextResponse.json({ results: results.slice(0, limit * 2) });
}
