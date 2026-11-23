import type { SSEEvent } from '@map-exporter/contracts';
import type { Db } from '../db/client.js';
import type { Logger } from '../shared/logging/logger.js';

export type EventHandler = (event: SSEEvent) => void;

export interface EventBus {
  publish(event: SSEEvent): Promise<void>;
  subscribe(handler: EventHandler): () => void;
  close(): Promise<void>;
}

/**
 * A reference-only envelope sent through NOTIFY when the full payload does not fit
 * in PostgreSQL's 8000-byte limit. Subscribers hydrate it from the database.
 */
export interface EventEnvelope {
  type: SSEEvent['type'];
  data?: SSEEvent['data'];
  ref?: { id: string };
}

export type EventHydrator = (envelope: EventEnvelope) => Promise<SSEEvent | null>;

const CHANNEL = 'map_exporter_events';
const MAX_NOTIFY_BYTES = 7000;

/**
 * Cross-process event bus built on PostgreSQL LISTEN/NOTIFY so the API process can
 * stream events produced by the worker process without extra infrastructure.
 */
export class PgEventBus implements EventBus {
  private readonly handlers = new Set<EventHandler>();
  private listener: { unlisten: () => Promise<void> } | null = null;
  private listening: Promise<void> | null = null;

  constructor(
    private readonly db: Db,
    private readonly logger: Logger,
    private readonly hydrate: EventHydrator,
  ) {}

  async publish(event: SSEEvent): Promise<void> {
    const full = JSON.stringify({ type: event.type, data: event.data } satisfies EventEnvelope);
    let payload = full;
    if (Buffer.byteLength(full, 'utf8') > MAX_NOTIFY_BYTES) {
      const id = (event.data as { id?: string }).id;
      if (!id) {
        this.logger.warn({ type: event.type }, 'event too large for NOTIFY and has no id; dropping');
        return;
      }
      payload = JSON.stringify({ type: event.type, ref: { id } } satisfies EventEnvelope);
    }
    await this.db.notify(CHANNEL, payload);
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    void this.ensureListening();
    return () => {
      this.handlers.delete(handler);
    };
  }

  private ensureListening(): Promise<void> {
    if (!this.listening) {
      this.listening = this.db
        .listen(CHANNEL, (payload) => void this.onPayload(payload), () => {
          this.logger.info('event bus listening');
        })
        .then((l) => {
          this.listener = l;
        })
        .catch((err) => {
          this.logger.error({ err }, 'event bus LISTEN failed');
          this.listening = null;
        });
    }
    return this.listening;
  }

  private async onPayload(payload: string): Promise<void> {
    let envelope: EventEnvelope;
    try {
      envelope = JSON.parse(payload) as EventEnvelope;
    } catch (err) {
      this.logger.warn({ err }, 'invalid event payload');
      return;
    }
    let event: SSEEvent | null;
    if (envelope.data !== undefined) {
      event = { type: envelope.type, data: envelope.data } as SSEEvent;
    } else {
      try {
        event = await this.hydrate(envelope);
      } catch (err) {
        this.logger.warn({ err, type: envelope.type }, 'event hydration failed');
        return;
      }
    }
    if (!event) return;
    for (const handler of this.handlers) {
      try {
        handler(event);
      } catch (err) {
        this.logger.error({ err }, 'event handler threw');
      }
    }
  }

  async close(): Promise<void> {
    this.handlers.clear();
    if (this.listener) {
      await this.listener.unlisten().catch(() => {});
      this.listener = null;
    }
    this.listening = null;
  }
}

/** In-memory bus for tests. */
export class MemoryEventBus implements EventBus {
  private readonly handlers = new Set<EventHandler>();
  readonly published: SSEEvent[] = [];

  async publish(event: SSEEvent): Promise<void> {
    this.published.push(event);
    for (const h of this.handlers) h(event);
  }

  subscribe(handler: EventHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  async close(): Promise<void> {
    this.handlers.clear();
  }
}
