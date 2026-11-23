import type { FastifyInstance, FastifyReply } from 'fastify';
import type { SSEEvent } from '@map-exporter/contracts';
import type { EventBus } from './event-bus.js';

const HEARTBEAT_MS = 15_000;

export function formatSseMessage(event: SSEEvent, id?: number): string {
  const lines: string[] = [];
  if (id !== undefined) lines.push(`id: ${id}`);
  lines.push(`event: ${event.type}`);
  lines.push(`data: ${JSON.stringify(event.data)}`);
  return `${lines.join('\n')}\n\n`;
}

/**
 * GET /api/events — one global Server-Sent Events stream.
 * Progress throttling happens on the producer side (worker), so every event
 * reaching this stream is forwarded as-is.
 */
export function registerSseRoute(app: FastifyInstance, bus: EventBus): void {
  let counter = 0;
  const clients = new Set<FastifyReply>();

  app.get('/api/events', (request, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': request.headers.origin ?? '*',
    });
    reply.raw.write(`retry: 2000\n\n`);
    reply.raw.write(`event: connected\ndata: ${JSON.stringify({ at: new Date().toISOString() })}\n\n`);
    clients.add(reply);

    const unsubscribe = bus.subscribe((event) => {
      counter += 1;
      reply.raw.write(formatSseMessage(event, counter));
    });

    const heartbeat = setInterval(() => {
      reply.raw.write(`: ping\n\n`);
    }, HEARTBEAT_MS);

    const cleanup = () => {
      clearInterval(heartbeat);
      unsubscribe();
      clients.delete(reply);
    };
    request.raw.on('close', cleanup);
    request.raw.on('error', cleanup);

    // Fastify must not touch the reply any further.
    return reply;
  });

  app.addHook('onClose', async () => {
    for (const reply of clients) {
      try {
        reply.raw.end();
      } catch {
        // ignore
      }
    }
    clients.clear();
  });
}
