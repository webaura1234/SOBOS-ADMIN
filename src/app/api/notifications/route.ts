import { NextRequest, NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";

export async function GET() {
  const sb = db();
  const [notifResult, countResult] = await Promise.all([
    sb.from("Notification").select("*").order("createdAt", { ascending: false }).limit(20),
    sb.from("Notification").select("*", { count: "exact", head: true }).eq("isRead", false),
  ]);
  if (notifResult.error) sbError(notifResult.error, "notifications/GET");
  if (countResult.error) sbError(countResult.error, "notifications/unreadCount");
  return NextResponse.json({
    notifications: notifResult.data ?? [],
    unreadCount: countResult.count ?? 0,
  });
}

export async function PATCH(req: NextRequest) {
  try {
    const { id, markAllRead } = await req.json();
    const sb = db();
    if (markAllRead) {
      const { error } = await sb.from("Notification").update({ isRead: true }).neq("isRead", true);
      if (error) sbError(error, "notifications/markAllRead");
      return NextResponse.json({ ok: true });
    }
    if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });
    const { data, error } = await sb.from("Notification").update({ isRead: true }).eq("id", id).select().single();
    if (error) sbError(error, "notifications/PATCH");
    return NextResponse.json(data);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
