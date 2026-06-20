import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  const orderWhere = locationId ? { locationId } : {};
  const stockWhere = locationId ? { locationId } : {};

  const [orders, menuItems, customers, staff, stock] = await Promise.all([
    prisma.order.findMany({
      where: {
        ...orderWhere,
        OR: [
          { number: { contains: q } },
          { tableLabel: { contains: q } },
        ],
      },
      select: { id: true, number: true, status: true, tableLabel: true, total: true },
      orderBy: { createdAt: "desc" },
      take: limit,
    }),
    prisma.menuItem.findMany({
      where: {
        isDeleted: false,
        OR: [
          { name: { contains: q } },
          { description: { contains: q } },
        ],
      },
      select: { id: true, name: true, availability: true, category: { select: { name: true } } },
      orderBy: { name: "asc" },
      take: limit,
    }),
    prisma.customer.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
        ],
      },
      select: { id: true, name: true, phone: true, tier: true },
      orderBy: { name: "asc" },
      take: limit,
    }),
    prisma.user.findMany({
      where: {
        OR: [
          { name: { contains: q } },
          { phone: { contains: q } },
          { email: { contains: q } },
        ],
      },
      select: { id: true, name: true, phone: true, status: true },
      orderBy: { name: "asc" },
      take: limit,
    }),
    prisma.stock.findMany({
      where: stockWhere,
      include: { ingredient: { select: { name: true, unit: true, threshold: true } } },
      take: 50,
    }),
  ]);

  const inventoryMatches = stock
    .filter((s) => s.ingredient.name.toLowerCase().includes(q.toLowerCase()))
    .slice(0, limit);

  const results: SearchResult[] = [
    ...orders.map((o) => ({
      id: o.id,
      type: "order" as const,
      label: o.number,
      sublabel: [o.tableLabel, o.status, `₹${Math.round(o.total)}`].filter(Boolean).join(" · "),
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
