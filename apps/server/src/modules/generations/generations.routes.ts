import type { FastifyInstance } from 'fastify';
import {
  GenerationEstimateRequestSchema,
  GenerationListQuerySchema,
  GenerationRequestSchema,
} from '@map-exporter/contracts';
import { z } from 'zod';
import { ensureSession, requireAuth } from '../auth/auth.plugin.js';
import type { AuthService } from '../auth/auth.service.js';
import type { EstimateService } from '../estimates/estimates.service.js';
import type { GenerationService } from './generations.service.js';

const IdParams = z.object({ id: z.uuid() });

export function registerGenerationRoutes(
  app: FastifyInstance,
  generations: GenerationService,
  estimates: EstimateService,
  auth: AuthService,
): void {
  app.post('/api/generations/estimate', async (request) => {
    const body = GenerationEstimateRequestSchema.parse(request.body);
    return estimates.estimate(body);
  });

  app.post('/api/generations', async (request, reply) => {
    const ctx = await ensureSession(request, reply, auth);
    const body = GenerationRequestSchema.parse(request.body);
    const created = await generations.create(body, ctx.user);
    return reply.status(201).send(created);
  });

  app.get('/api/generations', async (request) => {
    const ctx = requireAuth(request);
    const query = GenerationListQuerySchema.parse(request.query ?? {});
    return generations.listForUser(ctx.user.id, query.historyLimit);
  });

  app.get('/api/generations/:id', async (request) => {
    const ctx = requireAuth(request);
    const { id } = IdParams.parse(request.params);
    return generations.get(id, ctx.user);
  });

  app.delete('/api/generations/:id', async (request, reply) => {
    const ctx = requireAuth(request);
    const { id } = IdParams.parse(request.params);
    await generations.delete(id, ctx.user);
    return reply.status(204).send();
  });

  app.post('/api/generations/:id/retry', async (request, reply) => {
    const ctx = requireAuth(request);
    const { id } = IdParams.parse(request.params);
    const created = await generations.retry(id, ctx.user);
    return reply.status(201).send(created);
  });

  app.post('/api/generations/:id/cancel', async (request) => {
    const ctx = requireAuth(request);
    const { id } = IdParams.parse(request.params);
    return generations.cancel(id, ctx.user);
  });
}
