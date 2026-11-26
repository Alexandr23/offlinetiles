import type { InterestSubmission } from '@map-exporter/contracts';
import Fastify, { type FastifyInstance } from 'fastify';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { errorHandler } from '../../shared/errors/error-handler.js';
import type { AuthContext } from '../auth/auth.service.js';
import type { InterestRepository, NewInterest } from './interest.repository.js';
import { registerInterestRoutes } from './interest.routes.js';
import { RateLimiter } from './rate-limit.js';

class FakeRepo {
  rows: InterestSubmission[] = [];
  async create(input: NewInterest) {
    const row: InterestSubmission = { ...input, id: crypto.randomUUID(), createdAt: new Date().toISOString() };
    this.rows.unshift(row);
    return row;
  }
  async list(limit: number, offset: number) {
    return { submissions: this.rows.slice(offset, offset + limit), total: this.rows.length };
  }
  async delete(id: string) {
    const before = this.rows.length;
    this.rows = this.rows.filter((r) => r.id !== id);
    return this.rows.length < before;
  }
}

const valid = { email: ' You@Example.com ', intendedUse: 'gis' };

describe('interest routes', () => {
  let app: FastifyInstance;
  let repo: FakeRepo;

  beforeEach(async () => {
    repo = new FakeRepo();
    app = Fastify();
    app.setErrorHandler(errorHandler);
    app.decorateRequest('auth', null);
    // Stand-in for the auth plugin: the "x-role" header picks the caller's role.
    app.addHook('preHandler', async (request) => {
      const role = request.headers['x-role'];
      request.auth = role ? ({ user: { role } } as unknown as AuthContext) : null;
    });
    registerInterestRoutes(app, repo as unknown as InterestRepository, new RateLimiter(2, 60_000));
    await app.ready();
  });

  afterEach(() => app.close());

  it('stores a submission from an anonymous visitor, normalising the email', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/interest',
      payload: {
        ...valid,
        features: ['api', 'api', 'vector'],
        feedback: '  hi  ',
        utmSource: '',
        marketingConsent: true,
      },
    });
    expect(res.statusCode).toBe(201);
    expect(repo.rows).toHaveLength(1);
    expect(repo.rows[0]).toMatchObject({
      email: 'you@example.com',
      intendedUse: 'gis',
      features: ['api', 'vector'],
      willingness: null,
      feedback: 'hi',
      marketingConsent: true,
      utmSource: null,
    });
  });

  it.each([
    ['a bad email', { ...valid, email: 'nope' }],
    ['updates without an email', { intendedUse: 'gis', marketingConsent: true }],
    ['a missing intended use', { email: 'a@b.co' }],
    ['an unknown intended use', { ...valid, intendedUse: 'spam' }],
    ['an unknown feature', { ...valid, features: ['teleport'] }],
    ['an over-long feedback', { ...valid, feedback: 'x'.repeat(2001) }],
  ])('rejects %s', async (_name, payload) => {
    const res = await app.inject({ method: 'POST', url: '/api/interest', payload });
    expect(res.statusCode).toBe(400);
    expect(repo.rows).toHaveLength(0);
  });

  it('accepts a submission without an email when no updates are wanted', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/interest',
      payload: { intendedUse: 'gis', features: ['satellite'] },
    });
    expect(res.statusCode).toBe(201);
    expect(repo.rows[0]).toMatchObject({ email: null, features: ['satellite'], marketingConsent: false });
  });

  it('limits how often one visitor can submit', async () => {
    const post = () => app.inject({ method: 'POST', url: '/api/interest', payload: valid });
    expect((await post()).statusCode).toBe(201);
    expect((await post()).statusCode).toBe(201);
    expect((await post()).statusCode).toBe(429);
    expect(repo.rows).toHaveLength(2);
  });

  it('lists and deletes submissions for admins only', async () => {
    await app.inject({ method: 'POST', url: '/api/interest', payload: valid });
    const id = repo.rows[0]!.id;

    expect((await app.inject({ method: 'GET', url: '/api/admin/interest' })).statusCode).toBe(401);
    expect(
      (await app.inject({ method: 'GET', url: '/api/admin/interest', headers: { 'x-role': 'user' } })).statusCode,
    ).toBe(403);
    expect(
      (await app.inject({ method: 'DELETE', url: `/api/admin/interest/${id}`, headers: { 'x-role': 'user' } }))
        .statusCode,
    ).toBe(403);

    const list = await app.inject({ method: 'GET', url: '/api/admin/interest', headers: { 'x-role': 'admin' } });
    expect(list.statusCode).toBe(200);
    expect(list.json()).toMatchObject({ total: 1, submissions: [{ id, email: 'you@example.com' }] });

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/admin/interest/${id}`,
      headers: { 'x-role': 'admin' },
    });
    expect(del.statusCode).toBe(204);
    const again = await app.inject({
      method: 'DELETE',
      url: `/api/admin/interest/${id}`,
      headers: { 'x-role': 'admin' },
    });
    expect(again.statusCode).toBe(404);
  });
});
