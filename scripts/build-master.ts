/**
 * pnpm build-master --osm-file <path> [--source-type region|planet|file] [--region <id>] [--memory 4g] [--planet]
 *
 * Runs Planetiler on an .osm.pbf, validates the result and atomically promotes
 * it to data/master/master.pmtiles, maintaining dataset.json throughout.
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { DatasetManifest, DatasetSource } from '../packages/contracts/src/index.ts';
import { CliError, flagBool, flagString, formatBytes, loadInitEnv, log, parseArgs, runMain, type InitEnv } from './lib/cli.ts';
import { buildingManifest, datasetVersion, readManifest, writeManifest } from './lib/manifest.ts';
import { runPlanetiler } from './lib/planetiler.ts';
import { validatePmtiles, type ArchiveSummary } from './lib/validate.ts';

export interface BuildMasterOptions {
  osmPath: string;
  source: DatasetSource;
  planet: boolean;
  memory?: string;
  /** Rebuild even when the current master was built from the same source file. */
  force: boolean;
}

export interface BuildMasterResult {
  manifest: DatasetManifest;
  summary: ArchiveSummary;
  rebuilt: boolean;
}

export async function buildMaster(env: InitEnv, opts: BuildMasterOptions): Promise<BuildMasterResult> {
  const osmPath = path.resolve(opts.osmPath);
  if (!fs.existsSync(osmPath)) throw new CliError(`OSM file not found: ${osmPath}`);
  const osmStat = await fsp.stat(osmPath);

  // Skip when an up-to-date master exists for this exact source (same file, built after it changed).
  const existing = await readManifest(env.datasetManifest);
  if (!opts.force && existing?.status === 'ready' && fs.existsSync(env.masterPmtiles)) {
    const masterStat = await fsp.stat(env.masterPmtiles);
    const sameSource = JSON.stringify(existing.source) === JSON.stringify(opts.source);
    if (sameSource && masterStat.mtimeMs >= osmStat.mtimeMs) {
      log.ok(`master.pmtiles is up to date for this source (version ${existing.version}); use --force to rebuild`);
      const summary = await validatePmtiles(env.masterPmtiles);
      return { manifest: existing, summary, rebuilt: false };
    }
  }

  const tilesPath = path.relative(env.dataDir, env.masterPmtiles).split(path.sep).join('/');
  await writeManifest(env.datasetManifest, buildingManifest(opts.source, tilesPath));
  await fsp.rm(env.masterTmp, { force: true });

  try {
    const run = await runPlanetiler(env, {
      osmPath,
      outputPath: env.masterTmp,
      planet: opts.planet,
      memory: opts.memory,
    });

    log.step('validating archive');
    const summary = await validatePmtiles(env.masterTmp);
    for (const warning of summary.warnings) log.warn(warning);
    log.ok(
      `archive ok: z${summary.minZoom}–${summary.maxZoom}, ${summary.layers.length} layers, ${formatBytes(summary.sizeBytes)}` +
        (summary.warnings.length ? ` (${summary.warnings.length} warning${summary.warnings.length === 1 ? '' : 's'})` : ''),
    );

    // Atomic promotion: readers either see the old master or the new one, never a partial file.
    await fsp.rename(env.masterTmp, env.masterPmtiles);

    const manifest: DatasetManifest = {
      status: 'ready',
      version: datasetVersion(opts.source, osmStat.size),
      source: opts.source,
      tiles: { path: tilesPath, schema: 'openmaptiles' },
      createdAt: new Date().toISOString(),
      planetiler: { runner: run.runner, image: run.image, jar: run.jar },
    };
    await writeManifest(env.datasetManifest, manifest);
    log.ok(`dataset ready: ${env.masterPmtiles} (version ${manifest.version})`);
    return { manifest, summary, rebuilt: true };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Keep Planetiler output for inspection / manual promotion. The next build
    // still clears master.tmp at start. Do not delete a successful (or near-complete) archive.
    if (fs.existsSync(env.masterTmp)) {
      const size = fs.statSync(env.masterTmp).size;
      log.warn(`keeping ${env.masterTmp} (${formatBytes(size)}) after failure — not promoted`);
    }
    // Keep a previous good master if there was one; otherwise record the failure.
    if (existing?.status === 'ready' && fs.existsSync(env.masterPmtiles)) {
      await writeManifest(env.datasetManifest, existing);
      log.warn(`build failed; the previous dataset (version ${existing.version}) remains active`);
    } else {
      await writeManifest(env.datasetManifest, {
        ...buildingManifest(opts.source, tilesPath),
        status: 'failed',
        version: 'failed',
        error: message,
      });
    }
    throw err;
  }
}

const USAGE = `usage:
  pnpm build-master --osm-file ./data/source/monaco-latest.osm.pbf [--region monaco]
options:
  --region <id>   record the region the file came from (default: source type "file")
  --planet        tune Planetiler for the full planet (mmap node storage)
  --memory <xg>   JVM heap for Planetiler (default PLANETILER_MEMORY)
  --force         rebuild even if master.pmtiles is up to date`;

if (import.meta.url === `file://${process.argv[1]}`) {
  runMain(async () => {
    const { flags } = parseArgs(process.argv.slice(2));
    const osmFile = flagString(flags, 'osm-file');
    if (!osmFile) throw new CliError(USAGE, 2);
    const planet = flagBool(flags, 'planet');
    const region = flagString(flags, 'region');
    const source: DatasetSource = planet
      ? { type: 'planet' }
      : region
        ? { type: 'region', region }
        : { type: 'file', path: path.resolve(osmFile) };
    const env = loadInitEnv();
    const result = await buildMaster(env, {
      osmPath: osmFile,
      source,
      planet,
      memory: flagString(flags, 'memory'),
      force: flagBool(flags, 'force'),
    });
    process.stdout.write(`${JSON.stringify({ version: result.manifest.version, ...result.summary })}\n`);
  });
}
