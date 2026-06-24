import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit, getRestaurantId } from "@/lib/api-helpers";

const DAY = 86400000;

type Cust = Awaited<ReturnType<typeof prisma.customer.findMany>>[number];

function classify(customers: Cust[]) {
  const now = Date.now();
  const spendSorted = [...customers].sort((a, b) => b.totalSpend - a.totalSpend);
  const vipCut = new Set(spendSorted.slice(0, Math.max(1, Math.ceil(customers.length * 0.1))).map((c) => c.id));
  const inWindow = (c: Cust, lo: number, hi: number) => c.lastVisit && (now - new Date(c.lastVisit).getTime()) >= lo && (now - new Date(c.lastVisit).getTime()) < hi;
  const groups = {
    vip: customers.filter((c) => vipCut.has(c.id) && c.totalSpend > 0),
    new: customers.filter((c) => now - new Date(c.createdAt).getTime() < 30 * DAY && c.visitCount <= 1),
    regular: customers.filter((c) => inWindow(c, 0, 30 * DAY)),
    atRisk: customers.filter((c) => inWindow(c, 30 * DAY, 60 * DAY)),
    lapsed: customers.filter((c) => !c.lastVisit || now - new Date(c.lastVisit).getTime() >= 60 * DAY),
  };
  return groups;
}

export async function GET() {
  const restaurantId = await getRestaurantId();
  const [customers, campaigns, reservations, loyalty, autoOffers, referral, waitlist] = await Promise.all([
    prisma.customer.findMany({ orderBy: { totalSpend: "desc" } }),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.reservation.findMany({ include: { customer: true, table: { select: { label: true } } }, orderBy: { dateTime: "asc" } }),
    prisma.loyaltyProgram.findFirst(),
    prisma.autoOffer.findMany({ where: { restaurantId } }),
    prisma.referralConfig.findFirst({ where: { restaurantId } }),
    prisma.waitlist.findMany({ where: { status: { in: ["waiting", "notified"] } }, orderBy: { createdAt: "asc" } }),
  ]);

  const groups = classify(customers);
  const segments = {
    counts: { vip: groups.vip.length, regular: groups.regular.length, atRisk: groups.atRisk.length, lapsed: groups.lapsed.length, new: groups.new.length },
    members: groups,
  };

  // Ensure auto-offer + referral rows exist (singletons).
  const offerMap = Object.fromEntries(autoOffers.map((o) => [o.type, o]));

  return NextResponse.json({ customers, campaigns, reservations, loyalty, segments, autoOffers: offerMap, referral, waitlist });
}

