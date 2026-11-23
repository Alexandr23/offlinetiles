import fs from 'node:fs';
import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { AppConfig } from '../../config/config.js';
import { AppError } from '../../shared/errors/app-error.js';

const FontParams = z.object({
  // "Noto Sans Regular" or comma-separated stacks "Noto Sans Regular,Noto Sans Bold"
  fontstack: z.string().min(1).max(200),
  range: z.string().regex(/^\d{1,5}-\d{1,5}$/),
});

function safeJoin(root: string, ...parts: string[]): string | null {
  const target = path.resolve(root, ...parts);
  const rel = path.relative(root, target);
  if (rel.startsWith('..') || path.isAbsolute(rel)) return null;
  return target;
}

/**
 * Serves local glyph PBFs so styles work offline:
 *   /api/assets/fonts/{fontstack}/{range}.pbf
 * Font stacks with several fonts fall back to the first one that exists locally.
 */
export function registerAssetRoutes(app: FastifyInstance, config: AppConfig): void {
  const fontsRoot = path.join(config.assetsDir, 'fonts');

  app.get('/api/assets/fonts/:fontstack/:range.pbf', async (request, reply) => {
    const { fontstack, range } = FontParams.parse(request.params);
    const candidates = decodeURIComponent(fontstack)
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    for (const font of candidates) {
      const file = safeJoin(fontsRoot, font, `${range}.pbf`);
      if (!file) throw AppError.validation('invalid font path');
      if (fs.existsSync(file)) {
        reply.header('Content-Type', 'application/x-protobuf');
        reply.header('Cache-Control', 'public, max-age=86400');
        return reply.send(fs.createReadStream(file));
      }
    }
    return reply.status(404).send({ error: { code: 'NOT_FOUND', message: `glyphs not found for ${candidates.join(',')}` } });
  });

  app.get('/api/assets/fonts', async () => {
    try {
      const entries = await fs.promises.readdir(fontsRoot, { withFileTypes: true });
      return { fonts: entries.filter((e) => e.isDirectory()).map((e) => e.name).sort() };
    } catch {
      return { fonts: [] };
    }
  });
}
