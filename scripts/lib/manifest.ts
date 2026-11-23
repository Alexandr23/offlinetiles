/**
 * dataset.json lifecycle: `building` → `ready` | `failed`.
 * The API only serves tiles when status is `ready`; the UI shows the other
 * states, so the manifest is updated atomically at every step.
 */
import fsp from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { DatasetManifestSchema, type DatasetManifest, type DatasetSource } from '../../packages/contracts/src/index.ts';

export async function readManifest(file: string): Promise<DatasetManifest | null> {
  try {
    const raw = await fsp.readFile(file, 'utf8');
    return DatasetManifestSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export async function writeManifest(file: string, manifest: DatasetManifest): Promise<void> {
  DatasetManifestSchema.parse(manifest);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, `${JSON.stringify(manifest, null, 2)}\n`);
  await fsp.rename(tmp, file);
}

/** Dataset version: time-based plus a short hash of the source, so re-inits are distinguishable. */
export function datasetVersion(source: DatasetSource, sourceBytes: number): string {
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const hash = createHash('sha1').update(JSON.stringify(source)).update(String(sourceBytes)).digest('hex').slice(0, 8);
  return `${stamp}-${hash}`;
}

export function buildingManifest(source: DatasetSource, tilesPath: string): DatasetManifest {
  return {
    status: 'building',
    version: 'building',
    source,
    tiles: { path: tilesPath, schema: 'openmaptiles' },
    createdAt: new Date().toISOString(),
  };
}
