import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  let afterId = BigInt(searchParams.get("after") ?? "0");

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      let closed = false;

      const send = (event: string, data: unknown) => {
        if (closed) return;
        controller.enqueue(
          encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`),
        );
      };

      send("ready", { after: afterId.toString() });

      const poll = async () => {
        if (closed) return;
        try {
          // Retention: outbox is a short-lived invalidation stream, not a durable log.
          await prisma.outboxEvent.deleteMany({
            where: {
              createdAt: {
                lt: new Date(Date.now() - 24 * 60 * 60 * 1000),
              },
            },
          });

          const events = await prisma.outboxEvent.findMany({
            where: { id: { gt: afterId } },
            orderBy: { id: "asc" },
            take: 50,
          });

          for (const event of events) {
            afterId = event.id;
            send("outbox", {
              id: event.id.toString(),
              type: event.type,
              payload: event.payload,
              createdAt: event.createdAt.toISOString(),
            });
          }
        } catch (error) {
          send("error", {
            message: error instanceof Error ? error.message : "poll failed",
          });
        }
      };

      const interval = setInterval(() => {
        void poll();
      }, 1500);

      void poll();

      request.signal.addEventListener("abort", () => {
        closed = true;
        clearInterval(interval);
        try {
          controller.close();
        } catch {
          // already closed
        }
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
