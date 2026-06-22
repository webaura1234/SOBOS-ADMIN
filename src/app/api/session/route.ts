import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const requestedRole = req.cookies.get("sobosRole")?.value ?? req.nextUrl.searchParams.get("role")?.toLowerCase();
  const roleName = requestedRole === "manager" ? "Manager" : "Owner";

  const user = await prisma.user.findFirst({
    where: {
      status: "active",
      locationRoles: { some: { role: { name: roleName } } },
    },
    include: {
      restaurant: { select: { id: true, name: true } },
      locationRoles: {
        include: {
          location: { select: { id: true, name: true } },
          role: {
            include: {
              permissions: {
                include: { permission: true },
              },
            },
          },
        },
      },
    },
  });

  if (!user) return NextResponse.json({ error: "No active demo user found" }, { status: 404 });

  const permissions = Array.from(
    new Set(
      user.locationRoles.flatMap((assignment) =>
        assignment.role.permissions.map(({ permission }) => `${permission.resource}.${permission.action}`)
      )
    )
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
