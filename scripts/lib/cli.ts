/**
 * Small shared toolkit for the init scripts: argument parsing, logging and
 * environment resolution. Scripts talk to humans on stderr; stdout is reserved
 * for machine-readable results (paths, JSON) so they compose in shells.
 */
import fs from 'node:fs';
import path from 'node:path';
import { getConfig, REPO_ROOT } from '../../apps/server/src/config/config.ts';

export type Flags = Record<string, string | boolean>;

/** Parses `--key value`, `--key=value` and bare `--flag` arguments. */
export function parseArgs(argv: string[]): { flags: Flags; positional: string[] } {
  const flags: Flags = {};
  const positional: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]!;
    if (!arg.startsWith('--')) {
      positional.push(arg);
      continue;
    }
    const eq = arg.indexOf('=');
    if (eq !== -1) {
      flags[arg.slice(2, eq)] = arg.slice(eq + 1);
      continue;
    }
    const key = arg.slice(2);
    const next = argv[i + 1];
    if (next !== undefined && !next.startsWith('--')) {
      flags[key] = next;
      i++;
    } else {
      flags[key] = true;
    }
  }
  return { flags, positional };
}

export function flagString(flags: Flags, key: string): string | undefined {
  const v = flags[key];
  return typeof v === 'string' && v.length > 0 ? v : undefined;
}

export function flagBool(flags: Flags, key: string): boolean {
  const v = flags[key];
  return v === true || v === 'true' || v === '1';
}

const start = Date.now();
function stamp(): string {
  const s = ((Date.now() - start) / 1000).toFixed(1).padStart(6);
  return `[${s}s]`;
}

export const log = {
  info: (msg: string) => process.stderr.write(`${stamp()} ${msg}\n`),
  step: (msg: string) => process.stderr.write(`${stamp()} \x1b[36m▶\x1b[0m ${msg}\n`),
  ok: (msg: string) => process.stderr.write(`${stamp()} \x1b[32m✔\x1b[0m ${msg}\n`),
  warn: (msg: string) => process.stderr.write(`${stamp()} \x1b[33m⚠\x1b[0m ${msg}\n`),
  error: (msg: string) => process.stderr.write(`${stamp()} \x1b[31m✖\x1b[0m ${msg}\n`),
  /** Rewrites the current line (progress). */
  progress: (msg: string) => {
    if (process.stderr.isTTY) process.stderr.write(`\r\x1b[2K${stamp()} ${msg}`);
  },
  progressEnd: () => {
    if (process.stderr.isTTY) process.stderr.write('\n');
  },
};

export class CliError extends Error {
  constructor(
    message: string,
    public readonly exitCode = 1,
  ) {
    super(message);
  }
}

/** Runs a script main function with uniform error handling. */
export function runMain(main: () => Promise<void>): void {
  main().then(
    () => process.exit(0),
    (err: unknown) => {
      if (err instanceof CliError) {
        log.error(err.message);
        process.exit(err.exitCode);
      }
      log.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
      process.exit(1);
    },
  );
}

export interface InitEnv {
  repoRoot: string;
  dataDir: string;
  sourceDir: string;
  masterDir: string;
  masterPmtiles: string;
  masterTmp: string;
  datasetManifest: string;
  assetsDir: string;
  fontsDir: string;
  /** Planetiler scratch (downloaded water polygons, natural earth, tmp node map). */
  planetilerDir: string;
  planetilerImage: string;
  planetilerJar: string | null;
  planetilerMemory: string;
  /** Optional JDK home for the jar runner (wins over shell JAVA_HOME). */
  planetilerJavaHome: string | null;
}

/** Resolves all paths from `.env` (through the server's config loader) + PLANETILER_* variables. */
export function loadInitEnv(): InitEnv {
  const config = getConfig();
  const dataDir = config.dataDir;
  const masterDir = path.dirname(config.masterPmtiles);
  const env: InitEnv = {
    repoRoot: REPO_ROOT,
    dataDir,
    sourceDir: path.join(dataDir, 'source'),
    masterDir,
    masterPmtiles: config.masterPmtiles,
    // Planetiler infers the output format from the extension, so the temp file must still end in .pmtiles.
    masterTmp: path.join(masterDir, 'master.tmp.pmtiles'),
    datasetManifest: config.datasetManifest,
    assetsDir: config.assetsDir,
    fontsDir: path.join(config.assetsDir, 'fonts'),
    planetilerDir: path.join(dataDir, 'planetiler'),
    planetilerImage: process.env.PLANETILER_IMAGE?.trim() || 'ghcr.io/onthegomap/planetiler:latest',
    planetilerJar: (() => {
      const raw = process.env.PLANETILER_JAR?.trim();
      if (!raw) return null;
      return path.isAbsolute(raw) ? raw : path.resolve(REPO_ROOT, raw);
    })(),
    planetilerMemory: process.env.PLANETILER_MEMORY?.trim() || '2g',
    // Prefer PLANETILER_JAVA_HOME: Node's loadEnvFile does not override an existing shell JAVA_HOME.
    planetilerJavaHome: (() => {
      const raw = process.env.PLANETILER_JAVA_HOME?.trim() || null;
      if (!raw) return null;
      return path.isAbsolute(raw) ? raw : path.resolve(REPO_ROOT, raw);
    })(),
  };
  for (const dir of [env.sourceDir, env.masterDir, env.fontsDir, env.planetilerDir]) {
    fs.mkdirSync(dir, { recursive: true });
  }
  return env;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  const units = ['KB', 'MB', 'GB', 'TB'];
  let v = n / 1024;
  let i = 0;
  while (v >= 1024 && i < units.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v >= 100 ? 0 : 1)} ${units[i]}`;
}

export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}m`;
}
