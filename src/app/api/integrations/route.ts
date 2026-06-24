import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET() {
  const [integrations, logs] = await Promise.all([
    prisma.integration.findMany({ orderBy: { provider: "asc" } }),
    prisma.syncLog.findMany({ orderBy: { createdAt: "desc" }, take: 60 }),
  ]);
  return NextResponse.json({ integrations, logs });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, enabled, config, type } = body;
    const integration = await prisma.integration.findUnique({ where: { id } });
    if (!integration) return NextResponse.json({ error: "Integration not found" }, { status: 404 });

    if (type === "sync") {
      // Force/manual sync → record a sync-log entry.
      const ok = Math.random() > 0.15;
      await prisma.syncLog.create({ data: { integrationId: id, provider: integration.provider, status: ok ? "success" : "failure", message: ok ? `Synced ${integration.provider} at ${new Date().toLocaleTimeString()}` : `Sync failed — check credentials` } });
      const updated = await prisma.integration.update({ where: { id }, data: { lastSync: new Date(), syncStatus: ok ? "success" : "failure" } });
      await audit("sync", "integration", id, { provider: integration.provider, ok });
      return NextResponse.json(updated);
    }

    const updated = await prisma.integration.update({
      where: { id },
      data: {
        ...(enabled !== undefined && { enabled }),
        ...(config && { config: JSON.stringify(config) }),
        ...(enabled !== undefined && { lastSync: enabled ? new Date() : null, syncStatus: enabled ? "success" : "idle" }),
      },
    });
    if (enabled !== undefined) await prisma.syncLog.create({ data: { integrationId: id, provider: integration.provider, status: "success", message: enabled ? "Integration enabled" : "Integration disabled" } });
    await audit("update", "integration", id, { enabled, config: config ? "***" : undefined });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
