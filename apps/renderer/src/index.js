/**
 * MapLibre Native raster renderer sidecar.
 *
 * Protocol (one JSON object per line on stdin):
 *   {"type":"init","style":{...},"source":{"path":"/data/master/master.pmtiles"},"fontsDir":"/data/assets/fonts","tileSize":256}
 *   {"type":"render","id":123,"z":12,"x":2100,"y":1400}
 *   {"type":"shutdown"}
 *
 * Replies on stdout: a JSON line, followed by raw RGBA bytes for `tile` replies.
 *   {"type":"ready","minZoom":0,"maxZoom":14}
 *   {"type":"tile","id":123,"width":256,"height":256,"bytes":262144}<262144 raw bytes>
 *   {"type":"error","id":123,"message":"..."}
 *   {"type":"fatal","message":"..."}
 *
 * Human-readable logs go to stderr only.
 */
import { createRequire } from 'node:module';
import fsp from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline';
import { PMTiles } from 'pmtiles';
import { cameraForTile } from './tile-math.js';
import { rewriteStyleForRenderer } from './style-rewrite.js';

const require = createRequire(import.meta.url);
/** @type {any} */
const mbgl = require('@maplibre/maplibre-gl-native');

const log = (/** @type {string} */ msg) => process.stderr.write(`[renderer ${process.pid}] ${msg}\n`);

/** Writes a protocol line (and optional binary payload) atomically to stdout. */
function send(/** @type {Record<string, unknown>} */ header, /** @type {Buffer | null} */ payload = null) {
  const line = Buffer.from(`${JSON.stringify(header)}\n`, 'utf8');
  const out = payload ? Buffer.concat([line, payload]) : line;
  return new Promise((resolve) => {
    if (!process.stdout.write(out)) process.stdout.once('drain', () => resolve(undefined));
    else resolve(undefined);
  });
}

class FileSource {
  /** @param {string} filePath */
  constructor(filePath) {
    this.filePath = filePath;
    /** @type {import('node:fs/promises').FileHandle | null} */
    this.handle = null;
  }
  getKey() {
    return this.filePath;
  }
  async open() {
    if (!this.handle) this.handle = await fsp.open(this.filePath, 'r');
    return this.handle;
  }
  /** @param {number} offset @param {number} length */
  async getBytes(offset, length) {
    const handle = await this.open();
    const buffer = Buffer.allocUnsafe(length);
    const { bytesRead } = await handle.read(buffer, 0, length, offset);
    const view = buffer.subarray(0, bytesRead);
    return { data: view.buffer.slice(view.byteOffset, view.byteOffset + view.byteLength) };
  }
}

/** @type {{ map: any, tileSize: number, pmtiles: PMTiles, fontsDir: string, header: any } | null} */
let state = null;
let shuttingDown = false;

/** Resolves the glyph file for a comma-separated fontstack, returning an empty PBF when missing. */
async function readGlyphs(fontsDir, fontstack, range) {
  const stacks = decodeURIComponent(fontstack).split(',').map((s) => s.trim()).filter(Boolean);
  for (const font of stacks) {
    const file = path.join(fontsDir, font, `${range}.pbf`);
    const rel = path.relative(fontsDir, file);
    if (rel.startsWith('..')) continue;
    try {
      return await fsp.readFile(file);
    } catch {
      // try next font in the stack
    }
  }
  return Buffer.alloc(0);
}

async function handleRequest(req) {
  const url = String(req.url);
  if (url.startsWith('pmtiles://')) {
    const [z, x, y] = url.slice('pmtiles://'.length).split('/').map(Number);
    const tile = await state.pmtiles.getZxy(z, x, y);
    return tile ? Buffer.from(tile.data) : Buffer.alloc(0);
  }
  if (url.startsWith('fonts://')) {
    const m = url.match(/^fonts:\/\/(.+)\/(\d+-\d+)\.pbf$/);
    if (!m) return Buffer.alloc(0);
    return readGlyphs(state.fontsDir, m[1], m[2]);
  }
  throw new Error(`unsupported resource ${url}`);
}

async function init(msg) {
  const source = new FileSource(msg.source.path);
  const pmtiles = new PMTiles(source);
  const header = await pmtiles.getHeader();
  const tileSize = msg.tileSize === 512 ? 512 : 256;

  const map = new mbgl.Map({
    mode: 'tile',
    ratio: 1,
    request: (req, callback) => {
      handleRequest(req).then(
        (data) => callback(null, { data }),
        (err) => {
          log(`resource error ${req.url}: ${err.message}`);
          callback(null, { data: Buffer.alloc(0) });
        },
      );
    },
  });

  const style = rewriteStyleForRenderer(msg.style, {
    minZoom: header.minZoom,
    maxZoom: header.maxZoom,
    bounds: [header.minLon, header.minLat, header.maxLon, header.maxLat],
  });
  map.load(style);

  state = { map, tileSize, pmtiles, fontsDir: msg.fontsDir, header };
  await send({ type: 'ready', minZoom: header.minZoom, maxZoom: header.maxZoom });
}

function renderOnce(camera) {
  return new Promise((resolve, reject) => {
    state.map.render(
      { zoom: camera.zoom, center: camera.center, width: camera.width, height: camera.height, bearing: 0, pitch: 0 },
      (err, buffer) => (err ? reject(err) : resolve(buffer)),
    );
  });
}

async function render(msg) {
  if (!state) throw new Error('renderer not initialized');
  const camera = cameraForTile(msg.z, msg.x, msg.y, state.tileSize);
  const buffer = await renderOnce(camera);
  await send({ type: 'tile', id: msg.id, width: camera.width, height: camera.height, downscaleTo: camera.downscaleTo, bytes: buffer.length }, buffer);
}

async function main() {
  const rl = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  // Process strictly sequentially: one map instance renders one tile at a time.
  let chain = Promise.resolve();
  rl.on('line', (line) => {
    if (!line.trim()) return;
    chain = chain.then(async () => {
      let msg;
      try {
        msg = JSON.parse(line);
      } catch {
        log(`bad input line: ${line.slice(0, 200)}`);
        return;
      }
      try {
        if (msg.type === 'init') await init(msg);
        else if (msg.type === 'render') await render(msg);
        else if (msg.type === 'shutdown') {
          shuttingDown = true;
          rl.close();
        }
      } catch (err) {
        if (msg.type === 'init') {
          await send({ type: 'fatal', message: err.message });
          process.exit(2);
        }
        await send({ type: 'error', id: msg.id, message: err.message });
      }
    });
  });
  rl.on('close', () => {
    chain.then(() => {
      try {
        state?.map?.release?.();
      } catch {
        // ignore
      }
      process.exit(shuttingDown ? 0 : 0);
    });
  });
}

process.on('SIGTERM', () => process.exit(0));
main().catch((err) => {
  log(`fatal: ${err.stack ?? err}`);
  process.exit(1);
});
