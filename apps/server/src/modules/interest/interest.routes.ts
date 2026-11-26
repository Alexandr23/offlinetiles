import { CreateInterestRequestSchema } from '@map-exporter/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { AppError } from '../../shared/errors/app-error.js';
import { requireAdmin } from '../auth/auth.plugin.js';
import type { InterestRepository } from './interest.repository.js';
import { RateLimiter } from './rate-limit.js';

const ListQuery = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});
const IdParams = z.object({ id: z.uuid() });

/** Per visitor: a handful of submissions an hour is plenty for a real person. */
const SUBMIT_LIMIT = { max: 5, windowMs: 60 * 60 * 1000 };

export function registerInterestRoutes(
  app: FastifyInstance,
  repo: InterestRepository,
  limiter = new RateLimiter(SUBMIT_LIMIT.max, SUBMIT_LIMIT.windowMs),
): void {
  // Public: anyone on the landing page can send the form.
  app.post('/api/interest', async (request, reply) => {
    const body = CreateInterestRequestSchema.parse(request.body ?? {});
    if (!limiter.take(request.ip)) {
      throw new AppError('RATE_LIMITED', 'Too many submissions. Please try again later.', 429);
    }
    const saved = await repo.create({
      email: body.email ?? null,
      intendedUse: body.intendedUse,
      features: body.features,
      willingness: body.willingness ?? null,
      feedback: body.feedback ?? null,
      marketingConsent: body.marketingConsent,
      source: body.source ?? null,
      utmSource: body.utmSource ?? null,
      utmCampaign: body.utmCampaign ?? null,
      generationId: body.generationId ?? null,
    });
    return reply.status(201).send({ id: saved.id });
  });

  app.get('/api/admin/interest', async (request) => {
    requireAdmin(request);
    const { limit, offset } = ListQuery.parse(request.query);
    return repo.list(limit, offset);
  });

  app.delete('/api/admin/interest/:id', async (request, reply) => {
    requireAdmin(request);
    const { id } = IdParams.parse(request.params);
    if (!(await repo.delete(id))) throw AppError.notFound('Submission', id);
    return reply.status(204).send();
  });
}
