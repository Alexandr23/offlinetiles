/**
 * pnpm init-map --region <id> | --planet | --osm-file <path>  [--force] [--skip-fonts] [--memory 4g]
 *
 * One command from nothing to a servable dataset:
 *   1. download the OSM extract (or reuse a local file)
 *   2. download glyph fonts for labels (browser preview + raster renderer)
 *   3. run Planetiler → data/master/master.tmp.pmtiles
 *   4. validate, atomically promote to master.pmtiles, write dataset.json
 */
import path from 'node:path';
import type { DatasetSource } from '../packages/contracts/src/index.ts';
import { buildMaster } from './build-master.ts';
import { downloadOsm } from './download-osm.ts';
import { CliError, flagBool, flagString, formatBytes, formatDuration, loadInitEnv, log, parseArgs, runMain } from './lib/cli.ts';
import { ensureFonts } from './lib/fonts.ts';

const USAGE = `usage:
  pnpm init-map --region monaco              # any Geofabrik region id/path or a direct .osm.pbf URL
  pnpm init-map --planet                     # full planet (needs ~100 GB disk, 40+ GB RAM, many hours)
  pnpm init-map --osm-file ./data/source/custom.osm.pbf
options:
  --force        re-download the extract and rebuild master.pmtiles
  --skip-fonts   do not download glyph fonts
  --memory <xg>  Planetiler JVM heap (default PLANETILER_MEMORY, e.g. 2g; planet needs 40g+)`;

runMain(async () => {
  const { flags } = parseArgs(process.argv.slice(2));
  const planet = flagBool(flags, 'planet');
  const region = flagString(flags, 'region');
  const osmFile = flagString(flags, 'osm-file');
  const force = flagBool(flags, 'force');
  const memory = flagString(flags, 'memory');
  const picked = [planet, !!region, !!osmFile].filter(Boolean).length;
  if (picked !== 1) throw new CliError(USAGE, 2);
  if (flags.help) throw new CliError(USAGE, 0);

  const env = loadInitEnv();
  const started = Date.now();
  log.info(`data directory: ${path.resolve(env.dataDir)}`);

  // 1. OSM source
  let osmPath: string;
  let source: DatasetSource;
  if (osmFile) {
    osmPath = path.resolve(osmFile);
    source = { type: 'file', path: osmPath };
    log.step(`using local extract ${osmPath}`);
  } else {
    const dl = await downloadOsm(planet ? 'planet' : region!, force);
    osmPath = dl.path;
    source = planet ? { type: 'planet' } : { type: 'region', region: dl.region.id };
  }

  // 2. Fonts (cheap, and the preview looks broken without labels)
  if (!flagBool(flags, 'skip-fonts')) {
    await ensureFonts(env.fontsDir, false);
  } else {
    log.warn('skipping fonts: map labels will not render until fonts exist in ' + env.fontsDir);
  }

  // 3 + 4. Planetiler, validation, promotion, manifest
  const result = await buildMaster(env, { osmPath, source, planet, memory, force });

  log.ok(
    `done in ${formatDuration(Date.now() - started)} — ${result.rebuilt ? 'built' : 'reused'} master.pmtiles ` +
      `(z${result.summary.minZoom}–${result.summary.maxZoom}, ${formatBytes(result.summary.sizeBytes)}, version ${result.manifest.version})`,
  );
  log.info('next: pnpm dev  →  http://localhost:5173');
  process.stdout.write(`${JSON.stringify({ version: result.manifest.version, master: env.masterPmtiles, ...result.summary })}\n`);
});
