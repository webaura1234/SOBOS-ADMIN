import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, syncAutoOutOfStock, recomputeRecipeCostsForIngredient } from "@/lib/api-helpers";

const DAY = 86400000;

/** Estimated daily usage per ingredient from the last 14 days of order consumption. */
async function computeDailyUsage(): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 14 * DAY);
  const [recipeLinks, sold] = await Promise.all([
    prisma.recipeIngredient.findMany({ select: { ingredientId: true, quantity: true, recipe: { select: { itemId: true } } } }),
    prisma.orderItem.groupBy({ by: ["itemId"], _sum: { quantity: true }, where: { order: { createdAt: { gte: since } }, itemId: { not: null } } }),
  ]);
  const soldByItem = new Map(sold.map((s) => [s.itemId, (s._sum.quantity ?? 0) / 14]));
  const usage: Record<string, number> = {};
  for (const link of recipeLinks) {
    const perDay = soldByItem.get(link.recipe.itemId) ?? 0;
    usage[link.ingredientId] = (usage[link.ingredientId] ?? 0) + link.quantity * perDay;
  }
  return usage;
}

function batchFlag(expiry: Date | null): string {
  if (!expiry) return "ok";
  const days = (expiry.getTime() - Date.now()) / DAY;
  if (days < 0) return "expired";
  if (days <= 7) return "approaching";
  return "ok";
}

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const tab = req.nextUrl.searchParams.get("tab") ?? "stock";
  const search = req.nextUrl.searchParams.get("search") ?? "";

  if (tab === "batches") {
    const batches = await prisma.batch.findMany({
      include: { ingredient: true, supplier: { select: { name: true, fssaiLicense: true } } },
      orderBy: { expiryDate: "asc" }, // FIFO by expiry
    });
    const ingredients = await prisma.ingredient.findMany({ orderBy: { name: "asc" } });
    const suppliers = await prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } });
    return NextResponse.json({ batches: batches.map((b) => ({ ...b, flag: batchFlag(b.expiryDate) })), ingredients, suppliers });
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
    const [suppliers, ingredients] = await Promise.all([
      prisma.supplier.findMany({ orderBy: { name: "asc" }, include: { _count: { select: { purchaseOrders: true } }, purchaseOrders: { select: { id: true, number: true, status: true, total: true, createdAt: true }, orderBy: { createdAt: "desc" }, take: 10 } } }),
      prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ suppliers, ingredients });
  }

  if (tab === "pos") {
    const [pos, suppliers, ingredients, locations] = await Promise.all([
      prisma.purchaseOrder.findMany({ where: locationId ? { locationId } : {}, include: { supplier: true, location: { select: { name: true } }, lines: { include: { ingredient: true } } }, orderBy: { createdAt: "desc" } }),
      prisma.supplier.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
      prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
      prisma.location.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ purchaseOrders: pos, suppliers, ingredients, locations });
  }

  if (tab === "transfers") {
    const [transfers, locations, ingredients] = await Promise.all([
      prisma.stockTransfer.findMany({ orderBy: { createdAt: "desc" } }),
      prisma.location.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.ingredient.findMany({ orderBy: { name: "asc" } }),
    ]);
    return NextResponse.json({ transfers, locations, ingredients });
  }

  if (tab === "trends") {
    const ingredients = await prisma.ingredient.findMany({ orderBy: { name: "asc" }, include: { priceHistory: { orderBy: { recordedAt: "asc" } } } });
    return NextResponse.json({ ingredients });
  }

  if (tab === "alerts") {
    const ingredients = await prisma.ingredient.findMany({ orderBy: { name: "asc" }, include: { stock: { select: { quantity: true } } } });
    return NextResponse.json({
      ingredients: ingredients.map((i) => ({ id: i.id, name: i.name, unit: i.unit, threshold: i.threshold, alertChannels: i.alertChannels, totalStock: i.stock.reduce((s, x) => s + x.quantity, 0) })),
    });
  }

  const [stockRows, usage] = await Promise.all([
    prisma.stock.findMany({
      where: { ...(locationId && { locationId }), ...(search && { ingredient: { name: { contains: search } } }) },
      include: { ingredient: true, location: { select: { id: true, name: true } } },
      orderBy: { ingredient: { name: "asc" } },
    }),
    computeDailyUsage(),
  ]);
  const stock = stockRows.map((s) => {
    const perDay = usage[s.ingredientId] ?? 0;
    return { ...s, dailyUsage: Math.round(perDay * 100) / 100, daysToDepletion: perDay > 0.01 ? Math.round(s.quantity / perDay) : null };
  });
  return NextResponse.json({ stock });
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.type === "stock") {
      const current = await prisma.stock.findUnique({ where: { id: body.id } });
      if (!current) return NextResponse.json({ error: "Stock not found" }, { status: 404 });
      const next = body.delta !== undefined ? current.quantity + Number(body.delta) : Number(body.quantity);
      if (next < 0) return NextResponse.json({ error: "Stock cannot go below zero" }, { status: 400 });
      const stock = await prisma.stock.update({ where: { id: body.id }, data: { quantity: next }, include: { ingredient: true, location: { select: { name: true } } } });
      await syncAutoOutOfStock(current.ingredientId);
      await audit("update", "stock", body.id, { from: current.quantity, to: next, reason: body.reason, note: body.note });
      return NextResponse.json(stock);
    }

    if (body.type === "ingredient") {
      const ing = await prisma.ingredient.update({ where: { id: body.id }, data: { ...(body.threshold !== undefined && { threshold: Number(body.threshold) }), ...(body.alertChannels !== undefined && { alertChannels: JSON.stringify(body.alertChannels) }) } });
      await audit("update", "ingredient", body.id, body);
      return NextResponse.json(ing);
    }

    if (body.type === "supplier") {
      const supplier = await prisma.supplier.update({ where: { id: body.id }, data: body.data });
      await audit("update", "supplier", body.id, body.data);
      return NextResponse.json(supplier);
    }

    if (body.type === "receive_po") {
      const po = await prisma.purchaseOrder.findUnique({ where: { id: body.id }, include: { lines: true } });
      if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
      if (po.status === "cancelled" || po.status === "received") return NextResponse.json({ error: "PO is not open for receiving" }, { status: 400 });
      // body.lines: optional [{ id, receiveQty, actualUnitPrice }]; default = receive remaining at expected price.
      const recvMap = new Map<string, { receiveQty: number; actualUnitPrice?: number }>((body.lines ?? []).map((l: { id: string; receiveQty: number; actualUnitPrice?: number }) => [l.id, l]));
      const touched = new Set<string>();
      await prisma.$transaction(async (tx) => {
        for (const line of po.lines) {
          const instr = recvMap.get(line.id);
          const remaining = line.qtyOrdered - line.qtyReceived;
          const qty = instr ? Math.min(Number(instr.receiveQty), remaining) : remaining;
          if (qty <= 0) continue;
          const price = instr?.actualUnitPrice != null ? Number(instr.actualUnitPrice) : line.unitPrice;
          await tx.purchaseOrderLine.update({ where: { id: line.id }, data: { qtyReceived: line.qtyReceived + qty, unitPrice: price } });
          await tx.stock.upsert({
            where: { ingredientId_locationId: { ingredientId: line.ingredientId, locationId: po.locationId } },
            update: { quantity: { increment: qty }, lastRestocked: new Date() },
            create: { ingredientId: line.ingredientId, locationId: po.locationId, quantity: qty, lastRestocked: new Date() },
          });
          await tx.ingredient.update({ where: { id: line.ingredientId }, data: { lastUnitPrice: price } });
          await tx.ingredientPriceHistory.create({ data: { ingredientId: line.ingredientId, unitPrice: price, supplierName: undefined } });
          touched.add(line.ingredientId);
        }
        const fresh = await tx.purchaseOrderLine.findMany({ where: { purchaseOrderId: po.id } });
        const fully = fresh.every((l) => l.qtyReceived >= l.qtyOrdered);
        await tx.purchaseOrder.update({ where: { id: po.id }, data: { status: fully ? "received" : "partially_received" } });
      });
      for (const ingredientId of touched) { await recomputeRecipeCostsForIngredient(ingredientId); await syncAutoOutOfStock(ingredientId); }
      await audit("receive", "purchase_order", body.id, { partial: !!body.lines });
      return NextResponse.json({ ok: true });
    }

    if (body.type === "transfer") {
      const t = await prisma.stockTransfer.findUnique({ where: { id: body.id } });
      if (!t) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
      if (body.action === "approve") {
        await prisma.stockTransfer.update({ where: { id: body.id }, data: { status: "approved" } });
      } else if (body.action === "reject") {
        await prisma.stockTransfer.update({ where: { id: body.id }, data: { status: "rejected" } });
      } else if (body.action === "receive") {
        await prisma.$transaction(async (tx) => {
          await tx.stock.updateMany({ where: { ingredientId: t.ingredientId, locationId: t.fromLocationId }, data: { quantity: { decrement: t.quantity } } });
          await tx.stock.upsert({
            where: { ingredientId_locationId: { ingredientId: t.ingredientId, locationId: t.toLocationId } },
            update: { quantity: { increment: t.quantity }, lastRestocked: new Date() },
            create: { ingredientId: t.ingredientId, locationId: t.toLocationId, quantity: t.quantity, lastRestocked: new Date() },
          });
          await tx.stockTransfer.update({ where: { id: body.id }, data: { status: "received" } });
        });
        await syncAutoOutOfStock(t.ingredientId);
      }
      await audit("update", "stock_transfer", body.id, { action: body.action });
      return NextResponse.json({ ok: true });
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
      const ingredient = await prisma.ingredient.findUnique({ where: { id: body.ingredientId } });
      const qty = Number(body.quantity);
      const estCost = Number(body.estCost) || qty * (ingredient?.lastUnitPrice ?? 0);
      const log = await prisma.wastageLog.create({
        data: { ingredientId: body.ingredientId, locationId: body.locationId, quantity: qty, reason: body.reason, staffName: body.staffName ?? "Admin", estCost },
        include: { ingredient: true, location: { select: { name: true } } },
      });
      // Wastage depletes stock.
      const stock = await prisma.stock.findUnique({ where: { ingredientId_locationId: { ingredientId: body.ingredientId, locationId: body.locationId } } });
      if (stock) { await prisma.stock.update({ where: { id: stock.id }, data: { quantity: Math.max(0, stock.quantity - qty) } }); await syncAutoOutOfStock(body.ingredientId); }
      await audit("create", "wastage", log.id, log);
      return NextResponse.json(log, { status: 201 });
    }

    if (body.type === "supplier") {
      const supplier = await prisma.supplier.create({ data: body.data });
      await audit("create", "supplier", supplier.id, supplier);
      return NextResponse.json(supplier, { status: 201 });
    }

    if (body.type === "batch") {
      const loc = (body.locationCode ?? "MAIN").toString().toUpperCase().slice(0, 4);
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const seq = (await prisma.batch.count()) + 1;
      const batch = await prisma.batch.create({
        data: {
          number: body.number ?? `RECV-${loc}-${datePart}-${String(seq).padStart(3, "0")}`,
          ingredientId: body.ingredientId, supplierId: body.supplierId || null,
          mfgDate: body.mfgDate ? new Date(body.mfgDate) : null, expiryDate: body.expiryDate ? new Date(body.expiryDate) : null,
          quantity: Number(body.quantity) || 0, status: "active",
        },
      });
      await audit("create", "batch", batch.id, batch);
      return NextResponse.json(batch, { status: 201 });
    }

    if (body.type === "po") {
      const count = await prisma.purchaseOrder.count();
      const lines = (body.lines ?? []).filter((l: { ingredientId: string }) => l.ingredientId);
      const total = lines.reduce((s: number, l: { qtyOrdered: number; unitPrice: number }) => s + Number(l.qtyOrdered) * Number(l.unitPrice), 0);
      const po = await prisma.purchaseOrder.create({
        data: {
          number: body.number ?? `PO-MAIN-${String(count + 1).padStart(3, "0")}`,
          supplierId: body.supplierId, locationId: body.locationId, status: body.status ?? "submitted", total,
          lines: { create: lines.map((l: { ingredientId: string; qtyOrdered: number; unitPrice: number }) => ({ ingredientId: l.ingredientId, qtyOrdered: Number(l.qtyOrdered), unitPrice: Number(l.unitPrice) })) },
        },
        include: { supplier: true, lines: { include: { ingredient: true } } },
      });
      await audit("create", "purchase_order", po.id, po);
      return NextResponse.json(po, { status: 201 });
    }

    if (body.type === "transfer") {
      const transfer = await prisma.stockTransfer.create({
        data: {
          fromLocationId: body.fromLocationId, fromName: body.fromName, toLocationId: body.toLocationId, toName: body.toName,
          ingredientId: body.ingredientId, ingredientName: body.ingredientName, quantity: Number(body.quantity), reason: body.reason || null, status: "requested",
        },
      });
      await audit("create", "stock_transfer", transfer.id, transfer);
      return NextResponse.json(transfer, { status: 201 });
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
      const po = await prisma.purchaseOrder.findUnique({ where: { id } });
      if (po && (po.status === "received" || po.status === "partially_received")) return NextResponse.json({ error: "Cannot cancel a received PO" }, { status: 400 });
      await prisma.purchaseOrder.update({ where: { id }, data: { status: "cancelled" } });
    }
    await audit("delete", type ?? "inventory", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
