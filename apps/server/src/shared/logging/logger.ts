import type { FastifyBaseLogger } from 'fastify';

export type Logger = FastifyBaseLogger;

function serializeRequest(req: Record<string, unknown>): Record<string, unknown> {
  const raw = (req.raw ?? req) as Record<string, unknown>;
  const socket = raw.socket as { remoteAddress?: string; remotePort?: number } | undefined;
  return {
    id: req.id,
    method: req.method ?? raw.method,
    url: req.url ?? raw.url,
    remoteAddress: req.ip ?? socket?.remoteAddress,
    remotePort: socket?.remotePort,
  };
}

function serializeResponse(res: Record<string, unknown>): Record<string, unknown> {
  const raw = (res.raw ?? res) as Record<string, unknown>;
  return { statusCode: res.statusCode ?? raw.statusCode };
}

/** JSON.stringify that never throws on cycles or exotic values. */
function safeStringify(value: unknown): string {
  const seen = new WeakSet<object>();
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v === 'bigint') return v.toString();
    if (typeof v === 'object' && v !== null) {
      if (seen.has(v)) return '[Circular]';
      seen.add(v);
    }
    return v;
  });
}

/** Minimal structured logger used outside Fastify (worker, CLI). Writes JSON lines to stderr. */
export function createStdLogger(level: string, bindings: Record<string, unknown> = {}): Logger {
  const levels = ['trace', 'debug', 'info', 'warn', 'error', 'fatal'] as const;
  const threshold = Math.max(0, levels.indexOf(level as (typeof levels)[number]));

  const write = (lvl: string, args: unknown[]) => {
    if (levels.indexOf(lvl as (typeof levels)[number]) < threshold) return;
    let obj: Record<string, unknown> = {};
    let msg: string | undefined;
    if (typeof args[0] === 'object' && args[0] !== null) {
      obj = { ...(args[0] as Record<string, unknown>) };
      msg = typeof args[1] === 'string' ? args[1] : undefined;
    } else if (typeof args[0] === 'string') {
      msg = args[0];
    }
    if (obj.err instanceof Error) {
      obj.err = { message: obj.err.message, stack: obj.err.stack, name: obj.err.name };
    }
    // Fastify logs `req`/`res` objects; serialize them like pino's standard serializers do.
    if (obj.req && typeof obj.req === 'object') obj.req = serializeRequest(obj.req as Record<string, unknown>);
    if (obj.res && typeof obj.res === 'object') obj.res = serializeResponse(obj.res as Record<string, unknown>);
    process.stderr.write(`${safeStringify({ level: lvl, time: new Date().toISOString(), ...bindings, ...obj, msg })}\n`);
  };

  const logger = {
    level,
    trace: (...a: unknown[]) => write('trace', a),
    debug: (...a: unknown[]) => write('debug', a),
    info: (...a: unknown[]) => write('info', a),
    warn: (...a: unknown[]) => write('warn', a),
    error: (...a: unknown[]) => write('error', a),
    fatal: (...a: unknown[]) => write('fatal', a),
    silent: () => {},
    child: (b: Record<string, unknown>) => createStdLogger(level, { ...bindings, ...b }),
  };
  return logger as unknown as Logger;
}
