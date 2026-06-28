import { NextRequest } from "next/server";
import { db, sbError } from "@/lib/db";

export const dynamic = "force-dynamic";

async function getOpsSummary(locationId: string | null) {
  const sb = db();
  let orderQ = sb
    .from("Order")
    .select("*", { count: "exact", head: true })
    .in("status", ["pending", "confirmed", "preparing", "ready"]);
  if (locationId) orderQ = orderQ.eq("locationId", locationId);

  let stockQ = sb.from("Stock").select("quantity, ingredient:Ingredient(threshold)");
  if (locationId) stockQ = stockQ.eq("locationId", locationId);

  const [orderResult, stockResult] = await Promise.all([orderQ, stockQ]);
  if (orderResult.error) sbError(orderResult.error, "realtime/activeOrders");
  if (stockResult.error) sbError(stockResult.error, "realtime/stock");

  const stockRows = (stockResult.data ?? []) as unknown as { quantity: number; ingredient: { threshold: number } }[];
  const lowStockCount = stockRows.filter((row) => row.quantity <= row.ingredient.threshold).length;
  return { activeOrders: orderResult.count ?? 0, lowStockCount, at: new Date().toISOString() };
}

export async function GET(req: NextRequest) {
  const locationId = req.nextUrl.searchParams.get("locationId");
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = async () => {
        try {
          const payload = await getOpsSummary(locationId);
          controller.enqueue(encoder.encode(`event: ops-summary\ndata: ${JSON.stringify(payload)}\n\n`));
        } catch (e) {
          controller.enqueue(encoder.encode(`event: error\ndata: ${JSON.stringify({ error: String(e) })}\n\n`));
        }
      };

      await send();
      const interval = setInterval(send, 5000);
      req.signal.addEventListener("abort", () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
