import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getRestaurantId } from "@/lib/api-helpers";

async function payrollConfig(restaurantId: string) {
  const cfg = await prisma.adminConfig.findUnique({ where: { restaurantId_scope_key: { restaurantId, scope: "payroll", key: "config" } } });
  try { return { otMultiplier: 1.5, otThreshold: 48, ...(cfg ? JSON.parse(cfg.value) : {}) }; } catch { return { otMultiplier: 1.5, otThreshold: 48 }; }
}

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "list";
  const restaurantId = await getRestaurantId();

  if (tab === "attendance") {
    const attendance = await prisma.attendance.findMany({ include: { user: { select: { name: true } } }, orderBy: { clockIn: "desc" }, take: 80 });
    return NextResponse.json({ attendance });
  }

  if (tab === "schedule") {
    const [schedule, staff, locations, swaps] = await Promise.all([
      prisma.scheduleSlot.findMany({ orderBy: [{ dayOfWeek: "asc" }, { startTime: "asc" }] }),
      prisma.user.findMany({ where: { status: "active" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.location.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
      prisma.shiftSwap.findMany({ orderBy: { createdAt: "desc" } }),
    ]);
    // Coverage gaps: days of week with no published slot.
    const covered = new Set(schedule.map((s) => s.dayOfWeek));
    const gaps = [0, 1, 2, 3, 4, 5, 6].filter((d) => !covered.has(d));
    return NextResponse.json({ schedule, staff, locations, swaps, gaps });
  }

  if (tab === "performance") {
    const users = await prisma.user.findMany({ where: { status: "active" }, include: { attendance: true, locationRoles: { include: { role: true } } } });
    const leaderboard = users.map((u) => {
      const shifts = u.attendance.length;
      const hours = u.attendance.reduce((s, a) => s + Math.max(0, (a.clockOut ?? new Date()).getTime() - a.clockIn.getTime()) / 3600000, 0);
      const onTime = u.attendance.filter((a) => !a.isLate).length;
      return { id: u.id, name: u.name, role: u.locationRoles[0]?.role.name ?? "Staff", shifts, hours: Math.round(hours * 10) / 10, onTimeRate: shifts ? Math.round((onTime / shifts) * 100) : 100, avgShift: shifts ? Math.round((hours / shifts) * 10) / 10 : 0 };
    }).sort((a, b) => b.hours - a.hours);
    return NextResponse.json({ leaderboard });
  }

  if (tab === "payroll") {
    const cfg = await payrollConfig(restaurantId);
    const users = await prisma.user.findMany({ where: { status: "active" }, include: { attendance: true, locationRoles: { include: { role: true } } }, orderBy: { name: "asc" } });
    const payroll = users.map((user) => {
      const hours = user.attendance.reduce((sum, row) => sum + Math.max(0, (row.clockOut ?? new Date()).getTime() - row.clockIn.getTime()) / 3600000, 0);
      const roleName = user.locationRoles[0]?.role.name ?? "Staff";
      const hourlyRate = user.payRate > 0 ? user.payRate : roleName === "Owner" ? 800 : roleName === "Manager" ? 450 : 250;
      const incomplete = user.attendance.some((a) => !a.clockOut);
      const otHours = Math.max(0, hours - cfg.otThreshold);
      const regHours = hours - otHours;
      const gross = user.payType === "monthly" && user.payRate > 0 ? user.payRate : Math.round(regHours * hourlyRate + otHours * hourlyRate * cfg.otMultiplier);
      return { id: user.id, name: user.name, role: roleName, payType: user.payType, hours: Math.round(hours * 10) / 10, otHours: Math.round(otHours * 10) / 10, hourlyRate, grossPay: gross, incomplete };
    });
    return NextResponse.json({ payroll, config: cfg });
  }

  const [staff, roles, locations] = await Promise.all([
    prisma.user.findMany({ include: { locationRoles: { include: { role: true, location: { select: { name: true } } } }, attendance: { orderBy: { clockIn: "desc" }, take: 1 } }, orderBy: { name: "asc" } }),
    prisma.role.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.location.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return NextResponse.json({ staff, roles, locations });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();

    if (body.type === "schedule") {
      const slot = await prisma.scheduleSlot.create({ data: { userId: body.userId, locationId: body.locationId, dayOfWeek: Number(body.dayOfWeek), startTime: body.startTime, endTime: body.endTime, status: body.status ?? "published" } });
      await audit("create", "schedule_slot", slot.id, slot);
      return NextResponse.json(slot, { status: 201 });
    }

    if (body.type === "clock_in") {
      const attendance = await prisma.attendance.create({ data: { userId: body.userId, clockIn: new Date(), location: body.location ?? null } });
      await audit("create", "attendance", attendance.id, attendance);
      return NextResponse.json(attendance, { status: 201 });
    }

    if (body.type === "swap") {
      const swap = await prisma.shiftSwap.create({ data: { slotId: body.slotId, requesterId: body.requesterId, requesterName: body.requesterName, withName: body.withName ?? null, reason: body.reason ?? null } });
      await audit("create", "shift_swap", swap.id, swap);
      return NextResponse.json(swap, { status: 201 });
    }

    if (body.type === "bulk_invite") {
      // rows: [{ phone, name?, role?, location? }] → validate per row, dedup, create valid ones.
      const rows: { phone?: string; name?: string; role?: string; location?: string }[] = body.rows ?? [];
      const roles = await prisma.role.findMany({ select: { id: true, name: true } });
      const locations = await prisma.location.findMany({ select: { id: true, name: true } });
      const existing = new Set((await prisma.user.findMany({ where: { restaurantId }, select: { phone: true } })).map((u) => u.phone));
      const seen = new Set<string>();
      const results: { row: number; phone: string; ok: boolean; error?: string }[] = [];
      let created = 0;
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        const phone = (r.phone ?? "").trim();
        if (!phone) { results.push({ row: i + 1, phone, ok: false, error: "Missing phone" }); continue; }
        if (existing.has(phone) || seen.has(phone)) { results.push({ row: i + 1, phone, ok: false, error: "Duplicate phone" }); continue; }
        const role = roles.find((x) => x.name.toLowerCase() === (r.role ?? "").toLowerCase());
        const loc = locations.find((x) => x.name.toLowerCase() === (r.location ?? "").toLowerCase());
        try {
          const user = await prisma.user.create({ data: { restaurantId, name: r.name || phone, phone, status: "active", inviteStatus: "pending" } });
          if (role) await prisma.userLocationRole.create({ data: { userId: user.id, roleId: role.id, locationId: loc?.id ?? null } });
          seen.add(phone); created += 1;
          results.push({ row: i + 1, phone, ok: true });
        } catch (e) { results.push({ row: i + 1, phone, ok: false, error: String(e).slice(0, 60) }); }
      }
      await audit("bulk_invite", "user", null, { created, total: rows.length });
      return NextResponse.json({ created, total: rows.length, results });
    }

    const user = await prisma.user.create({ data: { restaurantId, name: body.name, phone: body.phone, email: body.email ?? null, status: "active", inviteStatus: "pending", payRate: Number(body.payRate) || 0, payType: body.payType ?? "hourly" } });
    if (body.roleId) await prisma.userLocationRole.create({ data: { userId: user.id, roleId: body.roleId, locationId: body.locationId ?? null } });
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

    if (type === "clock_out") {
      const attendance = await prisma.attendance.update({ where: { id }, data: { clockOut: new Date() } });
      await audit("update", "attendance", id, { clockOut: attendance.clockOut });
      return NextResponse.json(attendance);
    }

    if (type === "attendance_adjust") {
      if (!String(data.reason ?? "").trim()) return NextResponse.json({ error: "Reason is required to adjust clock times" }, { status: 400 });
      const before = await prisma.attendance.findUnique({ where: { id } });
      const attendance = await prisma.attendance.update({ where: { id }, data: { ...(data.clockIn && { clockIn: new Date(data.clockIn) }), ...(data.clockOut && { clockOut: new Date(data.clockOut) }), autoClosed: false } });
      await audit("adjust", "attendance", id, { ...data }, before);
      return NextResponse.json(attendance);
    }

    if (type === "resend_invite") {
      const user = await prisma.user.update({ where: { id }, data: { inviteStatus: "pending" } });
      await audit("resend_invite", "user", id, { phone: user.phone });
      return NextResponse.json(user);
    }

    if (type === "swap") {
      const swap = await prisma.shiftSwap.update({ where: { id }, data: { status: data.status } });
      await audit("update", "shift_swap", id, { status: data.status });
      return NextResponse.json(swap);
    }

    if (type === "payroll_config") {
      const cfg = await prisma.adminConfig.upsert({
        where: { restaurantId_scope_key: { restaurantId, scope: "payroll", key: "config" } },
        update: { value: JSON.stringify({ otMultiplier: Number(data.otMultiplier), otThreshold: Number(data.otThreshold) }) },
        create: { restaurantId, scope: "payroll", key: "config", value: JSON.stringify({ otMultiplier: Number(data.otMultiplier), otThreshold: Number(data.otThreshold) }) },
      });
      return NextResponse.json(cfg);
    }

    const user = await prisma.user.update({ where: { id }, data: { ...(data.name !== undefined && { name: data.name }), ...(data.phone !== undefined && { phone: data.phone }), ...(data.email !== undefined && { email: data.email }), ...(data.status !== undefined && { status: data.status }), ...(data.payRate !== undefined && { payRate: Number(data.payRate) }), ...(data.payType !== undefined && { payType: data.payType }) } });
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
    await prisma.user.update({ where: { id }, data: { status: reactivate ? "active" : "inactive" } });
    await audit(reactivate ? "reactivate" : "delete", "user", id, { reason });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
