import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit, syncAutoOutOfStock, recomputeRecipeCostsForIngredient } from "@/lib/api-helpers";

const DAY = 86400000;

async function computeDailyUsage(): Promise<Record<string, number>> {
  const since = new Date(Date.now() - 14 * DAY);
  const sb = db();
  const [linksResult, soldResult] = await Promise.all([
    sb.from("RecipeIngredient").select("ingredientId, quantity, recipe:Recipe(itemId)"),
    sb
      .from("OrderItem")
      .select("itemId, quantity, order:Order!inner(createdAt)")
      .gte("order.createdAt", since.toISOString())
      .not("itemId", "is", null),
  ]);
  if (linksResult.error) sbError(linksResult.error, "inventory/recipeLinks");
  if (soldResult.error) sbError(soldResult.error, "inventory/sold");

  const soldByItem = new Map<string, number>();
  for (const row of soldResult.data ?? []) {
    const itemId = row.itemId as string;
    soldByItem.set(itemId, (soldByItem.get(itemId) ?? 0) + Number(row.quantity));
  }
  for (const [itemId, qty] of soldByItem) soldByItem.set(itemId, qty / 14);

  const usage: Record<string, number> = {};
  for (const link of linksResult.data ?? []) {
    const recipe = link.recipe as unknown as { itemId: string } | null;
    if (!recipe) continue;
    const perDay = soldByItem.get(recipe.itemId) ?? 0;
    usage[link.ingredientId as string] = (usage[link.ingredientId as string] ?? 0) + Number(link.quantity) * perDay;
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

async function upsertStock(ingredientId: string, locationId: string, addQty: number) {
  const sb = db();
  const { data: existing, error: findErr } = await sb
    .from("Stock")
    .select("*")
    .eq("ingredientId", ingredientId)
    .eq("locationId", locationId)
    .maybeSingle();
  if (findErr) sbError(findErr, "inventory/upsertStock/find");
  const now = new Date().toISOString();
  if (existing) {
    const { error } = await sb
      .from("Stock")
      .update({ quantity: Number(existing.quantity) + addQty, lastRestocked: now })
      .eq("id", existing.id);
    if (error) sbError(error, "inventory/upsertStock/update");
  } else {
    const { error } = await sb.from("Stock").insert({
      id: crypto.randomUUID(),
      ingredientId,
      locationId,
      quantity: addQty,
      lastRestocked: now,
    });
    if (error) sbError(error, "inventory/upsertStock/insert");
  }
}

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const tab = req.nextUrl.searchParams.get("tab") ?? "stock";
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const sb = db();

  if (tab === "batches") {
    const [batchesResult, ingredientsResult, suppliersResult] = await Promise.all([
      sb
        .from("Batch")
        .select("*, ingredient:Ingredient(*), supplier:Supplier(name, fssaiLicense)")
        .order("expiryDate", { ascending: true }),
      sb.from("Ingredient").select("*").order("name", { ascending: true }),
      sb.from("Supplier").select("*").eq("isActive", true).order("name", { ascending: true }),
    ]);
    if (batchesResult.error) sbError(batchesResult.error, "inventory/batches");
    if (ingredientsResult.error) sbError(ingredientsResult.error, "inventory/ingredients");
    if (suppliersResult.error) sbError(suppliersResult.error, "inventory/suppliers");
    return NextResponse.json({
      batches: (batchesResult.data ?? []).map((b) => ({ ...b, flag: batchFlag(b.expiryDate ? new Date(b.expiryDate as string) : null) })),
      ingredients: ingredientsResult.data ?? [],
      suppliers: suppliersResult.data ?? [],
    });
  }

  if (tab === "wastage") {
    let q = sb
      .from("WastageLog")
      .select("*, ingredient:Ingredient(*), location:Location(name)")
      .order("createdAt", { ascending: false });
    if (locationId) q = q.eq("locationId", locationId);
    const { data, error } = await q;
    if (error) sbError(error, "inventory/wastage");
    return NextResponse.json({ wastage: data ?? [] });
  }

  if (tab === "suppliers") {
    const [suppliersResult, ingredientsResult, poCountsResult] = await Promise.all([
      sb.from("Supplier").select("*").order("name", { ascending: true }),
      sb.from("Ingredient").select("*").order("name", { ascending: true }),
      sb.from("PurchaseOrder").select("supplierId"),
    ]);
    if (suppliersResult.error) sbError(suppliersResult.error, "inventory/suppliers");
    if (ingredientsResult.error) sbError(ingredientsResult.error, "inventory/ingredients");
    if (poCountsResult.error) sbError(poCountsResult.error, "inventory/poCounts");

    const poCountBySupplier = (poCountsResult.data ?? []).reduce<Record<string, number>>((acc, po) => {
      acc[po.supplierId as string] = (acc[po.supplierId as string] ?? 0) + 1;
      return acc;
    }, {});

    const suppliers = await Promise.all(
      (suppliersResult.data ?? []).map(async (s) => {
        const { data: purchaseOrders } = await sb
          .from("PurchaseOrder")
          .select("id, number, status, total, createdAt")
          .eq("supplierId", s.id)
          .order("createdAt", { ascending: false })
          .limit(10);
        return { ...s, _count: { purchaseOrders: poCountBySupplier[s.id as string] ?? 0 }, purchaseOrders: purchaseOrders ?? [] };
      }),
    );
    return NextResponse.json({ suppliers, ingredients: ingredientsResult.data ?? [] });
  }

  if (tab === "pos") {
    let poQ = sb
      .from("PurchaseOrder")
      .select("*, supplier:Supplier(*), location:Location(name), lines:PurchaseOrderLine(*, ingredient:Ingredient(*))")
      .order("createdAt", { ascending: false });
    if (locationId) poQ = poQ.eq("locationId", locationId);
    const [posResult, suppliersResult, ingredientsResult, locationsResult] = await Promise.all([
      poQ,
      sb.from("Supplier").select("*").eq("isActive", true).order("name", { ascending: true }),
      sb.from("Ingredient").select("*").order("name", { ascending: true }),
      sb.from("Location").select("id, name").eq("status", "active").order("name", { ascending: true }),
    ]);
    if (posResult.error) sbError(posResult.error, "inventory/pos");
    if (suppliersResult.error) sbError(suppliersResult.error, "inventory/suppliers");
    if (ingredientsResult.error) sbError(ingredientsResult.error, "inventory/ingredients");
    if (locationsResult.error) sbError(locationsResult.error, "inventory/locations");
    return NextResponse.json({
      purchaseOrders: posResult.data ?? [],
      suppliers: suppliersResult.data ?? [],
      ingredients: ingredientsResult.data ?? [],
      locations: locationsResult.data ?? [],
    });
  }

  if (tab === "transfers") {
    const [transfersResult, locationsResult, ingredientsResult] = await Promise.all([
      sb.from("StockTransfer").select("*").order("createdAt", { ascending: false }),
      sb.from("Location").select("id, name").eq("status", "active").order("name", { ascending: true }),
      sb.from("Ingredient").select("*").order("name", { ascending: true }),
    ]);
    if (transfersResult.error) sbError(transfersResult.error, "inventory/transfers");
    if (locationsResult.error) sbError(locationsResult.error, "inventory/locations");
    if (ingredientsResult.error) sbError(ingredientsResult.error, "inventory/ingredients");
    return NextResponse.json({
      transfers: transfersResult.data ?? [],
      locations: locationsResult.data ?? [],
      ingredients: ingredientsResult.data ?? [],
    });
  }

  if (tab === "trends") {
    const { data, error } = await sb
      .from("Ingredient")
      .select("*, priceHistory:IngredientPriceHistory(*)")
      .order("name", { ascending: true });
    if (error) sbError(error, "inventory/trends");
    const ingredients = (data ?? []).map((ing) => ({
      ...ing,
      priceHistory: ((ing.priceHistory as { recordedAt: string }[]) ?? []).sort(
        (a, b) => new Date(a.recordedAt).getTime() - new Date(b.recordedAt).getTime(),
      ),
    }));
    return NextResponse.json({ ingredients });
  }

  if (tab === "alerts") {
    const { data, error } = await sb.from("Ingredient").select("*, stock:Stock(quantity)").order("name", { ascending: true });
    if (error) sbError(error, "inventory/alerts");
    return NextResponse.json({
      ingredients: (data ?? []).map((i) => ({
        id: i.id,
        name: i.name,
        unit: i.unit,
        threshold: i.threshold,
        alertChannels: i.alertChannels,
        totalStock: ((i.stock as { quantity: number }[]) ?? []).reduce((s, x) => s + Number(x.quantity), 0),
      })),
    });
  }

  let stockQ = sb
    .from("Stock")
    .select("*, ingredient:Ingredient(*), location:Location(id, name)")
    .order("ingredient(name)", { ascending: true });
  if (locationId) stockQ = stockQ.eq("locationId", locationId);

  const [stockResult, usage] = await Promise.all([stockQ, computeDailyUsage()]);
  if (stockResult.error) sbError(stockResult.error, "inventory/stock");

  let stockRows = stockResult.data ?? [];
  if (search) {
    const term = search.toLowerCase();
    stockRows = stockRows.filter((s) => (s.ingredient as { name: string }).name.toLowerCase().includes(term));
  }

  const stock = stockRows.map((s) => {
    const perDay = usage[s.ingredientId as string] ?? 0;
    return {
      ...s,
      dailyUsage: Math.round(perDay * 100) / 100,
      daysToDepletion: perDay > 0.01 ? Math.round(Number(s.quantity) / perDay) : null,
    };
  });
  return NextResponse.json({ stock });
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = db();

    if (body.type === "stock") {
      const { data: current, error: findErr } = await sb.from("Stock").select("*").eq("id", body.id).maybeSingle();
      if (findErr) sbError(findErr, "inventory/stock/find");
      if (!current) return NextResponse.json({ error: "Stock not found" }, { status: 404 });
      const next = body.delta !== undefined ? Number(current.quantity) + Number(body.delta) : Number(body.quantity);
      if (next < 0) return NextResponse.json({ error: "Stock cannot go below zero" }, { status: 400 });
      const { data: stock, error } = await sb
        .from("Stock")
        .update({ quantity: next })
        .eq("id", body.id)
        .select("*, ingredient:Ingredient(*), location:Location(name)")
        .single();
      if (error) sbError(error, "inventory/stock/update");
      await syncAutoOutOfStock(current.ingredientId as string);
      await audit("update", "stock", body.id, { from: current.quantity, to: next, reason: body.reason, note: body.note });
      return NextResponse.json(stock);
    }

    if (body.type === "ingredient") {
      const updates: Record<string, unknown> = {};
      if (body.threshold !== undefined) updates.threshold = Number(body.threshold);
      if (body.alertChannels !== undefined) updates.alertChannels = JSON.stringify(body.alertChannels);
      const { data: ing, error } = await sb.from("Ingredient").update(updates).eq("id", body.id).select().single();
      if (error) sbError(error, "inventory/ingredient/update");
      await audit("update", "ingredient", body.id, body);
      return NextResponse.json(ing);
    }

    if (body.type === "supplier") {
      const { data: supplier, error } = await sb.from("Supplier").update(body.data).eq("id", body.id).select().single();
      if (error) sbError(error, "inventory/supplier/update");
      await audit("update", "supplier", body.id, body.data);
      return NextResponse.json(supplier);
    }

    if (body.type === "receive_po") {
      const { data: po, error: poErr } = await sb.from("PurchaseOrder").select("*, lines:PurchaseOrderLine(*)").eq("id", body.id).single();
      if (poErr) sbError(poErr, "inventory/receive_po/find");
      if (!po) return NextResponse.json({ error: "PO not found" }, { status: 404 });
      if (po.status === "cancelled" || po.status === "received")
        return NextResponse.json({ error: "PO is not open for receiving" }, { status: 400 });

      const recvMap = new Map<string, { receiveQty: number; actualUnitPrice?: number }>(
        (body.lines ?? []).map((l: { id: string; receiveQty: number; actualUnitPrice?: number }) => [l.id, l]),
      );
      const touched = new Set<string>();
      const lines = po.lines as {
        id: string;
        ingredientId: string;
        qtyOrdered: number;
        qtyReceived: number;
        unitPrice: number;
      }[];

      for (const line of lines) {
        const instr = recvMap.get(line.id);
        const remaining = Number(line.qtyOrdered) - Number(line.qtyReceived);
        const qty = instr ? Math.min(Number(instr.receiveQty), remaining) : remaining;
        if (qty <= 0) continue;
        const price = instr?.actualUnitPrice != null ? Number(instr.actualUnitPrice) : Number(line.unitPrice);
        const { error: lineErr } = await sb
          .from("PurchaseOrderLine")
          .update({ qtyReceived: Number(line.qtyReceived) + qty, unitPrice: price })
          .eq("id", line.id);
        if (lineErr) sbError(lineErr, "inventory/receive_po/line");
        await upsertStock(line.ingredientId, po.locationId as string, qty);
        const { error: ingErr } = await sb.from("Ingredient").update({ lastUnitPrice: price }).eq("id", line.ingredientId);
        if (ingErr) sbError(ingErr, "inventory/receive_po/ingredient");
        const { error: histErr } = await sb.from("IngredientPriceHistory").insert({
          id: crypto.randomUUID(),
          ingredientId: line.ingredientId,
          unitPrice: price,
          supplierName: null,
        });
        if (histErr) sbError(histErr, "inventory/receive_po/history");
        touched.add(line.ingredientId);
      }

      const { data: freshLines, error: freshErr } = await sb
        .from("PurchaseOrderLine")
        .select("*")
        .eq("purchaseOrderId", po.id);
      if (freshErr) sbError(freshErr, "inventory/receive_po/freshLines");
      const fully = (freshLines ?? []).every((l) => Number(l.qtyReceived) >= Number(l.qtyOrdered));
      const { error: poUpdateErr } = await sb
        .from("PurchaseOrder")
        .update({ status: fully ? "received" : "partially_received", updatedAt: new Date().toISOString() })
        .eq("id", po.id);
      if (poUpdateErr) sbError(poUpdateErr, "inventory/receive_po/status");

      for (const ingredientId of touched) {
        await recomputeRecipeCostsForIngredient(ingredientId);
        await syncAutoOutOfStock(ingredientId);
      }
      await audit("receive", "purchase_order", body.id, { partial: !!body.lines });
      return NextResponse.json({ ok: true });
    }

    if (body.type === "transfer") {
      const { data: t, error: findErr } = await sb.from("StockTransfer").select("*").eq("id", body.id).maybeSingle();
      if (findErr) sbError(findErr, "inventory/transfer/find");
      if (!t) return NextResponse.json({ error: "Transfer not found" }, { status: 404 });

      if (body.action === "approve") {
        const { error } = await sb.from("StockTransfer").update({ status: "approved" }).eq("id", body.id);
        if (error) sbError(error, "inventory/transfer/approve");
      } else if (body.action === "reject") {
        const { error } = await sb.from("StockTransfer").update({ status: "rejected" }).eq("id", body.id);
        if (error) sbError(error, "inventory/transfer/reject");
      } else if (body.action === "receive") {
        const { data: fromStock } = await sb
          .from("Stock")
          .select("*")
          .eq("ingredientId", t.ingredientId)
          .eq("locationId", t.fromLocationId)
          .maybeSingle();
        if (fromStock) {
          const { error } = await sb
            .from("Stock")
            .update({ quantity: Number(fromStock.quantity) - Number(t.quantity) })
            .eq("id", fromStock.id);
          if (error) sbError(error, "inventory/transfer/decrement");
        }
        await upsertStock(t.ingredientId as string, t.toLocationId as string, Number(t.quantity));
        const { error } = await sb.from("StockTransfer").update({ status: "received" }).eq("id", body.id);
        if (error) sbError(error, "inventory/transfer/receive");
        await syncAutoOutOfStock(t.ingredientId as string);
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
    const sb = db();

    if (body.type === "wastage") {
      const { data: ingredient, error: ingErr } = await sb
        .from("Ingredient")
        .select("lastUnitPrice")
        .eq("id", body.ingredientId)
        .maybeSingle();
      if (ingErr) sbError(ingErr, "inventory/wastage/ingredient");
      const qty = Number(body.quantity);
      const estCost = Number(body.estCost) || qty * Number(ingredient?.lastUnitPrice ?? 0);
      const { data: log, error } = await sb
        .from("WastageLog")
        .insert({
          id: crypto.randomUUID(),
          ingredientId: body.ingredientId,
          locationId: body.locationId,
          quantity: qty,
          reason: body.reason,
          staffName: body.staffName ?? "Admin",
          estCost,
        })
        .select("*, ingredient:Ingredient(*), location:Location(name)")
        .single();
      if (error) sbError(error, "inventory/wastage/create");
      const { data: stock } = await sb
        .from("Stock")
        .select("*")
        .eq("ingredientId", body.ingredientId)
        .eq("locationId", body.locationId)
        .maybeSingle();
      if (stock) {
        const { error: stockErr } = await sb
          .from("Stock")
          .update({ quantity: Math.max(0, Number(stock.quantity) - qty) })
          .eq("id", stock.id);
        if (stockErr) sbError(stockErr, "inventory/wastage/stock");
        await syncAutoOutOfStock(body.ingredientId);
      }
      await audit("create", "wastage", log.id, log);
      return NextResponse.json(log, { status: 201 });
    }

    if (body.type === "supplier") {
      const { data: supplier, error } = await sb
        .from("Supplier")
        .insert({ id: crypto.randomUUID(), ...body.data })
        .select()
        .single();
      if (error) sbError(error, "inventory/supplier/create");
      await audit("create", "supplier", supplier.id, supplier);
      return NextResponse.json(supplier, { status: 201 });
    }

    if (body.type === "batch") {
      const loc = (body.locationCode ?? "MAIN").toString().toUpperCase().slice(0, 4);
      const datePart = new Date().toISOString().slice(0, 10).replace(/-/g, "");
      const { count } = await sb.from("Batch").select("*", { count: "exact", head: true });
      const seq = (count ?? 0) + 1;
      const { data: batch, error } = await sb
        .from("Batch")
        .insert({
          id: crypto.randomUUID(),
          number: body.number ?? `RECV-${loc}-${datePart}-${String(seq).padStart(3, "0")}`,
          ingredientId: body.ingredientId,
          supplierId: body.supplierId || null,
          mfgDate: body.mfgDate ? new Date(body.mfgDate).toISOString() : null,
          expiryDate: body.expiryDate ? new Date(body.expiryDate).toISOString() : null,
          quantity: Number(body.quantity) || 0,
          status: "active",
        })
        .select()
        .single();
      if (error) sbError(error, "inventory/batch/create");
      await audit("create", "batch", batch.id, batch);
      return NextResponse.json(batch, { status: 201 });
    }

    if (body.type === "po") {
      const { count } = await sb.from("PurchaseOrder").select("*", { count: "exact", head: true });
      const lines = (body.lines ?? []).filter((l: { ingredientId: string }) => l.ingredientId);
      const total = lines.reduce(
        (s: number, l: { qtyOrdered: number; unitPrice: number }) => s + Number(l.qtyOrdered) * Number(l.unitPrice),
        0,
      );
      const poId = crypto.randomUUID();
      const now = new Date().toISOString();
      const { error: poErr } = await sb.from("PurchaseOrder").insert({
        id: poId,
        number: body.number ?? `PO-MAIN-${String((count ?? 0) + 1).padStart(3, "0")}`,
        supplierId: body.supplierId,
        locationId: body.locationId,
        status: body.status ?? "submitted",
        total,
        updatedAt: now,
      });
      if (poErr) sbError(poErr, "inventory/po/create");
      if (lines.length) {
        const { error: linesErr } = await sb.from("PurchaseOrderLine").insert(
          lines.map((l: { ingredientId: string; qtyOrdered: number; unitPrice: number }) => ({
            id: crypto.randomUUID(),
            purchaseOrderId: poId,
            ingredientId: l.ingredientId,
            qtyOrdered: Number(l.qtyOrdered),
            unitPrice: Number(l.unitPrice),
          })),
        );
        if (linesErr) sbError(linesErr, "inventory/po/lines");
      }
      const { data: po, error } = await sb
        .from("PurchaseOrder")
        .select("*, supplier:Supplier(*), lines:PurchaseOrderLine(*, ingredient:Ingredient(*))")
        .eq("id", poId)
        .single();
      if (error) sbError(error, "inventory/po/fetch");
      await audit("create", "purchase_order", po.id, po);
      return NextResponse.json(po, { status: 201 });
    }

    if (body.type === "transfer") {
      const { data: transfer, error } = await sb
        .from("StockTransfer")
        .insert({
          id: crypto.randomUUID(),
          fromLocationId: body.fromLocationId,
          fromName: body.fromName,
          toLocationId: body.toLocationId,
          toName: body.toName,
          ingredientId: body.ingredientId,
          ingredientName: body.ingredientName,
          quantity: Number(body.quantity),
          reason: body.reason || null,
          status: "requested",
        })
        .select()
        .single();
      if (error) sbError(error, "inventory/transfer/create");
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
    const sb = db();
    if (type === "supplier") {
      const { error } = await sb.from("Supplier").update({ isActive: false }).eq("id", id);
      if (error) sbError(error, "inventory/deleteSupplier");
    } else if (type === "po") {
      const { data: po, error: findErr } = await sb.from("PurchaseOrder").select("status").eq("id", id).maybeSingle();
      if (findErr) sbError(findErr, "inventory/deletePo/find");
      if (po && (po.status === "received" || po.status === "partially_received"))
        return NextResponse.json({ error: "Cannot cancel a received PO" }, { status: 400 });
      const { error } = await sb.from("PurchaseOrder").update({ status: "cancelled", updatedAt: new Date().toISOString() }).eq("id", id);
      if (error) sbError(error, "inventory/deletePo");
    }
    await audit("delete", type ?? "inventory", id);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
