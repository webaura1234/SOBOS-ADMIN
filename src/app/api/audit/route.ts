import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const search = req.nextUrl.searchParams.get("search") ?? "";
  const action = req.nextUrl.searchParams.get("action");

  const logs = await prisma.auditLog.findMany({
    where: {
      ...(search && {
        OR: [
          { actorName: { contains: search } },
          { resourceType: { contains: search } },
          { resourceId: { contains: search } },
        ],
      }),
      ...(action && { action }),
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  const batches = await prisma.batch.findMany({
    include: { ingredient: true, supplier: { select: { name: true, fssaiLicense: true } } },
    orderBy: { expiryDate: "asc" },
  });

  return NextResponse.json({ logs, batches });
}
