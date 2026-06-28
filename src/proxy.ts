import { NextRequest, NextResponse } from "next/server";
import { updateSession } from "@/utils/supabase/middleware";

const PUBLIC_PATHS = ["/login", "/api/auth/login", "/_next", "/favicon.ico"];

const ROUTE_PERMISSIONS: Record<string, string> = {
  "/settings": "settings.restaurant",
  "/integrations": "settings.integrations",
  "/audit": "settings.restaurant",
  "/payments": "settings.restaurant",
  "/setup": "settings.restaurant",
};

const API_PERMISSIONS: Record<string, string> = {
  "/api/settings": "settings.restaurant",
  "/api/integrations": "settings.integrations",
  "/api/payments": "settings.restaurant",
  "/api/audit": "settings.restaurant",
  "/api/admin-config": "settings.restaurant",
  "/api/saved-views": "reports.view",
};

const MANAGER_PERMISSIONS = new Set([
  "reports.view",
  "reports.export",
  "menu.create",
  "menu.edit",
  "menu.delete",
  "menu.availability",
  "inventory.view",
  "inventory.adjust",
  "tables.manage",
  "orders.cancel_preparing",
  "payments.refund",
  "staff.manage",
]);

function permissionFor(pathname: string, map: Record<string, string>) {
  const match = Object.keys(map).find((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return match ? map[match] : null;
}

function isPublic(pathname: string) {
  return PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`));
}

export async function proxy(req: NextRequest) {
  const supabaseResponse = await updateSession(req);
  const { pathname } = req.nextUrl;
  if (isPublic(pathname)) return supabaseResponse;

  const role = req.cookies.get("sobosRole")?.value;
  if (!role) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    }
    const loginUrl = req.nextUrl.clone();
    loginUrl.pathname = "/login";
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  if (role === "owner") return supabaseResponse;

  const permission = pathname.startsWith("/api/")
    ? permissionFor(pathname, API_PERMISSIONS)
    : permissionFor(pathname, ROUTE_PERMISSIONS);

  if (permission && !MANAGER_PERMISSIONS.has(permission)) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Permission denied" }, { status: 403 });
    }
    const dashboardUrl = req.nextUrl.clone();
    dashboardUrl.pathname = "/dashboard";
    dashboardUrl.searchParams.set("denied", permission);
    return NextResponse.redirect(dashboardUrl);
  }

  return supabaseResponse;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
