/**
 * Streaming HTTP download with progress, resume and atomic completion.
 * Files are written to `<dest>.part` and renamed only when complete, so a
 * killed download never masquerades as a finished one.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CliError, formatBytes, formatDuration, log } from './cli.ts';

export interface DownloadOptions {
  /** Resume a partial `.part` file with a Range request when the server allows it. */
  resume?: boolean;
  /** Progress label. */
  label?: string;
  /** Skip when `dest` already exists. */
  skipExisting?: boolean;
}

export interface DownloadResult {
  path: string;
  bytes: number;
  skipped: boolean;
}

export async function downloadFile(url: string, dest: string, opts: DownloadOptions = {}): Promise<DownloadResult> {
  const label = opts.label ?? path.basename(dest);
  if (opts.skipExisting && fs.existsSync(dest)) {
    const size = (await fsp.stat(dest)).size;
    log.ok(`${label}: already present (${formatBytes(size)})`);
    return { path: dest, bytes: size, skipped: true };
  }
  await fsp.mkdir(path.dirname(dest), { recursive: true });
  const part = `${dest}.part`;

  let offset = 0;
  if (opts.resume && fs.existsSync(part)) {
    offset = (await fsp.stat(part)).size;
  }

  const headers: Record<string, string> = { 'user-agent': 'map-exporter-init/0.1' };
  if (offset > 0) headers.range = `bytes=${offset}-`;

  const started = Date.now();
  const response = await fetch(url, { headers, redirect: 'follow' });
  if (response.status === 416) {
    // Range not satisfiable → the part file is already complete.
    await fsp.rename(part, dest);
    const size = (await fsp.stat(dest)).size;
    return { path: dest, bytes: size, skipped: false };
  }
  if (!response.ok || !response.body) {
    throw new CliError(`download failed: ${url} → HTTP ${response.status} ${response.statusText}`);
  }
  const resumed = response.status === 206 && offset > 0;
  if (!resumed) offset = 0;
  const total = Number(response.headers.get('content-length') ?? 0) + offset;

  let received = offset;
  let lastReport = 0;
  const report = (final = false) => {
    const now = Date.now();
    if (!final && now - lastReport < 250) return;
    lastReport = now;
    const elapsed = (now - started) / 1000;
    const rate = elapsed > 0 ? (received - offset) / elapsed : 0;
    const pct = total > 0 ? ` ${((received / total) * 100).toFixed(1)}%` : '';
    const eta = total > 0 && rate > 0 ? ` eta ${formatDuration(((total - received) / rate) * 1000)}` : '';
    log.progress(`${label}: ${formatBytes(received)}${total ? ` / ${formatBytes(total)}` : ''}${pct} @ ${formatBytes(rate)}/s${eta}`);
  };

  const counter = new TransformStreamCounter((n) => {
    received += n;
    report();
  });
  const file = fs.createWriteStream(part, { flags: resumed ? 'a' : 'w' });
  await pipeline(Readable.fromWeb(response.body as import('stream/web').ReadableStream), counter, file);
  report(true);
  log.progressEnd();

  if (total > 0 && received !== total) {
    throw new CliError(`download incomplete: ${label} got ${received} of ${total} bytes (re-run to resume)`);
  }
  await fsp.rename(part, dest);
  log.ok(`${label}: ${formatBytes(received)} in ${formatDuration(Date.now() - started)}`);
  return { path: dest, bytes: received, skipped: false };
}

class TransformStreamCounter extends Transform {
  constructor(private readonly onChunk: (n: number) => void) {
    super();
  }
  override _transform(chunk: Buffer, _enc: BufferEncoding, cb: (err?: Error | null, data?: Buffer) => void): void {
    this.onChunk(chunk.length);
    cb(null, chunk);
  }
}

/** Fetches JSON with a small on-disk cache (used for the Geofabrik index). */
export async function fetchJsonCached<T>(url: string, cacheFile: string, maxAgeMs: number): Promise<T> {
  try {
    const stat = await fsp.stat(cacheFile);
    if (Date.now() - stat.mtimeMs < maxAgeMs) {
      return JSON.parse(await fsp.readFile(cacheFile, 'utf8')) as T;
    }
  } catch {
    // no cache
  }
  const response = await fetch(url, { headers: { 'user-agent': 'map-exporter-init/0.1' } });
  if (!response.ok) throw new CliError(`failed to fetch ${url}: HTTP ${response.status}`);
  const text = await response.text();
  await fsp.mkdir(path.dirname(cacheFile), { recursive: true });
  await fsp.writeFile(`${cacheFile}.tmp`, text);
  await fsp.rename(`${cacheFile}.tmp`, cacheFile);
  return JSON.parse(text) as T;
}
