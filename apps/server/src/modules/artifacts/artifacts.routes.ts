import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { requireAuth } from '../auth/auth.plugin.js';
import type { AuthService } from '../auth/auth.service.js';
import { extractBearerToken } from '../auth/auth.service.js';
import type { GenerationService } from '../generations/generations.service.js';
import type { ArtifactService } from './artifacts.service.js';

const IdParams = z.object({ id: z.uuid() });
const DownloadQuery = z.object({
  access_token: z.string().min(1).optional(),
});

function safeFilename(name: string): string {
  return (
    name
      .normalize('NFKD')
      .replace(/[^\w.-]+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
      .slice(0, 64) || 'map'
  );
}

export function registerArtifactRoutes(
  app: FastifyInstance,
  artifacts: ArtifactService,
  generations: GenerationService,
  auth: AuthService,
): void {
  app.get('/api/generations/:id/download', async (request, reply) => {
    const { id } = IdParams.parse(request.params);
    const query = DownloadQuery.parse(request.query ?? {});
    const bearer = extractBearerToken(request.headers.authorization);
    const token = bearer ?? query.access_token ?? null;
    const ctx = (await auth.resolveToken(token)) ?? request.auth;
    if (!ctx) throw AppError.unauthorized();
    const generation = await generations.get(id, ctx.user);
    artifacts.assertDownloadable(generation);
    const manifest = await artifacts.readManifest(id);
    const { stream, size } = await artifacts.openDownload(id);
    const base = safeFilename(manifest?.name ?? id);
    const suffix = manifest?.content === 'raster' ? 'raster' : 'vector';
    reply.header('Content-Type', 'application/vnd.mapbox-vector-tile+sqlite3');
    reply.header('Content-Length', size);
    reply.header('Content-Disposition', `attachment; filename="${base}-${suffix}.mbtiles"`);
    return reply.send(stream);
  });

  app.get('/api/generations/:id/manifest', async (request) => {
    const ctx = requireAuth(request);
    const { id } = IdParams.parse(request.params);
    await generations.get(id, ctx.user);
    const manifest = await artifacts.readManifest(id);
    if (!manifest) throw new AppError('ARTIFACT_MISSING', 'manifest not found', 404);
    return manifest;
  });
}
