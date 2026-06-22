import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET(req: NextRequest) {
  const tab = req.nextUrl.searchParams.get("tab") ?? "all";
  const segment = req.nextUrl.searchParams.get("segment");

  const [customers, campaigns, reservations, loyalty] = await Promise.all([
    prisma.customer.findMany({
      where: segment === "vip" ? { tier: "platinum" } :
        segment === "regular" ? { lastVisit: { gte: new Date(Date.now() - 30 * 86400000) } } :
        undefined,
      orderBy: { totalSpend: "desc" },
    }),
    prisma.campaign.findMany({ orderBy: { createdAt: "desc" } }),
    prisma.reservation.findMany({
      include: { customer: true, table: { select: { label: true } } },
      orderBy: { dateTime: "asc" },
    }),
    prisma.loyaltyProgram.findFirst(),
  ]);

  const segments = {
    vip: customers.filter((c) => c.tier === "platinum" || c.tier === "gold").slice(0, Math.ceil(customers.length * 0.1)).length,
    regular: customers.filter((c) => c.lastVisit && c.lastVisit > new Date(Date.now() - 30 * 86400000)).length,
    atRisk: customers.filter((c) => c.lastVisit && c.lastVisit < new Date(Date.now() - 30 * 86400000) && c.lastVisit > new Date(Date.now() - 60 * 86400000)).length,
    lapsed: customers.filter((c) => !c.lastVisit || c.lastVisit < new Date(Date.now() - 60 * 86400000)).length,
  };

  return NextResponse.json({ customers, campaigns, reservations, loyalty, segments });
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (body.type === "campaign") {
      const campaign = await prisma.campaign.create({
        data: {
          name: body.name,
          segment: body.segment,
          message: body.message,
          channel: body.channel ?? "whatsapp",
          status: body.status ?? "draft",
        },
      });
      await audit("create", "campaign", campaign.id, campaign);
      return NextResponse.json(campaign, { status: 201 });
    }
    if (body.type === "reservation") {
      const reservation = await prisma.reservation.create({
        data: {
          locationId: body.locationId,
          guestName: body.guestName,
          guestPhone: body.guestPhone ?? null,
          partySize: Number(body.partySize),
          dateTime: new Date(body.dateTime),
          specialRequests: body.specialRequests ?? null,
        },
        include: { table: { select: { label: true } } },
      });
      await audit("create", "reservation", reservation.id, reservation);
      return NextResponse.json(reservation, { status: 201 });
    }
    const customer = await prisma.customer.create({
      data: {
        name: body.name,
        phone: body.phone,
        email: body.email ?? null,
        tier: body.tier ?? "silver",
      },
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
    const { type, id, ...data } = body;
    if (type === "loyalty") {
      const loyalty = await prisma.loyaltyProgram.update({ where: { id }, data });
      await audit("update", "loyalty_program", id, data);
      return NextResponse.json(loyalty);
    }
    if (type === "reservation") {
      const reservation = await prisma.reservation.update({
        where: { id },
        data,
        include: { table: { select: { label: true } } },
      });
      await audit("update", "reservation", id, data);
      return NextResponse.json(reservation);
    }
    const customer = await prisma.customer.update({ where: { id }, data });
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
    if (type === "reservation") {
      await prisma.reservation.update({ where: { id }, data: { status: "cancelled" } });
    } else if (type === "campaign") {
      await prisma.campaign.delete({ where: { id } });
    } else {
      await prisma.customer.delete({ where: { id } });
    }
    await audit("delete", type ?? "customer", id, { reason });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