function segmentMembers(customers: Cust[], segment: string): Cust[] {
  const g = classify(customers);
  const key = segment.toLowerCase().replace(/[^a-z]/g, "");
  if (key === "vip") return g.vip;
  if (key === "regular") return g.regular;
  if (key === "atrisk") return g.atRisk;
  if (key === "lapsed") return g.lapsed;
  if (key === "new") return g.new;
  return customers;
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (body.type === "campaign") {
      const customers = await prisma.customer.findMany();
      const recipients = segmentMembers(customers, body.segment).filter((c) => !c.optedOut);
      const send = body.status === "sent";
      const campaign = await prisma.campaign.create({
        data: {
          name: body.name, segment: body.segment, message: body.message, channel: body.channel ?? "whatsapp",
          offerCode: body.offerCode || null, status: body.status ?? "draft",
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
          sentCount: send ? recipients.length : 0,
          readCount: send ? Math.round(recipients.length * 0.6) : 0,
          recipients: send ? { create: recipients.map((c) => ({ customerId: c.id, status: "sent" })) } : undefined,
        },
      });
      await audit("create", "campaign", campaign.id, campaign);
      return NextResponse.json(campaign, { status: 201 });
    }

    if (body.type === "reservation") {
      const reservation = await prisma.reservation.create({
        data: {
          locationId: body.locationId, tableId: body.tableId || null, customerId: body.customerId || null,
          guestName: body.guestName, guestPhone: body.guestPhone ?? null, partySize: Number(body.partySize),
          dateTime: new Date(body.dateTime), duration: Number(body.duration) || 90,
          specialRequests: body.specialRequests ?? null, preOrder: body.preOrder ?? null,
          noShowScore: body.noShowScore ?? 20,
        },
        include: { table: { select: { label: true } }, customer: true },
      });
      await audit("create", "reservation", reservation.id, reservation);
      return NextResponse.json(reservation, { status: 201 });
    }

    if (body.type === "waitlist") {
      const entry = await prisma.waitlist.create({
        data: { locationId: body.locationId, guestName: body.guestName, phone: body.phone ?? null, partySize: Number(body.partySize), estWaitMin: Number(body.estWaitMin) || 15, notifyChannel: body.notifyChannel ?? "sms" },
      });
      await audit("create", "waitlist", entry.id, entry);
      return NextResponse.json(entry, { status: 201 });
    }

    const customer = await prisma.customer.create({
      data: { name: body.name, phone: body.phone, email: body.email ?? null, tier: body.tier ?? "silver" },
    });
    await audit("create", "customer", customer.id, customer);
    return NextResponse.json(customer, { status: 201 });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json();
    const restaurantId = await getRestaurantId();
    const { type, id, ...data } = body;

    if (type === "loyalty") {
      const loyalty = await prisma.loyaltyProgram.update({ where: { id }, data });
      await audit("update", "loyalty_program", id, data);
      return NextResponse.json(loyalty);
    }

    if (type === "autoOffer") {
      const offer = await prisma.autoOffer.upsert({
        where: { restaurantId_type: { restaurantId, type: data.offerKind } },
        update: { enabled: data.enabled, daysBefore: Number(data.daysBefore), offerType: data.offerType, value: Number(data.value), validityDays: Number(data.validityDays), channel: data.channel, skipLapsed: data.skipLapsed },
        create: { restaurantId, type: data.offerKind, enabled: data.enabled, daysBefore: Number(data.daysBefore), offerType: data.offerType, value: Number(data.value), validityDays: Number(data.validityDays), channel: data.channel, skipLapsed: data.skipLapsed },
      });
      await audit("update", "auto_offer", offer.id, offer);
      return NextResponse.json(offer);
    }

    if (type === "referral") {
      const referral = await prisma.referralConfig.upsert({
        where: { restaurantId },
        update: { enabled: data.enabled, referrerReward: Number(data.referrerReward), refereeReward: Number(data.refereeReward), maxPerMonth: Number(data.maxPerMonth), trigger: data.trigger },
        create: { restaurantId, enabled: data.enabled, referrerReward: Number(data.referrerReward), refereeReward: Number(data.refereeReward), maxPerMonth: Number(data.maxPerMonth), trigger: data.trigger ?? "referee_first_order" },
      });
      await audit("update", "referral_config", referral.id, referral);
      return NextResponse.json(referral);
    }

    if (type === "waitlist") {
      const entry = await prisma.waitlist.update({ where: { id }, data: { status: data.status } });
      await audit("update", "waitlist", id, data);
      return NextResponse.json(entry);
    }

    if (type === "reservation") {
      const reservation = await prisma.reservation.update({
        where: { id },
        data: {
          ...(data.guestName !== undefined && { guestName: data.guestName }),
          ...(data.partySize !== undefined && { partySize: Number(data.partySize) }),
          ...(data.dateTime && { dateTime: new Date(data.dateTime) }),
          ...(data.tableId !== undefined && { tableId: data.tableId || null }),
          ...(data.status !== undefined && { status: data.status }),
          ...(data.specialRequests !== undefined && { specialRequests: data.specialRequests }),
          ...(data.reminderConfirmed !== undefined && { reminderConfirmed: data.reminderConfirmed }),
          ...(data.preOrder !== undefined && { preOrder: data.preOrder }),
        },
        include: { table: { select: { label: true } }, customer: true },
      });
      await audit("update", "reservation", id, data);
      return NextResponse.json(reservation);
    }

    if (type === "campaign") {
      const campaign = await prisma.campaign.update({ where: { id }, data });
      return NextResponse.json(campaign);
    }

    // Customer edit (incl. rich profile fields)
    const customer = await prisma.customer.update({
      where: { id },
      data: {
        ...(data.name !== undefined && { name: data.name }),
        ...(data.phone !== undefined && { phone: data.phone }),
        ...(data.email !== undefined && { email: data.email }),
        ...(data.tier !== undefined && { tier: data.tier }),
        ...(data.dietaryNotes !== undefined && { dietaryNotes: data.dietaryNotes }),
        ...(data.serviceNotes !== undefined && { serviceNotes: data.serviceNotes }),
        ...(data.tags !== undefined && { tags: JSON.stringify(data.tags) }),
        ...(data.favoriteDishes !== undefined && { favoriteDishes: JSON.stringify(data.favoriteDishes) }),
        ...(data.optedOut !== undefined && { optedOut: data.optedOut }),
        ...(data.birthday !== undefined && { birthday: data.birthday ? new Date(data.birthday) : null }),
        ...(data.anniversary !== undefined && { anniversary: data.anniversary ? new Date(data.anniversary) : null }),
      },
    });
    await audit("update", "customer", id, data);
    return NextResponse.json(customer);
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
    if (type === "reservation") await prisma.reservation.update({ where: { id }, data: { status: "cancelled" } });
    else if (type === "campaign") await prisma.campaign.delete({ where: { id } });
    else if (type === "waitlist") await prisma.waitlist.delete({ where: { id } });
    else await prisma.customer.delete({ where: { id } });
    await audit("delete", type ?? "customer", id, { reason });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
