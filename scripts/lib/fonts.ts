/**
 * Glyph assets. Styles reference `/api/assets/fonts/{fontstack}/{range}.pbf`
 * and both the browser preview and the raster renderer read the same local
 * files, so no runtime network access is ever needed.
 *
 * Source: https://github.com/protomaps/basemaps-assets (OFL-licensed Noto Sans).
 */
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { formatDuration, log } from './cli.ts';

const FONTS_BASE = 'https://raw.githubusercontent.com/protomaps/basemaps-assets/main/fonts';
export const REQUIRED_FONTS = ['Noto Sans Regular', 'Noto Sans Medium', 'Noto Sans Italic'] as const;
const CONCURRENCY = 24;

/** All 256 glyph ranges: 0-255 … 65280-65535. */
export function glyphRanges(): string[] {
  const ranges: string[] = [];
  for (let start = 0; start < 65536; start += 256) ranges.push(`${start}-${start + 255}`);
  return ranges;
}

export async function ensureFonts(fontsDir: string, force = false): Promise<{ downloaded: number; present: number }> {
  const jobs: Array<{ font: string; range: string; file: string }> = [];
  let present = 0;
  for (const font of REQUIRED_FONTS) {
    const dir = path.join(fontsDir, font);
    await fsp.mkdir(dir, { recursive: true });
    for (const range of glyphRanges()) {
      const file = path.join(dir, `${range}.pbf`);
      if (!force && fs.existsSync(file)) {
        present++;
        continue;
      }
      jobs.push({ font, range, file });
    }
  }
  if (jobs.length === 0) {
    log.ok(`fonts: ${REQUIRED_FONTS.length} families already present (${present} glyph ranges)`);
    return { downloaded: 0, present };
  }

  log.step(`fonts: downloading ${jobs.length} glyph ranges for ${REQUIRED_FONTS.join(', ')}`);
  const started = Date.now();
  let done = 0;
  let failures: string[] = [];
  let next = 0;
  const worker = async () => {
    while (next < jobs.length) {
      const job = jobs[next++]!;
      const url = `${FONTS_BASE}/${encodeURIComponent(job.font)}/${job.range}.pbf`;
      try {
        await fetchToFile(url, job.file);
      } catch (err) {
        failures.push(`${job.font}/${job.range}: ${(err as Error).message}`);
      }
      done++;
      if (done % 16 === 0 || done === jobs.length) log.progress(`fonts: ${done}/${jobs.length}`);
    }
  };
  await Promise.all(Array.from({ length: CONCURRENCY }, worker));
  log.progressEnd();

  // Retry failures once sequentially (transient network errors are common on 700+ small requests).
  if (failures.length > 0) {
    const retry = failures;
    failures = [];
    for (const entry of retry) {
      const [fontRange] = entry.split(': ');
      const [font, range] = fontRange!.split('/');
      const file = path.join(fontsDir, font!, `${range}.pbf`);
      try {
        await fetchToFile(`${FONTS_BASE}/${encodeURIComponent(font!)}/${range}.pbf`, file);
      } catch (err) {
        failures.push(`${font}/${range}: ${(err as Error).message}`);
      }
    }
  }
  if (failures.length > 0) {
    throw new Error(`fonts: ${failures.length} glyph ranges failed to download, e.g. ${failures[0]}`);
  }
  log.ok(`fonts: ${jobs.length} glyph ranges in ${formatDuration(Date.now() - started)}`);
  return { downloaded: jobs.length, present };
}

async function fetchToFile(url: string, file: string): Promise<void> {
  const res = await fetch(url, { headers: { 'user-agent': 'map-exporter-init/0.1' } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await fsp.writeFile(`${file}.tmp`, buf);
  await fsp.rename(`${file}.tmp`, file);
}
