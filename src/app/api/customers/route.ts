import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit, getRestaurantId } from "@/lib/api-helpers";

const DAY = 86400000;

type Cust = {
  id: string;
  name: string;
  phone: string;
  email: string | null;
  tier: string;
  totalSpend: number;
  visitCount: number;
  lastVisit: string | null;
  createdAt: string;
  optedOut: boolean;
  [key: string]: unknown;
};

function classify(customers: Cust[]) {
  const now = Date.now();
  const spendSorted = [...customers].sort((a, b) => Number(b.totalSpend) - Number(a.totalSpend));
  const vipCut = new Set(spendSorted.slice(0, Math.max(1, Math.ceil(customers.length * 0.1))).map((c) => c.id));
  const inWindow = (c: Cust, lo: number, hi: number) =>
    c.lastVisit && now - new Date(c.lastVisit).getTime() >= lo && now - new Date(c.lastVisit).getTime() < hi;
  const groups = {
    vip: customers.filter((c) => vipCut.has(c.id) && Number(c.totalSpend) > 0),
    new: customers.filter((c) => now - new Date(c.createdAt).getTime() < 30 * DAY && Number(c.visitCount) <= 1),
    regular: customers.filter((c) => inWindow(c, 0, 30 * DAY)),
    atRisk: customers.filter((c) => inWindow(c, 30 * DAY, 60 * DAY)),
    lapsed: customers.filter((c) => !c.lastVisit || now - new Date(c.lastVisit).getTime() >= 60 * DAY),
  };
  return groups;
}

