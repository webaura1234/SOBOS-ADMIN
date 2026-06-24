import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getRestaurantId } from "@/lib/api-helpers";

// Derives onboarding step completion from real admin data (F-02) so the
// Setup checklist reflects what is actually configured, not just manual ticks.
export async function GET() {
  try {
    const restaurantId = await getRestaurantId();

    const [restaurant, locations, tableCount, assignedStaff, menuCount, customerCount] = await Promise.all([
      prisma.restaurant.findUnique({ where: { id: restaurantId } }),
      prisma.location.findMany({
        where: { restaurantId },
        select: { id: true, status: true, address: true, city: true, pin: true, operatingHours: { select: { isClosed: true } } },
      }),
      prisma.restaurantTable.count({ where: { isDeleted: false, location: { restaurantId } } }),
      prisma.userLocationRole.count({ where: { user: { restaurantId } } }),
      prisma.menuItem.count({ where: { restaurantId } }),
      prisma.customer.count(),
    ]);

    const auto = {
      // Profile is "done" once identity + statutory ids + a contact are filled.
      profile: !!(restaurant?.name && restaurant.fssai && restaurant.gstin && (restaurant.email || restaurant.phone)),
      // A usable location needs a full postal address.
      location: locations.some((l) => l.address && l.city && l.pin),
      // Hours are configured once a location is open at least one day.
      hours: locations.some((l) => l.operatingHours.some((h) => !h.isClosed)),
      tables: tableCount > 0,
      // Optional: at least one staff member assigned a role/location.
      staff: assignedStaff > 0,
      // Optional: any menu or customer data has been imported/created.
      migration: menuCount > 0 || customerCount > 0,
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
