import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { ArtifactManifest } from '@map-exporter/contracts';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { loadConfig } from '../../config/config.js';
import { AppError } from '../../shared/errors/app-error.js';
import { ARTIFACT_FILES, ArtifactService } from './artifacts.service.js';

const JOB_ID = '7f9c2d6e-4b1a-4c3d-9e8f-0a1b2c3d4e5f';

function manifest(): ArtifactManifest {
  return {
    version: 1,
    jobId: JOB_ID,
    name: 'Monaco',
    content: 'vector',
    container: 'mbtiles',
    raster: null,
    minZoom: 0,
    maxZoom: 14,
    tileCount: 10,
    bytes: 100,
    bounds: [7.4, 43.7, 7.5, 43.8],
    datasetVersion: null,
    styleName: 'Light',
    createdAt: new Date(0).toISOString(),
    completedAt: new Date(0).toISOString(),
    files: { tiles: ARTIFACT_FILES.tiles, style: ARTIFACT_FILES.style },
  };
}

describe('ArtifactService', () => {
  let dataDir: string;
  let service: ArtifactService;

  beforeEach(async () => {
    dataDir = await fsp.mkdtemp(path.join(os.tmpdir(), 'artifacts-test-'));
    service = new ArtifactService(loadConfig({ DATA_DIR: dataDir, NODE_ENV: 'test' }));
  });

  afterEach(async () => {
    await fsp.rm(dataDir, { recursive: true, force: true });
  });

  it('derives every path from the job UUID under the exports directory', () => {
    const dir = service.jobDir(JOB_ID);
    expect(dir).toBe(path.join(dataDir, 'exports', JOB_ID));
    expect(service.tilesPath(JOB_ID)).toBe(path.join(dir, 'map.mbtiles'));
  });

  it('rejects anything that is not a UUID so client input can never become a path', () => {
    for (const bad of ['../../etc/passwd', '..', '/tmp/x', 'abc', `${JOB_ID}/..`, '', JOB_ID.replace('-', '/')]) {
      expect(() => service.jobDir(bad)).toThrowError(AppError);
    }
  });

  it('writes manifest and style atomically and reports artifact presence', async () => {
    expect(await service.exists(JOB_ID)).toBe(false);
    expect(await service.readManifest(JOB_ID)).toBeNull();

    const dir = await service.prepareJobDir(JOB_ID);
    await fsp.writeFile(path.join(dir, ARTIFACT_FILES.tilesTemp), 'partial');
    await fsp.writeFile(service.tilesPath(JOB_ID), Buffer.alloc(1234));
    await service.writeBundle(JOB_ID, manifest(), { version: 8, sources: {}, layers: [] });

    expect(await service.tilesSize(JOB_ID)).toBe(1234);
    expect(await service.readManifest(JOB_ID)).toMatchObject({ jobId: JOB_ID, name: 'Monaco' });
    expect(JSON.parse(await fsp.readFile(path.join(dir, ARTIFACT_FILES.style), 'utf8'))).toEqual({
      version: 8,
      sources: {},
      layers: [],
    });
    const entries = (await fsp.readdir(dir)).sort();
    expect(entries).toEqual(['manifest.json', 'map.mbtiles', 'map.mbtiles.tmp', 'style.json']);

    await service.cleanupTemp(JOB_ID);
    expect((await fsp.readdir(dir)).sort()).toEqual(['manifest.json', 'map.mbtiles', 'style.json']);

    const download = await service.openDownload(JOB_ID);
    download.stream.destroy();
    expect(download).toMatchObject({ size: 1234, filename: 'map.mbtiles' });

    await service.remove(JOB_ID);
    expect(await service.exists(JOB_ID)).toBe(false);
    await expect(service.openDownload(JOB_ID)).rejects.toMatchObject({ code: 'ARTIFACT_MISSING', statusCode: 404 });
  });

  it('refuses download unless the generation is COMPLETED with an artifact', () => {
    expect(() => service.assertDownloadable({ status: 'COMPLETED', hasArtifact: true })).not.toThrow();
    for (const status of ['QUEUED', 'GENERATING', 'PACKAGING', 'FAILED', 'CANCELLED'] as const) {
      expect(() => service.assertDownloadable({ status, hasArtifact: true })).toThrowError(AppError);
    }
    expect(() => service.assertDownloadable({ status: 'COMPLETED', hasArtifact: false })).toThrowError(AppError);
  });

  it('prepareJobDir starts from a clean directory on retry', async () => {
    const dir = await service.prepareJobDir(JOB_ID);
    await fsp.writeFile(path.join(dir, 'leftover'), 'x');
    await service.prepareJobDir(JOB_ID);
    expect(await fsp.readdir(dir)).toEqual([]);
  });
});
