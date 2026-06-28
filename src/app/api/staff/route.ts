import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit, getRestaurantId } from "@/lib/api-helpers";

async function payrollConfig(restaurantId: string) {
  const { data: cfg, error } = await db()
    .from("AdminConfig")
    .select("value")
    .eq("restaurantId", restaurantId)
    .eq("scope", "payroll")
    .eq("key", "config")
    .maybeSingle();
  if (error) sbError(error, "staff/payrollConfig");
  try {
    return { otMultiplier: 1.5, otThreshold: 48, ...(cfg ? JSON.parse(cfg.value as string) : {}) };
  } catch {
    return { otMultiplier: 1.5, otThreshold: 48 };
  }
}

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "list";
  const restaurantId = await getRestaurantId();
  const sb = db();

  if (tab === "attendance") {
    const { data, error } = await sb
      .from("Attendance")
      .select("*, user:User(name)")
      .order("clockIn", { ascending: false })
      .limit(80);
    if (error) sbError(error, "staff/attendance");
    return NextResponse.json({ attendance: data ?? [] });
  }

  if (tab === "schedule") {
    const [scheduleResult, staffResult, locationsResult, swapsResult] = await Promise.all([
      sb.from("ScheduleSlot").select("*").order("dayOfWeek", { ascending: true }).order("startTime", { ascending: true }),
      sb.from("User").select("id, name").eq("status", "active").order("name", { ascending: true }),
      sb.from("Location").select("id, name").order("name", { ascending: true }),
      sb.from("ShiftSwap").select("*").order("createdAt", { ascending: false }),
    ]);
    if (scheduleResult.error) sbError(scheduleResult.error, "staff/schedule");
    if (staffResult.error) sbError(staffResult.error, "staff/staff");
    if (locationsResult.error) sbError(locationsResult.error, "staff/locations");
    if (swapsResult.error) sbError(swapsResult.error, "staff/swaps");
    const schedule = scheduleResult.data ?? [];
    const covered = new Set(schedule.map((s) => s.dayOfWeek));
    const gaps = [0, 1, 2, 3, 4, 5, 6].filter((d) => !covered.has(d));
    return NextResponse.json({
      schedule,
      staff: staffResult.data ?? [],
      locations: locationsResult.data ?? [],
      swaps: swapsResult.data ?? [],
      gaps,
    });
  }

  if (tab === "performance") {
    const { data: users, error } = await sb
      .from("User")
      .select("*, attendance:Attendance(*), locationRoles:UserLocationRole(role:Role(*))")
      .eq("status", "active");
    if (error) sbError(error, "staff/performance");
    const leaderboard = (users ?? [])
      .map((u) => {
        const attendance = (u.attendance as { clockIn: string; clockOut: string | null; isLate: boolean }[]) ?? [];
        const shifts = attendance.length;
        const hours = attendance.reduce(
          (s, a) => s + Math.max(0, ((a.clockOut ? new Date(a.clockOut) : new Date()).getTime() - new Date(a.clockIn).getTime()) / 3600000),
          0,
        );
        const onTime = attendance.filter((a) => !a.isLate).length;
        const role = (u.locationRoles as { role: { name: string } }[])?.[0]?.role.name ?? "Staff";
        return {
          id: u.id,
          name: u.name,
          role,
          shifts,
          hours: Math.round(hours * 10) / 10,
          onTimeRate: shifts ? Math.round((onTime / shifts) * 100) : 100,
          avgShift: shifts ? Math.round((hours / shifts) * 10) / 10 : 0,
        };
      })
      .sort((a, b) => b.hours - a.hours);
    return NextResponse.json({ leaderboard });
  }

  if (tab === "payroll") {
    const cfg = await payrollConfig(restaurantId);
    const { data: users, error } = await sb
      .from("User")
      .select("*, attendance:Attendance(*), locationRoles:UserLocationRole(role:Role(*))")
      .eq("status", "active")
      .order("name", { ascending: true });
    if (error) sbError(error, "staff/payroll");
    const payroll = (users ?? []).map((user) => {
      const attendance = (user.attendance as { clockIn: string; clockOut: string | null }[]) ?? [];
      const hours = attendance.reduce(
        (sum, row) =>
          sum + Math.max(0, ((row.clockOut ? new Date(row.clockOut) : new Date()).getTime() - new Date(row.clockIn).getTime()) / 3600000),
        0,
      );
      const roleName = (user.locationRoles as { role: { name: string } }[])?.[0]?.role.name ?? "Staff";
      const hourlyRate = Number(user.payRate) > 0 ? Number(user.payRate) : roleName === "Owner" ? 800 : roleName === "Manager" ? 450 : 250;
      const incomplete = attendance.some((a) => !a.clockOut);
      const otHours = Math.max(0, hours - cfg.otThreshold);
      const regHours = hours - otHours;
      const gross =
        user.payType === "monthly" && Number(user.payRate) > 0
          ? Number(user.payRate)
          : Math.round(regHours * hourlyRate + otHours * hourlyRate * cfg.otMultiplier);
      return {
        id: user.id,
        name: user.name,
        role: roleName,
        payType: user.payType,
        hours: Math.round(hours * 10) / 10,
        otHours: Math.round(otHours * 10) / 10,
        hourlyRate,
        grossPay: gross,
        incomplete,
      };
    });
    return NextResponse.json({ payroll, config: cfg });
  }

  const [staffResult, rolesResult, locationsResult] = await Promise.all([
    sb
      .from("User")
      .select("*, locationRoles:UserLocationRole(role:Role(*), location:Location(name)), attendance:Attendance(*)")
      .order("name", { ascending: true }),
    sb.from("Role").select("id, name").order("name", { ascending: true }),
    sb.from("Location").select("id, name").order("name", { ascending: true }),
  ]);
  if (staffResult.error) sbError(staffResult.error, "staff/list");
  if (rolesResult.error) sbError(rolesResult.error, "staff/roles");
  if (locationsResult.error) sbError(locationsResult.error, "staff/locations");

  const staff = (staffResult.data ?? []).map((u) => ({
    ...u,
    attendance: ((u.attendance as { clockIn: string }[]) ?? [])
      .sort((a, b) => new Date(b.clockIn).getTime() - new Date(a.clockIn).getTime())
      .slice(0, 1),
  }));

  return NextResponse.json({ staff, roles: rolesResult.data ?? [], locations: locationsResult.data ?? [] });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();
    const sb = db();

    if (body.type === "schedule") {
      const { data: slot, error } = await sb
        .from("ScheduleSlot")
        .insert({
          id: crypto.randomUUID(),
          userId: body.userId,
          locationId: body.locationId,
          dayOfWeek: Number(body.dayOfWeek),
          startTime: body.startTime,
          endTime: body.endTime,
          status: body.status ?? "published",
        })
        .select()
        .single();
      if (error) sbError(error, "staff/schedule/create");
      await audit("create", "schedule_slot", slot.id, slot);
      return NextResponse.json(slot, { status: 201 });
    }

    if (body.type === "clock_in") {
      const { data: attendance, error } = await sb
        .from("Attendance")
        .insert({
          id: crypto.randomUUID(),
          userId: body.userId,
          clockIn: new Date().toISOString(),
          location: body.location ?? null,
        })
        .select()
        .single();
      if (error) sbError(error, "staff/clock_in");
      await audit("create", "attendance", attendance.id, attendance);
      return NextResponse.json(attendance, { status: 201 });
    }

    if (body.type === "swap") {
      const { data: swap, error } = await sb
        .from("ShiftSwap")
        .insert({
          id: crypto.randomUUID(),
          slotId: body.slotId,
          requesterId: body.requesterId,
          requesterName: body.requesterName,
          withName: body.withName ?? null,
          reason: body.reason ?? null,
        })
        .select()
        .single();
      if (error) sbError(error, "staff/swap/create");
      await audit("create", "shift_swap", swap.id, swap);
      return NextResponse.json(swap, { status: 201 });
    }

    if (body.type === "bulk_invite") {
      const rows: { phone?: string; name?: string; role?: string; location?: string }[] = body.rows ?? [];
      const { data: roles } = await sb.from("Role").select("id, name");
      const { data: locations } = await sb.from("Location").select("id, name");
      const { data: existingUsers } = await sb.from("User").select("phone").eq("restaurantId", restaurantId);
      const existing = new Set((existingUsers ?? []).map((u) => u.phone));
      const seen = new Set<string>();
      const results: { row: number; phone: string; ok: boolean; error?: string }[] = [];
      let created = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const phone = (r.phone ?? "").trim();
        if (!phone) {
          results.push({ row: i + 1, phone, ok: false, error: "Missing phone" });
          continue;
        }
        if (existing.has(phone) || seen.has(phone)) {
          results.push({ row: i + 1, phone, ok: false, error: "Duplicate phone" });
          continue;
        }
        const role = (roles ?? []).find((x) => x.name.toLowerCase() === (r.role ?? "").toLowerCase());
        const loc = (locations ?? []).find((x) => x.name.toLowerCase() === (r.location ?? "").toLowerCase());
        try {
          const userId = crypto.randomUUID();
          const { error: userErr } = await sb.from("User").insert({
            id: userId,
            restaurantId,
            name: r.name || phone,
            phone,
            status: "active",
            inviteStatus: "pending",
            updatedAt: new Date().toISOString(),
          });
          if (userErr) throw new Error(userErr.message);
          if (role) {
            const { error: assignErr } = await sb.from("UserLocationRole").insert({
              id: crypto.randomUUID(),
              userId,
              roleId: role.id,
              locationId: loc?.id ?? null,
            });
            if (assignErr) throw new Error(assignErr.message);
          }
          seen.add(phone);
          created += 1;
          results.push({ row: i + 1, phone, ok: true });
        } catch (e) {
          results.push({ row: i + 1, phone, ok: false, error: String(e).slice(0, 60) });
        }
      }
      await audit("bulk_invite", "user", null, { created, total: rows.length });
      return NextResponse.json({ created, total: rows.length, results });
    }

    const userId = crypto.randomUUID();
    const { data: user, error: userErr } = await sb
      .from("User")
      .insert({
        id: userId,
        restaurantId,
        name: body.name,
        phone: body.phone,
        email: body.email ?? null,
        status: "active",
        inviteStatus: "pending",
        payRate: Number(body.payRate) || 0,
        payType: body.payType ?? "hourly",
        updatedAt: new Date().toISOString(),
      })
      .select()
      .single();
    if (userErr) sbError(userErr, "staff/create");
    if (body.roleId) {
      const { error: assignErr } = await sb.from("UserLocationRole").insert({
        id: crypto.randomUUID(),
        userId,
        roleId: body.roleId,
        locationId: body.locationId ?? null,
      });
      if (assignErr) sbError(assignErr, "staff/assignRole");
    }
    await audit("create", "user", user.id, user);
    return NextResponse.json(user, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const { id, type, ...data } = body;
    const restaurantId = await getRestaurantId();
    const sb = db();

    if (type === "clock_out") {
      const { data: attendance, error } = await sb
        .from("Attendance")
        .update({ clockOut: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();
      if (error) sbError(error, "staff/clock_out");
      await audit("update", "attendance", id, { clockOut: attendance.clockOut });
      return NextResponse.json(attendance);
    }

    if (type === "attendance_adjust") {
      if (!String(data.reason ?? "").trim())
        return NextResponse.json({ error: "Reason is required to adjust clock times" }, { status: 400 });
      const { data: before, error: findErr } = await sb.from("Attendance").select("*").eq("id", id).maybeSingle();
      if (findErr) sbError(findErr, "staff/attendance/find");
      const updates: Record<string, unknown> = { autoClosed: false };
      if (data.clockIn) updates.clockIn = new Date(data.clockIn).toISOString();
      if (data.clockOut) updates.clockOut = new Date(data.clockOut).toISOString();
      const { data: attendance, error } = await sb.from("Attendance").update(updates).eq("id", id).select().single();
      if (error) sbError(error, "staff/attendance/adjust");
      await audit("adjust", "attendance", id, { ...data }, before);
      return NextResponse.json(attendance);
    }

    if (type === "resend_invite") {
      const { data: user, error } = await sb.from("User").update({ inviteStatus: "pending" }).eq("id", id).select().single();
      if (error) sbError(error, "staff/resend_invite");
      await audit("resend_invite", "user", id, { phone: user.phone });
      return NextResponse.json(user);
    }

    if (type === "swap") {
      const { data: swap, error } = await sb.from("ShiftSwap").update({ status: data.status }).eq("id", id).select().single();
      if (error) sbError(error, "staff/swap/update");
      await audit("update", "shift_swap", id, { status: data.status });
      return NextResponse.json(swap);
    }

    if (type === "payroll_config") {
      const value = JSON.stringify({ otMultiplier: Number(data.otMultiplier), otThreshold: Number(data.otThreshold) });
      const { data: existing } = await sb
        .from("AdminConfig")
        .select("id")
        .eq("restaurantId", restaurantId)
        .eq("scope", "payroll")
        .eq("key", "config")
        .maybeSingle();
      const { data: cfg, error } = await sb
        .from("AdminConfig")
        .upsert(
          { id: existing?.id ?? crypto.randomUUID(), restaurantId, scope: "payroll", key: "config", value },
          { onConflict: "restaurantId,scope,key" },
        )
        .select()
        .single();
      if (error) sbError(error, "staff/payroll_config");
      return NextResponse.json(cfg);
    }

    const userUpdates: Record<string, unknown> = {};
    if (data.name !== undefined) userUpdates.name = data.name;
    if (data.phone !== undefined) userUpdates.phone = data.phone;
    if (data.email !== undefined) userUpdates.email = data.email;
    if (data.status !== undefined) userUpdates.status = data.status;
    if (data.payRate !== undefined) userUpdates.payRate = Number(data.payRate);
    if (data.payType !== undefined) userUpdates.payType = data.payType;
    userUpdates.updatedAt = new Date().toISOString();
    const { data: user, error } = await sb.from("User").update(userUpdates).eq("id", id).select().single();
    if (error) sbError(error, "staff/update");
    await audit("update", "user", id, data);
    return NextResponse.json(user);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const id = req.nextUrl.searchParams.get("id");
    const reactivate = req.nextUrl.searchParams.get("reactivate");
    const reason = req.nextUrl.searchParams.get("reason") ?? "No reason provided";
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { error } = await db()
      .from("User")
      .update({ status: reactivate ? "active" : "inactive", updatedAt: new Date().toISOString() })
      .eq("id", id);
    if (error) sbError(error, "staff/delete");
    await audit(reactivate ? "reactivate" : "delete", "user", id, { reason });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
