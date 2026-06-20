import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const tab = req.nextUrl.searchParams.get("tab") ?? "stock";
  const search = req.nextUrl.searchParams.get("search") ?? "";

  if (tab === "batches") {
    const batches = await prisma.batch.findMany({
      include: { ingredient: true, supplier: { select: { name: true } } },
      orderBy: { expiryDate: "asc" },
    });
    return NextResponse.json({ batches });
  }

  if (tab === "wastage") {
    const wastage = await prisma.wastageLog.findMany({
      where: locationId ? { locationId } : {},
      include: { ingredient: true, location: { select: { name: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ wastage });
  }

  if (tab === "suppliers") {
    const suppliers = await prisma.supplier.findMany({ orderBy: { name: "asc" } });
    return NextResponse.json({ suppliers });
  }

  if (tab === "pos") {
    const pos = await prisma.purchaseOrder.findMany({
      where: locationId ? { locationId } : {},
      include: { supplier: true, lines: { include: { ingredient: true } } },
      orderBy: { createdAt: "desc" },
    });
    return NextResponse.json({ purchaseOrders: pos });
  }

  const stock = await prisma.stock.findMany({
    where: {
      ...(locationId && { locationId }),
      ...(search && { ingredient: { name: { contains: search } } }),
    },
    include: { ingredient: true, location: { select: { id: true, name: true } } },
    orderBy: { ingredient: { name: "asc" } },
  });
  return NextResponse.json({ stock });
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.type === "stock") {
      const stock = await prisma.stock.update({
        where: { id: body.id },
        data: { quantity: Number(body.quantity) },
        include: { ingredient: true, location: { select: { name: true } } },
      });
      await audit("update", "stock", body.id, { quantity: body.quantity, reason: body.reason });
      return NextResponse.json(stock);
    }
    if (body.type === "supplier") {
      const supplier = await prisma.supplier.update({ where: { id: body.id }, data: body.data });
      await audit("update", "supplier", body.id, body.data);
      return NextResponse.json(supplier);
    }
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.type === "wastage") {
      const log = await prisma.wastageLog.create({
        data: {
          ingredientId: body.ingredientId,
          locationId: body.locationId,
          quantity: Number(body.quantity),
          reason: body.reason,
          staffName: body.staffName ?? "Admin",
          estCost: Number(body.estCost) || 0,
        },
        include: { ingredient: true, location: { select: { name: true } } },
      });
      await audit("create", "wastage", log.id, log);
      return NextResponse.json(log, { status: 201 });
    }
    if (body.type === "supplier") {
      const supplier = await prisma.supplier.create({ data: body.data });
      await audit("create", "supplier", supplier.id, supplier);
      return NextResponse.json(supplier, { status: 201 });
    }
    if (body.type === "po") {
      const count = await prisma.purchaseOrder.count();
      const po = await prisma.purchaseOrder.create({
        data: {
          number: body.number ?? `PO-MAIN-${String(count + 1).padStart(3, "0")}`,
          supplierId: body.supplierId,
          locationId: body.locationId,
          status: "draft",
          total: Number(body.total) || 0,
          lines: body.lines ? { create: body.lines } : undefined,
        },
        include: { supplier: true, lines: true },
      });
      await audit("create", "purchase_order", po.id, po);
      return NextResponse.json(po, { status: 201 });
    }
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const type = req.nextUrl.searchParams.get("type");
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (type === "supplier") {
      await prisma.supplier.update({ where: { id }, data: { isActive: false } });
    } else if (type === "po") {
      await prisma.purchaseOrder.update({ where: { id }, data: { status: "cancelled" } });
    }
    await audit("delete", type ?? "inventory", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
