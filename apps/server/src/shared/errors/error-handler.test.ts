import { InvalidTransitionError } from '@map-exporter/contracts';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { AppError } from './app-error.js';
import { toErrorBody } from './error-handler.js';

describe('toErrorBody', () => {
  it('maps AppError to its status code and structured body', () => {
    const err = new AppError('INVALID_STYLE', 'Style is invalid: bad layer', 400, [{ message: 'bad layer' }]);
    expect(toErrorBody(err)).toEqual({
      statusCode: 400,
      body: { error: { code: 'INVALID_STYLE', message: 'Style is invalid: bad layer', details: [{ message: 'bad layer' }] } },
    });
    expect(toErrorBody(AppError.datasetNotReady()).statusCode).toBe(503);
    expect(toErrorBody(AppError.notFound('generation', 'x')).body.error.message).toBe('generation x not found');
  });

  it('turns zod errors into 400 VALIDATION_ERROR with the first path in the message', () => {
    const schema = z.object({ minZoom: z.number().int().min(0).max(14) });
    const result = schema.safeParse({ minZoom: 99 });
    expect(result.success).toBe(false);
    if (result.success) return;
    const { statusCode, body } = toErrorBody(result.error);
    expect(statusCode).toBe(400);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message.startsWith('minZoom: ')).toBe(true);
    expect(Array.isArray(body.error.details)).toBe(true);
  });

  it('maps invalid state transitions to 409', () => {
    const { statusCode, body } = toErrorBody(new InvalidTransitionError('COMPLETED', 'GENERATING'));
    expect(statusCode).toBe(409);
    expect(body.error.code).toBe('INVALID_TRANSITION');
  });

  it('passes through Fastify 4xx errors but never leaks unknown errors', () => {
    const fastifyErr = Object.assign(new Error('body too large'), { statusCode: 413, code: 'FST_ERR_CTP_BODY_TOO_LARGE' });
    expect(toErrorBody(fastifyErr)).toEqual({
      statusCode: 413,
      body: { error: { code: 'FST_ERR_CTP_BODY_TOO_LARGE', message: 'body too large' } },
    });

    const secret = new Error('postgres://user:password@host/db failed');
    const { statusCode, body } = toErrorBody(secret);
    expect(statusCode).toBe(500);
    expect(body).toEqual({ error: { code: 'INTERNAL_ERROR', message: 'Internal server error' } });
    expect(JSON.stringify(body)).not.toContain('password');
  });
});
