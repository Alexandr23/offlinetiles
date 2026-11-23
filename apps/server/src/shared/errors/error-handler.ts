import type { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { InvalidTransitionError, type ApiErrorBody } from '@map-exporter/contracts';
import { ZodError } from 'zod';
import { AppError } from './app-error.js';

export function toErrorBody(error: unknown): { statusCode: number; body: ApiErrorBody } {
  if (error instanceof AppError) {
    return {
      statusCode: error.statusCode,
      body: { error: { code: error.code, message: error.message, details: error.details } },
    };
  }
  if (error instanceof ZodError) {
    const first = error.issues[0];
    const where = first?.path.length ? `${first.path.join('.')}: ` : '';
    return {
      statusCode: 400,
      body: {
        error: {
          code: 'VALIDATION_ERROR',
          message: `${where}${first?.message ?? 'invalid request'}`,
          details: error.issues.map((i) => ({ path: i.path, message: i.message })),
        },
      },
    };
  }
  if (error instanceof InvalidTransitionError) {
    return {
      statusCode: 409,
      body: { error: { code: 'INVALID_TRANSITION', message: error.message } },
    };
  }
  const fe = error as Partial<FastifyError>;
  if (typeof fe?.statusCode === 'number' && fe.statusCode >= 400 && fe.statusCode < 500) {
    return {
      statusCode: fe.statusCode,
      body: { error: { code: fe.code ?? 'VALIDATION_ERROR', message: fe.message ?? 'Bad request' } },
    };
  }
  return {
    statusCode: 500,
    body: { error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } },
  };
}

export function errorHandler(error: unknown, request: FastifyRequest, reply: FastifyReply): void {
  const { statusCode, body } = toErrorBody(error);
  if (statusCode >= 500) {
    request.log.error({ err: error }, 'request failed');
  } else {
    request.log.debug({ err: error }, 'request rejected');
  }
  void reply.status(statusCode).send(body);
}
