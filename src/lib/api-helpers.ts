import { prisma } from "@/lib/prisma";

export async function getRestaurantId() {
  const r = await prisma.restaurant.findFirst({ select: { id: true } });
  if (!r) throw new Error("No restaurant found");
  return r.id;
}

export async function audit(
  action: string,
  resourceType: string,
  resourceId: string | null,
  after?: unknown,
  before?: unknown
) {
  await prisma.auditLog.create({
    data: {
      actorName: "Rajesh Kumar",
      action,
      resourceType,
      resourceId,
      beforeJson: before ? JSON.stringify(before) : null,
      afterJson: after ? JSON.stringify(after) : null,
    },
  });
}

export function calcMargin(price: number, cost: number) {
  if (price <= 0) return 0;
  return Math.round(((price - cost) / price) * 1000) / 10;
}
