import { NextRequest, NextResponse } from "next/server";

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const role = body.role === "manager" ? "manager" : "owner";
  const response = NextResponse.json({ ok: true, role });
  response.cookies.set("sobosRole", role, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 12,
  });
  return response;
}