export async function GET() {
  const restaurantId = await getRestaurantId();
  const sb = db();
  const [customersResult, campaignsResult, reservationsResult, loyaltyResult, autoOffersResult, referralResult, waitlistResult] =
    await Promise.all([
      sb.from("Customer").select("*").order("totalSpend", { ascending: false }),
      sb.from("Campaign").select("*").order("createdAt", { ascending: false }),
      sb
        .from("Reservation")
        .select("*, customer:Customer(*), table:RestaurantTable(label)")
        .order("dateTime", { ascending: true }),
      sb.from("LoyaltyProgram").select("*").limit(1).maybeSingle(),
      sb.from("AutoOffer").select("*").eq("restaurantId", restaurantId),
      sb.from("ReferralConfig").select("*").eq("restaurantId", restaurantId).maybeSingle(),
      sb.from("Waitlist").select("*").in("status", ["waiting", "notified"]).order("createdAt", { ascending: true }),
    ]);

  if (customersResult.error) sbError(customersResult.error, "customers/list");
  if (campaignsResult.error) sbError(campaignsResult.error, "customers/campaigns");
  if (reservationsResult.error) sbError(reservationsResult.error, "customers/reservations");
  if (loyaltyResult.error) sbError(loyaltyResult.error, "customers/loyalty");
  if (autoOffersResult.error) sbError(autoOffersResult.error, "customers/autoOffers");
  if (referralResult.error) sbError(referralResult.error, "customers/referral");
  if (waitlistResult.error) sbError(waitlistResult.error, "customers/waitlist");

  const customers = (customersResult.data ?? []) as Cust[];
  const groups = classify(customers);
  const segments = {
    counts: {
      vip: groups.vip.length,
      regular: groups.regular.length,
      atRisk: groups.atRisk.length,
      lapsed: groups.lapsed.length,
      new: groups.new.length,
    },
    members: groups,
  };

  const offerMap = Object.fromEntries((autoOffersResult.data ?? []).map((o) => [o.type, o]));

  return NextResponse.json({
    customers,
    campaigns: campaignsResult.data ?? [],
    reservations: reservationsResult.data ?? [],
    loyalty: loyaltyResult.data,
    segments,
    autoOffers: offerMap,
    referral: referralResult.data,
    waitlist: waitlistResult.data ?? [],
  });
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
    const sb = db();

    if (body.type === "campaign") {
      const { data: customers, error: custErr } = await sb.from("Customer").select("*");
      if (custErr) sbError(custErr, "customers/campaign/customers");
      const recipients = segmentMembers((customers ?? []) as Cust[], body.segment).filter((c) => !c.optedOut);
      const send = body.status === "sent";
      const campaignId = crypto.randomUUID();
      const { data: campaign, error } = await sb
        .from("Campaign")
        .insert({
          id: campaignId,
          name: body.name,
          segment: body.segment,
          message: body.message,
          channel: body.channel ?? "whatsapp",
          offerCode: body.offerCode || null,
          status: body.status ?? "draft",
          scheduledAt: body.scheduledAt ? new Date(body.scheduledAt).toISOString() : null,
          sentCount: send ? recipients.length : 0,
          readCount: send ? Math.round(recipients.length * 0.6) : 0,
        })
        .select()
        .single();
      if (error) sbError(error, "customers/campaign/create");
      if (send && recipients.length) {
        const { error: recErr } = await sb.from("CampaignRecipient").insert(
          recipients.map((c) => ({ id: crypto.randomUUID(), campaignId, customerId: c.id, status: "sent" })),
        );
        if (recErr) sbError(recErr, "customers/campaign/recipients");
      }
      await audit("create", "campaign", campaign.id, campaign);
      return NextResponse.json(campaign, { status: 201 });
    }

    if (body.type === "reservation") {
      const { data: reservation, error } = await sb
        .from("Reservation")
        .insert({
          id: crypto.randomUUID(),
          locationId: body.locationId,
          tableId: body.tableId || null,
          customerId: body.customerId || null,
          guestName: body.guestName,
          guestPhone: body.guestPhone ?? null,
          partySize: Number(body.partySize),
          dateTime: new Date(body.dateTime).toISOString(),
          duration: Number(body.duration) || 90,
          specialRequests: body.specialRequests ?? null,
          preOrder: body.preOrder ?? null,
          noShowScore: body.noShowScore ?? 20,
        })
        .select("*, table:RestaurantTable(label), customer:Customer(*)")
        .single();
      if (error) sbError(error, "customers/reservation/create");
      await audit("create", "reservation", reservation.id, reservation);
      return NextResponse.json(reservation, { status: 201 });
    }

    if (body.type === "waitlist") {
      const { data: entry, error } = await sb
        .from("Waitlist")
        .insert({
          id: crypto.randomUUID(),
          locationId: body.locationId,
          guestName: body.guestName,
          phone: body.phone ?? null,
          partySize: Number(body.partySize),
          estWaitMin: Number(body.estWaitMin) || 15,
          notifyChannel: body.notifyChannel ?? "sms",
        })
        .select()
        .single();
      if (error) sbError(error, "customers/waitlist/create");
      await audit("create", "waitlist", entry.id, entry);
      return NextResponse.json(entry, { status: 201 });
    }

    const { data: customer, error } = await sb
      .from("Customer")
      .insert({
        id: crypto.randomUUID(),
        name: body.name,
        phone: body.phone,
        email: body.email ?? null,
        tier: body.tier ?? "silver",
      })
      .select()
      .single();
    if (error) sbError(error, "customers/create");
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
    const sb = db();

    if (type === "loyalty") {
      const { data: loyalty, error } = await sb.from("LoyaltyProgram").update(data).eq("id", id).select().single();
      if (error) sbError(error, "customers/loyalty/update");
      await audit("update", "loyalty_program", id, data);
      return NextResponse.json(loyalty);
    }

    if (type === "autoOffer") {
      const { data: existing } = await sb
        .from("AutoOffer")
        .select("id")
        .eq("restaurantId", restaurantId)
        .eq("type", data.offerKind)
        .maybeSingle();
      const payload = {
        id: existing?.id ?? crypto.randomUUID(),
        restaurantId,
        type: data.offerKind,
        enabled: data.enabled,
        daysBefore: Number(data.daysBefore),
        offerType: data.offerType,
        value: Number(data.value),
        validityDays: Number(data.validityDays),
        channel: data.channel,
        skipLapsed: data.skipLapsed,
      };
      const { data: offer, error } = await sb.from("AutoOffer").upsert(payload, { onConflict: "restaurantId,type" }).select().single();
      if (error) sbError(error, "customers/autoOffer");
      await audit("update", "auto_offer", offer.id, offer);
      return NextResponse.json(offer);
    }

    if (type === "referral") {
      const { data: existing } = await sb.from("ReferralConfig").select("id").eq("restaurantId", restaurantId).maybeSingle();
      const payload = {
        id: existing?.id ?? crypto.randomUUID(),
        restaurantId,
        enabled: data.enabled,
        referrerReward: Number(data.referrerReward),
        refereeReward: Number(data.refereeReward),
        maxPerMonth: Number(data.maxPerMonth),
        trigger: data.trigger ?? "referee_first_order",
      };
      const { data: referral, error } = await sb.from("ReferralConfig").upsert(payload, { onConflict: "restaurantId" }).select().single();
      if (error) sbError(error, "customers/referral");
      await audit("update", "referral_config", referral.id, referral);
      return NextResponse.json(referral);
    }

    if (type === "waitlist") {
      const { data: entry, error } = await sb.from("Waitlist").update({ status: data.status }).eq("id", id).select().single();
      if (error) sbError(error, "customers/waitlist/update");
      await audit("update", "waitlist", id, data);
      return NextResponse.json(entry);
    }

    if (type === "reservation") {
      const updates: Record<string, unknown> = {};
      if (data.guestName !== undefined) updates.guestName = data.guestName;
      if (data.partySize !== undefined) updates.partySize = Number(data.partySize);
      if (data.dateTime) updates.dateTime = new Date(data.dateTime).toISOString();
      if (data.tableId !== undefined) updates.tableId = data.tableId || null;
      if (data.status !== undefined) updates.status = data.status;
      if (data.specialRequests !== undefined) updates.specialRequests = data.specialRequests;
      if (data.reminderConfirmed !== undefined) updates.reminderConfirmed = data.reminderConfirmed;
      if (data.preOrder !== undefined) updates.preOrder = data.preOrder;
      const { data: reservation, error } = await sb
        .from("Reservation")
        .update(updates)
        .eq("id", id)
        .select("*, table:RestaurantTable(label), customer:Customer(*)")
        .single();
      if (error) sbError(error, "customers/reservation/update");
      await audit("update", "reservation", id, data);
      return NextResponse.json(reservation);
    }

    if (type === "campaign") {
      const { data: campaign, error } = await sb.from("Campaign").update(data).eq("id", id).select().single();
      if (error) sbError(error, "customers/campaign/update");
      return NextResponse.json(campaign);
    }

    const customerUpdates: Record<string, unknown> = {};
    if (data.name !== undefined) customerUpdates.name = data.name;
    if (data.phone !== undefined) customerUpdates.phone = data.phone;
    if (data.email !== undefined) customerUpdates.email = data.email;
    if (data.tier !== undefined) customerUpdates.tier = data.tier;
    if (data.dietaryNotes !== undefined) customerUpdates.dietaryNotes = data.dietaryNotes;
    if (data.serviceNotes !== undefined) customerUpdates.serviceNotes = data.serviceNotes;
    if (data.tags !== undefined) customerUpdates.tags = JSON.stringify(data.tags);
    if (data.favoriteDishes !== undefined) customerUpdates.favoriteDishes = JSON.stringify(data.favoriteDishes);
    if (data.optedOut !== undefined) customerUpdates.optedOut = data.optedOut;
    if (data.birthday !== undefined) customerUpdates.birthday = data.birthday ? new Date(data.birthday).toISOString() : null;
    if (data.anniversary !== undefined)
      customerUpdates.anniversary = data.anniversary ? new Date(data.anniversary).toISOString() : null;

    const { data: customer, error } = await sb.from("Customer").update(customerUpdates).eq("id", id).select().single();
    if (error) sbError(error, "customers/update");
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
    const sb = db();
    if (type === "reservation") {
      const { error } = await sb.from("Reservation").update({ status: "cancelled" }).eq("id", id);
      if (error) sbError(error, "customers/deleteReservation");
    } else if (type === "campaign") {
      const { error } = await sb.from("Campaign").delete().eq("id", id);
      if (error) sbError(error, "customers/deleteCampaign");
    } else if (type === "waitlist") {
      const { error } = await sb.from("Waitlist").delete().eq("id", id);
      if (error) sbError(error, "customers/deleteWaitlist");
    } else {
      const { error } = await sb.from("Customer").delete().eq("id", id);
      if (error) sbError(error, "customers/delete");
    }
    await audit("delete", type ?? "customer", id, { reason });
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
