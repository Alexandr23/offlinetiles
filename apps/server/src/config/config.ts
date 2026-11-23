import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

/** Walks upwards until it finds the pnpm workspace file. */
export function findRepoRoot(start: string): string {
  let dir = start;
  for (let i = 0; i < 10; i++) {
    if (fs.existsSync(path.join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  return start;
}

const here = path.dirname(fileURLToPath(import.meta.url));
export const REPO_ROOT = process.env.REPO_ROOT ?? findRepoRoot(here);

function loadDotEnv(): void {
  const envPath = path.join(REPO_ROOT, '.env');
  if (!fs.existsSync(envPath)) return;
  try {
    process.loadEnvFile(envPath);
  } catch {
    // ignore – explicit env always wins
  }
}
loadDotEnv();

const EnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().min(1).max(65535).default(3000),
  HOST: z.string().default('0.0.0.0'),
  DATABASE_URL: z.string().default('postgres://mapexporter:mapexporter@localhost:5432/mapexporter'),
  DATA_DIR: z.string().default('./data'),
  MASTER_PMTILES: z.string().optional(),
  EXPORTS_DIR: z.string().optional(),
  ASSETS_DIR: z.string().optional(),
  GENERATOR_BINARY: z.string().default('./rust/target/release/tile-generator'),
  GENERATOR_THREADS: z.coerce.number().int().min(0).default(0),
  RASTER_RENDERER_COMMAND: z.string().default('node ./apps/renderer/src/index.js'),
  MAX_EXPORT_TILES: z.coerce.number().int().min(1).default(5_000_000),
  MAX_ZOOM: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v.trim() === '' ? null : Number.parseInt(v, 10))),
  ESTIMATE_VECTOR_BYTES_PER_TILE: z.coerce.number().positive().default(12_000),
  ESTIMATE_VECTOR_MS_PER_TILE: z.coerce.number().positive().default(0.5),
  ESTIMATE_RASTER_BYTES_PER_TILE: z.coerce.number().positive().default(18_000),
  ESTIMATE_RASTER_MS_PER_TILE: z.coerce.number().positive().default(25),
  WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).default(1000),
  PROGRESS_THROTTLE_MS: z.coerce.number().int().min(100).default(750),
  PUBLIC_API_URL: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
  ADMIN_LOGIN: z.string().default('admin'),
  // Quote in .env if the value contains `#` (otherwise dotenv treats it as a comment).
  ADMIN_PASSWORD: z.string().min(8).default('K7#mP9xY2!qR4nW8@jL5'),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(365).default(30),
});

function resolveFromRoot(p: string): string {
  return path.isAbsolute(p) ? p : path.resolve(REPO_ROOT, p);
}

function parseCommand(command: string): string[] {
  return command
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => (part.startsWith('./') || part.startsWith('../') ? resolveFromRoot(part) : part));
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env) {
  const parsed = EnvSchema.safeParse(env);
  if (!parsed.success) {
    throw new Error(`Invalid environment configuration: ${parsed.error.message}`);
  }
  const e = parsed.data;
  const dataDir = resolveFromRoot(e.DATA_DIR);
  const generatorThreads =
    e.GENERATOR_THREADS > 0 ? e.GENERATOR_THREADS : Math.max(1, os.availableParallelism() - 1);

  return {
    nodeEnv: e.NODE_ENV,
    isTest: e.NODE_ENV === 'test',
    port: e.PORT,
    host: e.HOST,
    databaseUrl: e.DATABASE_URL,
    logLevel: e.LOG_LEVEL,
    dataDir,
    masterDir: path.join(dataDir, 'master'),
    masterPmtiles: e.MASTER_PMTILES ? resolveFromRoot(e.MASTER_PMTILES) : path.join(dataDir, 'master', 'master.pmtiles'),
    datasetManifest: path.join(dataDir, 'master', 'dataset.json'),
    exportsDir: e.EXPORTS_DIR ? resolveFromRoot(e.EXPORTS_DIR) : path.join(dataDir, 'exports'),
    assetsDir: e.ASSETS_DIR ? resolveFromRoot(e.ASSETS_DIR) : path.join(dataDir, 'assets'),
    generatorBinary: resolveFromRoot(e.GENERATOR_BINARY),
    generatorThreads,
    rasterRendererCommand: parseCommand(e.RASTER_RENDERER_COMMAND),
    maxExportTiles: e.MAX_EXPORT_TILES,
    maxZoomOverride: e.MAX_ZOOM,
    estimateFallback: {
      vectorBytesPerTile: e.ESTIMATE_VECTOR_BYTES_PER_TILE,
      vectorMsPerTile: e.ESTIMATE_VECTOR_MS_PER_TILE,
      rasterBytesPerTile: e.ESTIMATE_RASTER_BYTES_PER_TILE,
      rasterMsPerTile: e.ESTIMATE_RASTER_MS_PER_TILE,
    },
    workerPollIntervalMs: e.WORKER_POLL_INTERVAL_MS,
    progressThrottleMs: e.PROGRESS_THROTTLE_MS,
    publicApiUrl: e.PUBLIC_API_URL ?? `http://localhost:${e.PORT}`,
    adminLogin: e.ADMIN_LOGIN,
    adminPassword: e.ADMIN_PASSWORD,
    sessionTtlDays: e.SESSION_TTL_DAYS,
  };
}

export type AppConfig = ReturnType<typeof loadConfig>;

let cached: AppConfig | null = null;
export function getConfig(): AppConfig {
  if (!cached) cached = loadConfig();
  return cached;
}
