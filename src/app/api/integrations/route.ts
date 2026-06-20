import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { audit } from "@/lib/api-helpers";

export async function GET() {
  const integrations = await prisma.integration.findMany({ orderBy: { provider: "asc" } });
  return NextResponse.json(integrations);
}

export async function PATCH(req: Request) {
  try {
    const { id, enabled, config } = await req.json();
    const integration = await prisma.integration.update({
      where: { id },
      data: {
        ...(enabled !== undefined && { enabled }),
        ...(config && { config: JSON.stringify(config) }),
        lastSync: enabled ? new Date() : undefined,
        syncStatus: enabled ? "success" : "idle",
      },
    });
    await audit("update", "integration", id, { enabled, config });
    return NextResponse.json(integration);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
