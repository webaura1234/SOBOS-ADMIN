import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const status = req.nextUrl.searchParams.get("status");
  const sb = db();

  const allocateFor = req.nextUrl.searchParams.get("allocateFor");
  if (allocateFor) {
    const party = Number(allocateFor);
    let q = sb
      .from("RestaurantTable")
      .select("*, section:TableSection(name)")
      .eq("isDeleted", false)
      .eq("status", "available")
      .lte("minCapacity", party)
      .gte("maxCapacity", party)
      .order("maxCapacity", { ascending: true });
    if (locationId) q = q.eq("locationId", locationId);
    const { data: candidates, error } = await q;
    if (error) sbError(error, "tables/allocate");
    return NextResponse.json({ suggestion: candidates?.[0] ?? null, alternatives: (candidates ?? []).slice(1, 4) });
  }

  let tablesQ = sb
    .from("RestaurantTable")
    .select("*, section:TableSection(id, name), sessions:TableSession(*)")
    .eq("isDeleted", false)
    .order("label", { ascending: true });
  if (locationId) tablesQ = tablesQ.eq("locationId", locationId);
  if (status) tablesQ = tablesQ.eq("status", status);

  let sectionsQ = sb.from("TableSection").select("*");
  if (locationId) sectionsQ = sectionsQ.eq("locationId", locationId);

  const [tablesResult, sectionsResult, tableCountsResult] = await Promise.all([
    tablesQ,
    sectionsQ,
    sb.from("RestaurantTable").select("sectionId"),
  ]);
  if (tablesResult.error) sbError(tablesResult.error, "tables/list");
  if (sectionsResult.error) sbError(sectionsResult.error, "tables/sections");
  if (tableCountsResult.error) sbError(tableCountsResult.error, "tables/counts");

  const countBySection = (tableCountsResult.data ?? []).reduce<Record<string, number>>((acc, t) => {
    if (t.sectionId) acc[t.sectionId as string] = (acc[t.sectionId as string] ?? 0) + 1;
    return acc;
  }, {});

  const tables = (tablesResult.data ?? []).map((t) => ({
    ...t,
    sessions: ((t.sessions as { status: string }[]) ?? []).filter((s) => s.status === "open").slice(0, 1),
  }));

  const sections = (sectionsResult.data ?? []).map((s) => ({
    ...s,
    _count: { tables: countBySection[s.id as string] ?? 0 },
  }));

  return NextResponse.json({ tables, sections });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const sb = db();

    if (body.type === "section") {
      const sectionId = crypto.randomUUID();
      const { data: section, error } = await sb
        .from("TableSection")
        .insert({ id: sectionId, locationId: body.locationId, name: body.name })
        .select()
        .single();
      if (error) sbError(error, "tables/section/create");
      await audit("create", "table_section", section.id, { ...section, _count: { tables: 0 } });
      return NextResponse.json({ ...section, _count: { tables: 0 } }, { status: 201 });
    }

    if (body.type === "session") {
      const { data: table, error: tableErr } = await sb.from("RestaurantTable").select("*").eq("id", body.tableId).maybeSingle();
      if (tableErr) sbError(tableErr, "tables/session/table");
      if (!table) return NextResponse.json({ error: "Table not found" }, { status: 404 });
      const { data: session, error } = await sb
        .from("TableSession")
        .insert({
          id: crypto.randomUUID(),
          tableId: table.id,
          locationId: table.locationId,
          guestCount: Number(body.guestCount) || 1,
          serverName: body.serverName ?? null,
          guestName: body.guestName ?? null,
          guestPhone: body.guestPhone ?? null,
          specialRequests: body.specialRequests ?? null,
          status: "open",
        })
        .select()
        .single();
      if (error) sbError(error, "tables/session/create");
      const { error: occErr } = await sb.from("RestaurantTable").update({ status: "occupied" }).eq("id", table.id);
      if (occErr) sbError(occErr, "tables/session/occupy");
      await audit("create", "table_session", session.id, session);
      return NextResponse.json(session, { status: 201 });
    }

    if (body.type === "bulk") {
      const count = Math.min(Number(body.count) || 0, 100);
      const start = Number(body.startNumber) || 1;
      const prefix = body.prefix ?? "T";
      const created = [];
      for (let i = 0; i < count; i++) {
        const { data: t, error } = await sb
          .from("RestaurantTable")
          .insert({
            id: crypto.randomUUID(),
            locationId: body.locationId,
            sectionId: body.sectionId || null,
            label: `${prefix}${start + i}`,
            minCapacity: Number(body.minCapacity) || 1,
            maxCapacity: Number(body.maxCapacity) || 4,
            shape: body.shape ?? "square",
            posX: 20 + (i % 6) * 100,
            posY: 20 + Math.floor(i / 6) * 100,
            status: "available",
          })
          .select()
          .single();
        if (error) sbError(error, "tables/bulk/create");
        created.push(t);
      }
      await audit("bulk_create", "restaurant_table", null, { count: created.length, start, prefix });
      return NextResponse.json({ created: created.length }, { status: 201 });
    }

    const tableId = crypto.randomUUID();
    const { data: table, error } = await sb
      .from("RestaurantTable")
      .insert({
        id: tableId,
        locationId: body.locationId,
        sectionId: body.sectionId || null,
        label: body.label,
        minCapacity: body.minCapacity ?? 1,
        maxCapacity: body.maxCapacity ?? 4,
        shape: body.shape ?? "square",
        posX: body.posX ?? Math.random() * 300,
        posY: body.posY ?? Math.random() * 200,
        status: "available",
      })
      .select("*, section:TableSection(id, name), sessions:TableSession(*)")
      .single();
    if (error) sbError(error, "tables/create");
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
    const sb = db();

    if (type === "section") {
      const { data: section, error } = await sb.from("TableSection").update(data).eq("id", id).select().single();
      if (error) sbError(error, "tables/section/update");
      const { count } = await sb.from("RestaurantTable").select("*", { count: "exact", head: true }).eq("sectionId", id);
      await audit("update", "table_section", id, data);
      return NextResponse.json({ ...section, _count: { tables: count ?? 0 } });
    }

    if (type === "close_session") {
      const { data: session, error } = await sb
        .from("TableSession")
        .update({ status: "closed", endedAt: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) sbError(error, "tables/close_session");
      const { error: cleanErr } = await sb.from("RestaurantTable").update({ status: "cleaning" }).eq("id", session.tableId);
      if (cleanErr) sbError(cleanErr, "tables/close_session/table");
      await audit("close", "table_session", id, data);
      return NextResponse.json(session);
    }

    if (type === "cancel_session") {
      const { data: session, error } = await sb
        .from("TableSession")
        .update({ status: "cancelled", endedAt: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) sbError(error, "tables/cancel_session");
      const { error: availErr } = await sb.from("RestaurantTable").update({ status: "available" }).eq("id", session.tableId);
      if (availErr) sbError(availErr, "tables/cancel_session/table");
      await audit("cancel", "table_session", id, { reason: data.reason });
      return NextResponse.json(session);
    }

    if (type === "reassign_session") {
      const { data: session, error: sessErr } = await sb.from("TableSession").select("*").eq("id", id).maybeSingle();
      if (sessErr) sbError(sessErr, "tables/reassign/findSession");
      if (!session) return NextResponse.json({ error: "Session not found" }, { status: 404 });
      const { data: newTable, error: tableErr } = await sb.from("RestaurantTable").select("*").eq("id", data.toTableId).maybeSingle();
      if (tableErr) sbError(tableErr, "tables/reassign/findTable");
      if (!newTable) return NextResponse.json({ error: "Target table not found" }, { status: 404 });
      const { error: moveErr } = await sb.from("TableSession").update({ tableId: newTable.id }).eq("id", id);
      if (moveErr) sbError(moveErr, "tables/reassign/move");
      await sb.from("RestaurantTable").update({ status: "cleaning" }).eq("id", session.tableId);
      await sb.from("RestaurantTable").update({ status: "occupied" }).eq("id", newTable.id);
      await audit("reassign", "table_session", id, { from: session.tableId, to: newTable.id });
      return NextResponse.json({ ok: true });
    }

    if (type === "cleaning_done") {
      const { data: table, error } = await sb.from("RestaurantTable").update({ status: "available" }).eq("id", id).select().single();
      if (error) sbError(error, "tables/cleaning_done");
      await audit("update", "restaurant_table", id, { status: "available" });
      return NextResponse.json(table);
    }

    if (type === "qr") {
      const { data: table, error } = await sb
        .from("RestaurantTable")
        .update({ qrCode: `QR-${id}-${Date.now()}` })
        .eq("id", id)
        .select("*, section:TableSection(id, name), sessions:TableSession(*)")
        .single();
      if (error) sbError(error, "tables/qr");
      const filtered = {
        ...table,
        sessions: ((table.sessions as { status: string }[]) ?? []).filter((s) => s.status === "open").slice(0, 1),
      };
      await audit("update", "table_qr", id, filtered.qrCode);
      return NextResponse.json(filtered);
    }

    const { data: table, error } = await sb
      .from("RestaurantTable")
      .update(data)
      .eq("id", id)
      .select("*, section:TableSection(id, name), sessions:TableSession(*)")
      .single();
    if (error) sbError(error, "tables/update");
    const filtered = {
      ...table,
      sessions: ((table.sessions as { status: string }[]) ?? []).filter((s) => s.status === "open").slice(0, 1),
    };
    await audit("update", "restaurant_table", id, data);
    return NextResponse.json(filtered);
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
    const sb = db();
    if (type === "section") {
      const { error: reassignErr } = await sb.from("RestaurantTable").update({ sectionId: null }).eq("sectionId", id);
      if (reassignErr) sbError(reassignErr, "tables/deleteSection/reassign");
      const { error } = await sb.from("TableSection").delete().eq("id", id);
      if (error) sbError(error, "tables/deleteSection");
    } else {
      const { error } = await sb.from("RestaurantTable").update({ isDeleted: true }).eq("id", id);
      if (error) sbError(error, "tables/delete");
    }
    await audit("delete", type ?? "restaurant_table", id, { reason });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
