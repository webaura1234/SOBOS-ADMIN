import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit } from "@/lib/api-helpers";

export async function GET() {
  const sb = db();
  const [
    restaurantResult,
    locationsResult,
    togglesResult,
    rolesResult,
    permissionsResult,
    usersResult,
    holidaysResult,
    assignmentsResult,
    rolePermissionsResult,
  ] = await Promise.all([
    sb.from("Restaurant").select("*").limit(1).maybeSingle(),
    sb.from("Location").select("*, operatingHours:OperatingHours(*)").order("name", { ascending: true }),
    sb.from("FeatureToggle").select("*").order("group", { ascending: true }),
    sb.from("Role").select("*").order("name", { ascending: true }),
    sb.from("Permission").select("*").order("group", { ascending: true }).order("label", { ascending: true }),
    sb
      .from("User")
      .select("*, locationRoles:UserLocationRole(role:Role(id, name), location:Location(id, name))")
      .eq("status", "active")
      .order("name", { ascending: true }),
    sb.from("HolidayClosure").select("*").order("date", { ascending: true }),
    sb.from("UserLocationRole").select("roleId"),
    sb.from("RolePermission").select("roleId, permissionId"),
  ]);

  if (restaurantResult.error) sbError(restaurantResult.error, "settings/restaurant");
  if (locationsResult.error) sbError(locationsResult.error, "settings/locations");
  if (togglesResult.error) sbError(togglesResult.error, "settings/toggles");
  if (rolesResult.error) sbError(rolesResult.error, "settings/roles");
  if (permissionsResult.error) sbError(permissionsResult.error, "settings/permissions");
  if (usersResult.error) sbError(usersResult.error, "settings/users");
  if (holidaysResult.error) sbError(holidaysResult.error, "settings/holidays");
  if (assignmentsResult.error) sbError(assignmentsResult.error, "settings/assignments");
  if (rolePermissionsResult.error) sbError(rolePermissionsResult.error, "settings/rolePermissions");

  const assignmentCountByRole = (assignmentsResult.data ?? []).reduce<Record<string, number>>((acc, a) => {
    acc[a.roleId as string] = (acc[a.roleId as string] ?? 0) + 1;
    return acc;
  }, {});
  const permissionCountByRole = (rolePermissionsResult.data ?? []).reduce<Record<string, number>>((acc, rp) => {
    acc[rp.roleId as string] = (acc[rp.roleId as string] ?? 0) + 1;
    return acc;
  }, {});

  const rolesWithDetails = await Promise.all(
    (rolesResult.data ?? []).map(async (role) => {
      const { data: permissions } = await sb
        .from("RolePermission")
        .select("permission:Permission(*)")
        .eq("roleId", role.id);
      return {
        ...role,
        permissions: permissions ?? [],
        _count: {
          assignments: assignmentCountByRole[role.id as string] ?? 0,
          permissions: permissionCountByRole[role.id as string] ?? 0,
        },
      };
    }),
  );

  const locations = (locationsResult.data ?? []).map((loc) => ({
    ...loc,
    operatingHours: ((loc.operatingHours as { dayOfWeek: number; openTime: string }[]) ?? []).sort((a, b) => {
      if (a.dayOfWeek !== b.dayOfWeek) return a.dayOfWeek - b.dayOfWeek;
      return a.openTime.localeCompare(b.openTime);
    }),
  }));

  return NextResponse.json({
    restaurant: restaurantResult.data,
    locations,
    toggles: togglesResult.data ?? [],
    roles: rolesWithDetails,
    permissions: permissionsResult.data ?? [],
    users: usersResult.data ?? [],
    holidays: holidaysResult.data ?? [],
  });
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { type, id, ...data } = body;
    const sb = db();

    if (type === "restaurant") {
      const { data: restaurant, error } = await sb
        .from("Restaurant")
        .update({ ...data, updatedAt: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) sbError(error, "settings/restaurant");
      await audit("update", "restaurant", id, data);
      return NextResponse.json(restaurant);
    }
    if (type === "location") {
      const { data: location, error } = await sb
        .from("Location")
        .update({ ...data, updatedAt: new Date().toISOString() })
        .eq("id", id)
        .select("*, operatingHours:OperatingHours(*)")
        .single();
      if (error) sbError(error, "settings/location");
      await audit("update", "location", id, data);
      return NextResponse.json(location);
    }
    if (type === "toggle") {
      const { data: toggle, error } = await sb.from("FeatureToggle").update({ enabled: data.enabled }).eq("id", id).select().single();
      if (error) sbError(error, "settings/toggle");
      await audit("update", "feature_toggle", id, data);
      return NextResponse.json(toggle);
    }
    if (type === "hours") {
      const updates: Record<string, unknown> = {};
      if (data.openTime !== undefined) updates.openTime = data.openTime;
      if (data.closeTime !== undefined) updates.closeTime = data.closeTime;
      if (data.isClosed !== undefined) updates.isClosed = !!data.isClosed;
      const { data: hours, error } = await sb.from("OperatingHours").update(updates).eq("id", id).select().single();
      if (error) sbError(error, "settings/hours");
      await audit("update", "operating_hours", id, data);
      return NextResponse.json(hours);
    }
    if (type === "role") {
      const permissionIds = Array.isArray(data.permissionIds) ? data.permissionIds : [];
      const { error: delErr } = await sb.from("RolePermission").delete().eq("roleId", id);
      if (delErr) sbError(delErr, "settings/role/deletePermissions");
      if (permissionIds.length) {
        const { error: insErr } = await sb.from("RolePermission").insert(
          permissionIds.map((permissionId: string) => ({ roleId: id, permissionId })),
        );
        if (insErr) sbError(insErr, "settings/role/insertPermissions");
      }
      const { data: role, error } = await sb
        .from("Role")
        .update({ name: data.name, description: data.description })
        .eq("id", id)
        .select()
        .single();
      if (error) sbError(error, "settings/role/update");
      const { data: permissions } = await sb.from("RolePermission").select("permission:Permission(*)").eq("roleId", id);
      const { count: assignmentCount } = await sb
        .from("UserLocationRole")
        .select("*", { count: "exact", head: true })
        .eq("roleId", id);
      await audit("update", "role", id, { name: data.name, description: data.description, permissionIds });
      return NextResponse.json({
        ...role,
        permissions: permissions ?? [],
        _count: { assignments: assignmentCount ?? 0, permissions: permissionIds.length },
      });
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

    if (body.type === "location") {
      const locationId = crypto.randomUUID();
      const now = new Date().toISOString();
      const { data: location, error } = await sb
        .from("Location")
        .insert({
          id: locationId,
          restaurantId: body.restaurantId,
          name: body.name,
          address: body.address,
          city: body.city,
          pin: body.pin,
          phone: body.phone ?? null,
          taxSlab: body.taxSlab ?? 5,
          updatedAt: now,
        })
        .select()
        .single();
      if (error) sbError(error, "settings/location/create");
      const { error: hoursErr } = await sb.from("OperatingHours").insert(
        Array.from({ length: 7 }, (_, dayOfWeek) => ({
          id: crypto.randomUUID(),
          locationId,
          dayOfWeek,
          openTime: "11:00",
          closeTime: "23:00",
          isClosed: false,
        })),
      );
      if (hoursErr) sbError(hoursErr, "settings/location/hours");
      await audit("create", "location", location.id, location);
      return NextResponse.json(location, { status: 201 });
    }
    if (body.type === "role") {
      const roleId = crypto.randomUUID();
      const permissionIds = Array.isArray(body.permissionIds) ? body.permissionIds : [];
      const { data: role, error } = await sb
        .from("Role")
        .insert({
          id: roleId,
          restaurantId: body.restaurantId,
          name: body.name,
          description: body.description ?? null,
        })
        .select()
        .single();
      if (error) sbError(error, "settings/role/create");
      if (permissionIds.length) {
        const { error: permErr } = await sb.from("RolePermission").insert(
          permissionIds.map((permissionId: string) => ({ roleId, permissionId })),
        );
        if (permErr) sbError(permErr, "settings/role/permissions");
      }
      const { data: permissions } = await sb.from("RolePermission").select("permission:Permission(*)").eq("roleId", roleId);
      await audit("create", "role", role.id, role);
      return NextResponse.json(
        { ...role, permissions: permissions ?? [], _count: { assignments: 0, permissions: permissionIds.length } },
        { status: 201 },
      );
    }
    if (body.type === "hours_row") {
      const { data: row, error } = await sb
        .from("OperatingHours")
        .insert({
          id: crypto.randomUUID(),
          locationId: body.locationId,
          dayOfWeek: Number(body.dayOfWeek),
          openTime: body.openTime ?? "17:00",
          closeTime: body.closeTime ?? "23:00",
          isClosed: false,
        })
        .select()
        .single();
      if (error) sbError(error, "settings/hours/create");
      await audit("create", "operating_hours", row.id, row);
      return NextResponse.json(row, { status: 201 });
    }
    if (body.type === "holiday") {
      const { data: holiday, error } = await sb
        .from("HolidayClosure")
        .insert({
          id: crypto.randomUUID(),
          locationId: body.locationId,
          date: new Date(body.date).toISOString(),
          name: body.name,
        })
        .select()
        .single();
      if (error) sbError(error, "settings/holiday/create");
      await audit("create", "holiday_closure", holiday.id, holiday);
      return NextResponse.json(holiday, { status: 201 });
    }
    if (body.type === "assignment") {
      const { data: assignment, error } = await sb
        .from("UserLocationRole")
        .insert({
          id: crypto.randomUUID(),
          userId: body.userId,
          roleId: body.roleId,
          locationId: body.locationId || null,
        })
        .select()
        .single();
      if (error) sbError(error, "settings/assignment/create");
      await audit("create", "user_location_role", assignment.id, assignment);
      return NextResponse.json(assignment, { status: 201 });
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

    if (type === "role") {
      const { data: role, error: roleErr } = await sb.from("Role").select("restaurantId").eq("id", id).maybeSingle();
      if (roleErr) sbError(roleErr, "settings/role/find");
      if (!role) return NextResponse.json({ error: "Role not found" }, { status: 404 });

      const { count: assignmentCount, error: assignErr } = await sb
        .from("UserLocationRole")
        .select("*", { count: "exact", head: true })
        .eq("roleId", id);
      if (assignErr) sbError(assignErr, "settings/role/assignments");
      if ((assignmentCount ?? 0) > 0)
        return NextResponse.json({ error: "Reassign staff before deleting this role" }, { status: 400 });

      const { data: perms, error: permErr } = await sb
        .from("RolePermission")
        .select("permission:Permission(resource)")
        .eq("roleId", id);
      if (permErr) sbError(permErr, "settings/role/permissions");
      const isFullAdmin = (perms ?? []).some((p) => (p.permission as unknown as { resource: string }).resource === "*");
      if (isFullAdmin) {
        const { data: allRoles } = await sb.from("Role").select("id").eq("restaurantId", role.restaurantId);
        let adminCount = 0;
        for (const r of allRoles ?? []) {
          const { data: rp } = await sb.from("RolePermission").select("permission:Permission(resource)").eq("roleId", r.id);
          if ((rp ?? []).some((p) => (p.permission as unknown as { resource: string }).resource === "*")) adminCount += 1;
        }
        if (adminCount <= 1)
          return NextResponse.json({ error: "Cannot delete the last full-admin role" }, { status: 400 });
      }
      const { error } = await sb.from("Role").delete().eq("id", id);
      if (error) sbError(error, "settings/role/delete");
      await audit("delete", "role", id);
      return NextResponse.json({ ok: true });
    }
    if (type === "assignment") {
      const { error } = await sb.from("UserLocationRole").delete().eq("id", id);
      if (error) sbError(error, "settings/assignment/delete");
      await audit("delete", "user_location_role", id);
      return NextResponse.json({ ok: true });
    }
    if (type === "holiday") {
      const { error } = await sb.from("HolidayClosure").delete().eq("id", id);
      if (error) sbError(error, "settings/holiday/delete");
      await audit("delete", "holiday_closure", id);
      return NextResponse.json({ ok: true });
    }
    if (type === "hours_row") {
      const { error } = await sb.from("OperatingHours").delete().eq("id", id);
      if (error) sbError(error, "settings/hours/delete");
      await audit("delete", "operating_hours", id);
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Unknown type" }, { status: 400 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
