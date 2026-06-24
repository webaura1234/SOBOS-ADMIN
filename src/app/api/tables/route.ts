import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const status = req.nextUrl.searchParams.get("status");

  // Allocation suggestion: best available table for a party size (F-42).
  const allocateFor = req.nextUrl.searchParams.get("allocateFor");
  if (allocateFor) {
    const party = Number(allocateFor);
    const candidates = await prisma.restaurantTable.findMany({
      where: { isDeleted: false, status: "available", ...(locationId && { locationId }), minCapacity: { lte: party }, maxCapacity: { gte: party } },
      include: { section: { select: { name: true } } },
      orderBy: { maxCapacity: "asc" }, // tightest fit first
    });
    return NextResponse.json({ suggestion: candidates[0] ?? null, alternatives: candidates.slice(1, 4) });
  }

  const [tables, sections] = await Promise.all([
    prisma.restaurantTable.findMany({
      where: {
        isDeleted: false,
        ...(locationId && { locationId }),
        ...(status && { status }),
      },
      include: {
        section: { select: { id: true, name: true } },
        sessions: { where: { status: "open" }, take: 1 },
      },
      orderBy: { label: "asc" },
    }),
    prisma.tableSection.findMany({
      where: locationId ? { locationId } : {},
      include: { _count: { select: { tables: true } } },
    }),
  ]);

  return NextResponse.json({ tables, sections });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.type === "section") {
      const section = await prisma.tableSection.create({
        data: { locationId: body.locationId, name: body.name },
        include: { _count: { select: { tables: true } } },
      });
      await audit("create", "table_section", section.id, section);
      return NextResponse.json(section, { status: 201 });
    }
    if (body.type === "session") {
      const table = await prisma.restaurantTable.findUnique({ where: { id: body.tableId } });
      if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
      const session = await prisma.tableSession.create({
        data: {
          tableId: table.id,
          locationId: table.locationId,
          guestCount: Number(body.guestCount) || 1,
          serverName: body.serverName ?? null,
          guestName: body.guestName ?? null,
          guestPhone: body.guestPhone ?? null,
          specialRequests: body.specialRequests ?? null,
          status: "open",
        },
      });
      await prisma.restaurantTable.update({ where: { id: table.id }, data: { status: "occupied" } });
      await audit("create", "table_session", session.id, session);
      return NextResponse.json(session, { status: 201 });
    }
    if (body.type === "bulk") {
      // Bulk-add N tables: count, startNumber, section, default capacity, shape.
      const count = Math.min(Number(body.count) || 0, 100);
      const start = Number(body.startNumber) || 1;
      const prefix = body.prefix ?? "T";
      const created = [];
      for (let i = 0; i < count; i++) {
        const t = await prisma.restaurantTable.create({
          data: {
            locationId: body.locationId, sectionId: body.sectionId || null, label: `${prefix}${start + i}`,
            minCapacity: Number(body.minCapacity) || 1, maxCapacity: Number(body.maxCapacity) || 4, shape: body.shape ?? "square",
            posX: 20 + (i % 6) * 100, posY: 20 + Math.floor(i / 6) * 100, status: "available",
          },
        });
        created.push(t);
      }
      await audit("bulk_create", "restaurant_table", null, { count: created.length, start, prefix });
      return NextResponse.json({ created: created.length }, { status: 201 });
    }
    const table = await prisma.restaurantTable.create({
      data: {
        locationId: body.locationId,
        sectionId: body.sectionId || null,
        label: body.label,
        minCapacity: body.minCapacity ?? 1,
        maxCapacity: body.maxCapacity ?? 4,
        shape: body.shape ?? "square",
        posX: body.posX ?? Math.random() * 300,
        posY: body.posY ?? Math.random() * 200,
        status: "available",
      },
      include: { section: { select: { id: true, name: true } }, sessions: true },
    });
    await audit("create", "restaurant_table", table.id, table);
    return NextResponse.json(table, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, type, ...data } = body;
    if (type === "section") {
      const section = await prisma.tableSection.update({
        where: { id },
        data,
        include: { _count: { select: { tables: true } } },
      });
      await audit("update", "table_section", id, data);
      return NextResponse.json(section);
    }
    if (type === "close_session") {
      const session = await prisma.tableSession.update({
        where: { id },
        data: { status: "closed", endedAt: new Date() },
      });
      await prisma.restaurantTable.update({ where: { id: session.tableId }, data: { status: "cleaning" } });
      await audit("close", "table_session", id, data);
      return NextResponse.json(session);
    }
    if (type === "cancel_session") {
      const session = await prisma.tableSession.update({ where: { id }, data: { status: "cancelled", endedAt: new Date() } });
      await prisma.restaurantTable.update({ where: { id: session.tableId }, data: { status: "available" } });
      await audit("cancel", "table_session", id, { reason: data.reason });
      return NextResponse.json(session);
    }
    if (type === "reassign_session") {
      const session = await prisma.tableSession.findUnique({ where: { id } });
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
      const newTable = await prisma.restaurantTable.findUnique({ where: { id: data.toTableId } });
      if (!newTable) return NextResponse.json({ error: "Target table not found" }, { status: 404 });
      await prisma.tableSession.update({ where: { id }, data: { tableId: newTable.id } });
      await prisma.restaurantTable.update({ where: { id: session.tableId }, data: { status: "cleaning" } });
      await prisma.restaurantTable.update({ where: { id: newTable.id }, data: { status: "occupied" } });
      await audit("reassign", "table_session", id, { from: session.tableId, to: newTable.id });
      return NextResponse.json({ ok: true });
    }
    if (type === "cleaning_done") {
      const table = await prisma.restaurantTable.update({ where: { id }, data: { status: "available" } });
      await audit("update", "restaurant_table", id, { status: "available" });
      return NextResponse.json(table);
    }
    if (type === "qr") {
      const table = await prisma.restaurantTable.update({
        where: { id },
        data: { qrCode: `QR-${id}-${Date.now()}` },
        include: { section: { select: { id: true, name: true } }, sessions: { where: { status: "open" }, take: 1 } },
      });
      await audit("update", "table_qr", id, table.qrCode);
      return NextResponse.json(table);
    }
    const table = await prisma.restaurantTable.update({
      where: { id },
      data,
      include: { section: { select: { id: true, name: true } }, sessions: { where: { status: "open" }, take: 1 } },
    });
    await audit("update", "restaurant_table", id, data);
    return NextResponse.json(table);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const type = req.nextUrl.searchParams.get("type");
    const reason = req.nextUrl.searchParams.get("reason") ?? "No reason provided";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    if (type === "section") {
      // Reassign this section's tables to "Unsectioned" (null) before deleting.
      await prisma.restaurantTable.updateMany({ where: { sectionId: id }, data: { sectionId: null } });
      await prisma.tableSection.delete({ where: { id } });
    } else {
      await prisma.restaurantTable.update({ where: { id }, data: { isDeleted: true } });
    }
    await audit("delete", type ?? "restaurant_table", id, { reason });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
