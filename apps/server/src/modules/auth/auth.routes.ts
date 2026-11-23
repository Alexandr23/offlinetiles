import {
  CreateUserRequestSchema,
  LoginRequestSchema,
  UpdateRoleLimitsRequestSchema,
  UpdateUserLimitsRequestSchema,
} from '@map-exporter/contracts';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { GenerationService } from '../generations/generations.service.js';
import { requireAdmin, requireAuth } from './auth.plugin.js';
import type { AuthService } from './auth.service.js';
import { extractBearerToken } from './auth.service.js';

const IdParams = z.object({ id: z.uuid() });
const RoleParams = z.object({ role: z.enum(['guest', 'user']) });

export function registerAuthRoutes(app: FastifyInstance, auth: AuthService): void {
  app.post('/api/auth/guest', async () => auth.createGuestSession());

  app.post('/api/auth/login', async (request) => {
    const body = LoginRequestSchema.parse(request.body);
    return auth.login(body);
  });

  app.post('/api/auth/logout', async (request, reply) => {
    const token = extractBearerToken(request.headers.authorization) ?? request.auth?.token ?? null;
    await auth.logout(token);
    return reply.status(204).send();
  });

  app.get('/api/auth/me', async (request) => {
    const ctx = requireAuth(request);
    return auth.me(ctx);
  });
}

export function registerAdminRoutes(
  app: FastifyInstance,
  auth: AuthService,
  generations: GenerationService,
): void {
  app.get('/api/admin/users', async (request) => {
    requireAdmin(request);
    return auth.listUsers();
  });

  app.post('/api/admin/users', async (request, reply) => {
    requireAdmin(request);
    const body = CreateUserRequestSchema.parse(request.body);
    const user = await auth.createUser(body);
    return reply.status(201).send(user);
  });

  app.patch('/api/admin/users/:id/limits', async (request) => {
    requireAdmin(request);
    const { id } = IdParams.parse(request.params);
    const body = UpdateUserLimitsRequestSchema.parse(request.body ?? {});
    return auth.updateUserLimits(id, body);
  });

  app.post('/api/admin/users/:id/reset-usage', async (request) => {
    requireAdmin(request);
    const { id } = IdParams.parse(request.params);
    return auth.resetUserUsage(id);
  });

  app.patch('/api/admin/role-limits/:role', async (request) => {
    requireAdmin(request);
    const { role } = RoleParams.parse(request.params);
    const body = UpdateRoleLimitsRequestSchema.parse(request.body ?? {});
    return auth.updateRoleLimits(role, body);
  });

  app.get('/api/admin/queue', async (request) => {
    requireAdmin(request);
    return generations.listAll(200);
  });
}
