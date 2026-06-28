import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";

export async function GET(req: NextRequest) {
  const requestedRole = req.cookies.get("sobosRole")?.value ?? req.nextUrl.searchParams.get("role")?.toLowerCase();
  const roleName = requestedRole === "manager" ? "Manager" : "Owner";

  const { data: users, error } = await db()
    .from("User")
    .select(
      "*, restaurant:Restaurant(id, name), locationRoles:UserLocationRole(*, location:Location(id, name), role:Role(*, permissions:RolePermission(permission:Permission(*))))",
    )
    .eq("status", "active");
  if (error) sbError(error, "session/GET");

  const user = (users ?? []).find((u) =>
    (u.locationRoles as { role: { name: string } }[] | null)?.some((lr) => lr.role?.name === roleName),
  ) as
    | {
        id: string;
        name: string;
        email: string | null;
        phone: string;
        restaurant: { id: string; name: string } | null;
        locationRoles: {
          location: { id: string; name: string } | null;
          role: { name: string; permissions: { permission: { resource: string; action: string } }[] };
        }[];
      }
    | undefined;

  if (!user) return NextResponse.json({ error: "No active demo user found" }, { status: 404 });

  const permissions = Array.from(
    new Set(
      user.locationRoles.flatMap((assignment) =>
        (assignment.role.permissions ?? []).map(({ permission }) => `${permission.resource}.${permission.action}`),
      ),
    ),
  ).sort();

  const primaryRole = user.locationRoles[0]?.role.name.toLowerCase() === "manager" ? "manager" : "owner";

  return NextResponse.json({
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: primaryRole,
      locations: user.locationRoles.map((assignment) => assignment.location).filter(Boolean),
    },
    restaurant: user.restaurant,
    permissions,
  });
}
