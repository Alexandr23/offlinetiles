import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactManifest, GenerationStatus, MapLibreStyle } from '@map-exporter/contracts';
import type { AppConfig } from '../../config/config.js';
import { AppError } from '../../shared/errors/app-error.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ARTIFACT_FILES = {
  tiles: 'map.mbtiles',
  tilesTemp: 'map.mbtiles.tmp',
  style: 'style.json',
  manifest: 'manifest.json',
} as const;

/**
 * All artifact paths are derived server-side from the job UUID. Client input never
 * reaches the filesystem layer as a path.
 */
export class ArtifactService {
  constructor(private readonly config: AppConfig) {}

  jobDir(jobId: string): string {
    if (!UUID_RE.test(jobId)) throw AppError.validation('invalid job id');
    const dir = path.resolve(this.config.exportsDir, jobId);
    const rel = path.relative(this.config.exportsDir, dir);
    if (rel.startsWith('..') || path.isAbsolute(rel)) throw AppError.validation('invalid job id');
    return dir;
  }

  tilesPath(jobId: string): string {
    return path.join(this.jobDir(jobId), ARTIFACT_FILES.tiles);
  }

  async prepareJobDir(jobId: string): Promise<string> {
    const dir = this.jobDir(jobId);
    await fsp.rm(dir, { recursive: true, force: true });
    await fsp.mkdir(dir, { recursive: true });
    return dir;
  }

  async writeBundle(jobId: string, manifest: ArtifactManifest, style: MapLibreStyle | null): Promise<void> {
    const dir = this.jobDir(jobId);
    await writeAtomic(path.join(dir, ARTIFACT_FILES.manifest), JSON.stringify(manifest, null, 2));
    if (style) {
      await writeAtomic(path.join(dir, ARTIFACT_FILES.style), JSON.stringify(style, null, 2));
    }
  }

  async tilesSize(jobId: string): Promise<number | null> {
    try {
      const stat = await fsp.stat(this.tilesPath(jobId));
      return stat.size;
    } catch {
      return null;
    }
  }

  async exists(jobId: string): Promise<boolean> {
    return (await this.tilesSize(jobId)) !== null;
  }

  /**
   * Incomplete / failed / cancelled jobs must never be served as downloads,
   * even if a leftover file happens to exist on disk.
   */
  assertDownloadable(generation: { status: GenerationStatus; hasArtifact: boolean }): void {
    if (generation.status !== 'COMPLETED' || !generation.hasArtifact) {
      throw new AppError('ARTIFACT_MISSING', 'Artifact is only available after the generation completes', 404);
    }
  }

  async openDownload(jobId: string): Promise<{ stream: fs.ReadStream; size: number; filename: string }> {
    const file = this.tilesPath(jobId);
    let stat: fs.Stats;
    try {
      stat = await fsp.stat(file);
    } catch {
      throw new AppError('ARTIFACT_MISSING', 'Artifact file is missing on disk', 404);
    }
    return { stream: fs.createReadStream(file), size: stat.size, filename: ARTIFACT_FILES.tiles };
  }

  async readManifest(jobId: string): Promise<ArtifactManifest | null> {
    try {
      const raw = await fsp.readFile(path.join(this.jobDir(jobId), ARTIFACT_FILES.manifest), 'utf8');
      return JSON.parse(raw) as ArtifactManifest;
    } catch {
      return null;
    }
  }

  async remove(jobId: string): Promise<void> {
    await fsp.rm(this.jobDir(jobId), { recursive: true, force: true });
  }

  /** Removes stale `.tmp` outputs left behind by interrupted jobs. */
  async cleanupTemp(jobId: string): Promise<void> {
    await fsp.rm(path.join(this.jobDir(jobId), ARTIFACT_FILES.tilesTemp), { force: true });
  }
}

async function writeAtomic(file: string, contents: string): Promise<void> {
  const tmp = `${file}.tmp`;
  await fsp.writeFile(tmp, contents);
  await fsp.rename(tmp, file);
}
