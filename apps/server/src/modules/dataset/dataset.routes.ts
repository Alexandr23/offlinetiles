import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import type { DatasetService } from './dataset.service.js';

const TileParams = z.object({
  z: z.coerce.number().int().min(0).max(30),
  x: z.coerce.number().int().min(0),
  y: z.coerce.number().int().min(0),
});

export function registerDatasetRoutes(app: FastifyInstance, dataset: DatasetService): void {
  app.get('/api/dataset', async () => {
    await dataset.refresh();
    return dataset.getInfo();
  });

  app.get('/api/tiles.json', async (request) => {
    await dataset.refresh();
    if (!dataset.isReady()) throw AppError.datasetNotReady();
    const proto = (request.headers['x-forwarded-proto'] as string | undefined) ?? request.protocol;
    const host = (request.headers['x-forwarded-host'] as string | undefined) ?? request.headers.host;
    return dataset.getTileJson(`${proto}://${host}`);
  });

  app.get('/api/tiles/:z/:x/:y.pbf', async (request, reply) => {
    if (!dataset.isReady()) throw AppError.datasetNotReady();
    const { z, x, y } = TileParams.parse(request.params);
    const tile = await dataset.getTile(z, x, y);
    if (!tile) {
      return reply.status(204).header('Cache-Control', 'public, max-age=3600').send();
    }
    reply.header('Content-Type', 'application/x-protobuf');
    reply.header('Cache-Control', 'public, max-age=3600');
    if (tile.encoding) reply.header('Content-Encoding', tile.encoding);
    return reply.send(Buffer.from(tile.data.buffer, tile.data.byteOffset, tile.data.byteLength));
  });
}
