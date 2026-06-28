import { NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { getRestaurantId } from "@/lib/api-helpers";

export async function GET() {
  try {
    const restaurantId = await getRestaurantId();
    const sb = db();

    const [restaurantResult, locationsResult, menuCountResult, customerCountResult] = await Promise.all([
      sb.from("Restaurant").select("*").eq("id", restaurantId).maybeSingle(),
      sb
        .from("Location")
        .select("id, status, address, city, pin, operatingHours:OperatingHours(isClosed)")
        .eq("restaurantId", restaurantId),
      sb.from("MenuItem").select("*", { count: "exact", head: true }).eq("restaurantId", restaurantId),
      sb.from("Customer").select("*", { count: "exact", head: true }),
    ]);

    if (restaurantResult.error) sbError(restaurantResult.error, "setup/status/restaurant");
    if (locationsResult.error) sbError(locationsResult.error, "setup/status/locations");
    if (menuCountResult.error) sbError(menuCountResult.error, "setup/status/menu");
    if (customerCountResult.error) sbError(customerCountResult.error, "setup/status/customers");

    const restaurant = restaurantResult.data;
    const locations = (locationsResult.data ?? []) as {
      id: string;
      status: string;
      address: string;
      city: string;
      pin: string;
      operatingHours: { isClosed: boolean }[];
    }[];

    const locationIds = locations.map((l) => l.id);
    let tableCount = 0;
    let assignedStaff = 0;
    if (locationIds.length > 0) {
      const { count, error } = await sb
        .from("RestaurantTable")
        .select("*", { count: "exact", head: true })
        .eq("isDeleted", false)
        .in("locationId", locationIds);
      if (error) sbError(error, "setup/status/tables");
      tableCount = count ?? 0;
    }

    const { data: restaurantUsers } = await sb.from("User").select("id").eq("restaurantId", restaurantId);
    const userIds = (restaurantUsers ?? []).map((u) => u.id);
    if (userIds.length > 0) {
      const { count, error } = await sb
        .from("UserLocationRole")
        .select("*", { count: "exact", head: true })
        .in("userId", userIds);
      if (error) sbError(error, "setup/status/staff");
      assignedStaff = count ?? 0;
    }

    const auto = {
      profile: !!(restaurant?.name && restaurant.fssai && restaurant.gstin && (restaurant.email || restaurant.phone)),
      location: locations.some((l) => l.address && l.city && l.pin),
      hours: locations.some((l) => l.operatingHours.some((h) => !h.isClosed)),
      tables: tableCount > 0,
      staff: assignedStaff > 0,
      migration: (menuCountResult.count ?? 0) > 0 || (customerCountResult.count ?? 0) > 0,
    };

    return NextResponse.json({
      auto,
      tableCount,
      locationCount: locations.length,
      liveLocations: locations.filter((l) => l.status === "active").length,
      pendingLocations: locations.filter((l) => l.status === "setup" || l.status === "pending_setup").length,
      restaurantName: restaurant?.name ?? null,
    });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
