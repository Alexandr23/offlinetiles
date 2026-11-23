import type { AuthUser } from '@map-exporter/contracts';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { AppError } from '../../shared/errors/app-error.js';
import type { AuthContext, AuthService } from './auth.service.js';
import { extractBearerToken } from './auth.service.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth: AuthContext | null;
  }
}

export async function registerAuthPlugin(app: FastifyInstance, auth: AuthService): Promise<void> {
  app.decorateRequest('auth', null);

  app.addHook('preHandler', async (request) => {
    const token = extractBearerToken(request.headers.authorization);
    request.auth = await auth.resolveToken(token);
  });
}

export function requireAuth(request: FastifyRequest): AuthContext {
  if (!request.auth) throw AppError.unauthorized();
  return request.auth;
}

export function requireAdmin(request: FastifyRequest): AuthContext {
  const ctx = requireAuth(request);
  if (ctx.user.role !== 'admin') throw AppError.forbidden('Admin access required');
  return ctx;
}

export function requireUser(request: FastifyRequest): AuthUser {
  return requireAuth(request).user;
}

/** Ensures a guest/user/admin session exists; creates a guest if the request is anonymous. */
export async function ensureSession(
  request: FastifyRequest,
  reply: FastifyReply,
  auth: AuthService,
): Promise<AuthContext> {
  if (request.auth) return request.auth;
  const session = await auth.createGuestSession();
  reply.header('X-New-Session-Token', session.token);
  const resolved = await auth.resolveToken(session.token);
  if (!resolved) throw AppError.internal('Failed to establish guest session');
  request.auth = resolved;
  return resolved;
}
