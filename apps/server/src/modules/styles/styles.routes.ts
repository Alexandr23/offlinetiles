import type { FastifyInstance } from 'fastify';
import {
  CreateStyleRequestSchema,
  DuplicateStyleRequestSchema,
  UpdateStyleRequestSchema,
} from '@map-exporter/contracts';
import { z } from 'zod';
import { ensureSession, requireAuth } from '../auth/auth.plugin.js';
import type { AuthService } from '../auth/auth.service.js';
import { validateMapLibreStyle } from './style-validation.js';
import type { StyleService } from './styles.service.js';

const IdParams = z.object({ id: z.uuid() });

export function registerStyleRoutes(app: FastifyInstance, styles: StyleService, auth: AuthService): void {
  app.get('/api/styles', async (request, reply) => {
    const ctx = await ensureSession(request, reply, auth);
    return { styles: await styles.listForUser(ctx.user.id) };
  });

  app.post('/api/styles', async (request, reply) => {
    const ctx = await ensureSession(request, reply, auth);
    const body = CreateStyleRequestSchema.parse(request.body);
    const created = await styles.create(body, ctx.user);
    return reply.status(201).send(created);
  });

  app.post('/api/styles/validate', async (request) => {
    const issues = validateMapLibreStyle(request.body);
    return { valid: issues.length === 0, issues };
  });

  app.get('/api/styles/:id', async (request) => {
    const ctx = requireAuth(request);
    const { id } = IdParams.parse(request.params);
    return styles.get(id, ctx.user);
  });

  app.put('/api/styles/:id', async (request) => {
    const ctx = requireAuth(request);
    const { id } = IdParams.parse(request.params);
    const body = UpdateStyleRequestSchema.parse(request.body);
    return styles.update(id, body, ctx.user);
  });

  app.delete('/api/styles/:id', async (request, reply) => {
    const ctx = requireAuth(request);
    const { id } = IdParams.parse(request.params);
    await styles.delete(id, ctx.user);
    return reply.status(204).send();
  });

  app.post('/api/styles/:id/duplicate', async (request, reply) => {
    const ctx = requireAuth(request);
    const { id } = IdParams.parse(request.params);
    const body = DuplicateStyleRequestSchema.parse(request.body ?? {});
    const created = await styles.duplicate(id, ctx.user, body.name);
    return reply.status(201).send(created);
  });
}
