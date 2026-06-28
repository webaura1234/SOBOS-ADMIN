import { NextResponse } from "next/server";
import { db, sbError } from "@/lib/db";
import { audit } from "@/lib/api-helpers";

export async function GET() {
  const sb = db();
  const [integrationsResult, logsResult] = await Promise.all([
    sb.from("Integration").select("*").order("provider", { ascending: true }),
    sb.from("SyncLog").select("*").order("createdAt", { ascending: false }).limit(60),
  ]);
  if (integrationsResult.error) sbError(integrationsResult.error, "integrations/GET");
  if (logsResult.error) sbError(logsResult.error, "integrations/logs");
  return NextResponse.json({ integrations: integrationsResult.data ?? [], logs: logsResult.data ?? [] });
}

export async function PATCH(req: Request) {
  try {
    const body = await req.json();
    const { id, enabled, config, type } = body;
    const sb = db();

    const { data: integration, error: findErr } = await sb.from("Integration").select("*").eq("id", id).maybeSingle();
    if (findErr) sbError(findErr, "integrations/find");
    if (!integration) return NextResponse.json({ error: "Integration not found" }, { status: 404 });

    if (type === "sync") {
      const ok = Math.random() > 0.15;
      const { error: logErr } = await sb.from("SyncLog").insert({
        id: crypto.randomUUID(),
        integrationId: id,
        provider: integration.provider,
        status: ok ? "success" : "failure",
        message: ok
          ? `Synced ${integration.provider} at ${new Date().toLocaleTimeString()}`
          : "Sync failed — check credentials",
      });
      if (logErr) sbError(logErr, "integrations/syncLog");
      const { data: updated, error: updateErr } = await sb
        .from("Integration")
        .update({ lastSync: new Date().toISOString(), syncStatus: ok ? "success" : "failure" })
        .eq("id", id)
        .select()
        .single();
      if (updateErr) sbError(updateErr, "integrations/sync");
      await audit("sync", "integration", id, { provider: integration.provider, ok });
      return NextResponse.json(updated);
    }

    const updates: Record<string, unknown> = {};
    if (enabled !== undefined) {
      updates.enabled = enabled;
      updates.lastSync = enabled ? new Date().toISOString() : null;
      updates.syncStatus = enabled ? "success" : "idle";
    }
    if (config) updates.config = JSON.stringify(config);

    const { data: updated, error: updateErr } = await sb.from("Integration").update(updates).eq("id", id).select().single();
    if (updateErr) sbError(updateErr, "integrations/PATCH");

    if (enabled !== undefined) {
      const { error: logErr } = await sb.from("SyncLog").insert({
        id: crypto.randomUUID(),
        integrationId: id,
        provider: integration.provider,
        status: "success",
        message: enabled ? "Integration enabled" : "Integration disabled",
      });
      if (logErr) sbError(logErr, "integrations/statusLog");
    }

    await audit("update", "integration", id, { enabled, config: config ? "***" : undefined });
    return NextResponse.json(updated);
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 400 });
  }
}
