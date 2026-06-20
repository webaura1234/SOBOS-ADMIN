import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const [notifications, unreadCount] = await Promise.all([
    prisma.notification.findMany({ orderBy: { createdAt: "desc" }, take: 20 }),
    prisma.notification.count({ where: { isRead: false } }),
  ]);
  return NextResponse.json({ notifications, unreadCount });
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, markAllRead } = await req.json();
    if (markAllRead) {
      await prisma.notification.updateMany({ data: { isRead: true } });
      return NextResponse.json({ ok: true });
    }
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const notification = await prisma.notification.update({
      where: { id },
      data: { isRead: true },
    });
    return NextResponse.json(notification);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
