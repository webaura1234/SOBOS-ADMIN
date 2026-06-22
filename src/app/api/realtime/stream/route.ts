import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function getOpsSummary(locationId: string | null) {
  const [activeOrders, stockRows] = await Promise.all([
    prisma.order.count({
      where: {
        ...(locationId && { locationId }),
        status: { in: ["pending", "confirmed", "preparing", "ready"] },
      },
    }),
    prisma.stock.findMany({
      where: locationId ? { locationId } : {},
      include: { ingredient: { select: { threshold: true } } },
    }),
  ]);
  const lowStockCount = stockRows.filter((row) => row.quantity <= row.ingredient.threshold).length;
  return { activeOrders, lowStockCount, at: new Date().toISOString() };
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
