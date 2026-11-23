/**
 * pnpm download-osm --region <id|path|url> | --planet [--force]
 *
 * Downloads an OpenStreetMap extract into data/source and prints its path on
 * stdout. Idempotent: existing files are reused unless --force is given.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { CliError, flagBool, flagString, loadInitEnv, log, parseArgs, runMain } from './lib/cli.ts';
import { downloadFile } from './lib/download.ts';
import { resolveRegion, type ResolvedRegion } from './lib/geofabrik.ts';

export interface OsmDownload {
  region: ResolvedRegion;
  path: string;
  bytes: number;
}

export async function downloadOsm(regionInput: string, force: boolean): Promise<OsmDownload> {
  const env = loadInitEnv();
  const region = await resolveRegion(regionInput, env.sourceDir);
  const dest = path.join(env.sourceDir, region.fileName);
  log.step(`OSM extract: ${region.name} (${region.id})`);
  log.info(`  ${region.url}`);
  if (region.id === 'planet') {
    log.warn('the full planet is ~80 GB; make sure you have disk space and bandwidth (download resumes if interrupted)');
  }
  if (force) await fsp.rm(dest, { force: true });
  const result = await downloadFile(region.url, dest, { resume: true, skipExisting: !force, label: region.fileName });
  return { region, path: dest, bytes: result.bytes };
}

const USAGE = `usage:
  pnpm download-osm --region monaco
  pnpm download-osm --region europe/france/alsace
  pnpm download-osm --region https://download.geofabrik.de/europe/andorra-latest.osm.pbf
  pnpm download-osm --planet
options:
  --force   re-download even if the file exists`;

if (import.meta.url === `file://${process.argv[1]}`) {
  runMain(async () => {
    const { flags } = parseArgs(process.argv.slice(2));
    const region = flagBool(flags, 'planet') ? 'planet' : flagString(flags, 'region');
    if (!region) throw new CliError(USAGE, 2);
    const result = await downloadOsm(region, flagBool(flags, 'force'));
    process.stdout.write(`${result.path}\n`);
  });
}
