import cors from '@fastify/cors';
import Fastify, { type FastifyInstance } from 'fastify';
import type { AppConfig } from '../config/config.js';
import type { Db } from '../db/client.js';
import type { EventBus } from '../events/event-bus.js';
import { registerSseRoute } from '../events/sse.js';
import { errorHandler } from '../shared/errors/error-handler.js';
import type { Logger } from '../shared/logging/logger.js';
import { registerAuthPlugin } from '../modules/auth/auth.plugin.js';
import { registerAdminRoutes, registerAuthRoutes } from '../modules/auth/auth.routes.js';
import type { AuthService } from '../modules/auth/auth.service.js';
import { registerDatasetRoutes } from '../modules/dataset/dataset.routes.js';
import type { DatasetService } from '../modules/dataset/dataset.service.js';
import { registerStyleRoutes } from '../modules/styles/styles.routes.js';
import type { StyleService } from '../modules/styles/styles.service.js';
import { registerGenerationRoutes } from '../modules/generations/generations.routes.js';
import type { GenerationService } from '../modules/generations/generations.service.js';
import { registerArtifactRoutes } from '../modules/artifacts/artifacts.routes.js';
import type { ArtifactService } from '../modules/artifacts/artifacts.service.js';
import type { EstimateService } from '../modules/estimates/estimates.service.js';
import { registerAssetRoutes } from '../modules/dataset/assets.routes.js';

export interface ServerDeps {
  config: AppConfig;
  db: Db;
  bus: EventBus;
  dataset: DatasetService;
  styles: StyleService;
  generations: GenerationService;
  artifacts: ArtifactService;
  estimates: EstimateService;
  auth: AuthService;
  logger?: Logger;
}

export async function buildServer(deps: ServerDeps): Promise<FastifyInstance> {
  const common = {
    bodyLimit: 8 * 1024 * 1024, // style snapshots can be a few hundred KB; 8MB is a generous ceiling
    disableRequestLogging: deps.config.nodeEnv !== 'development',
    trustProxy: true,
  };
  const app: FastifyInstance = deps.logger
    ? Fastify({ ...common, loggerInstance: deps.logger })
    : Fastify({ ...common, logger: { level: deps.config.logLevel } });

  await app.register(cors, {
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    exposedHeaders: ['X-New-Session-Token'],
  });

  app.setErrorHandler(errorHandler);
  app.setNotFoundHandler((request, reply) => {
    void reply.status(404).send({ error: { code: 'NOT_FOUND', message: `Route ${request.method} ${request.url} not found` } });
  });

  await registerAuthPlugin(app, deps.auth);

  app.get('/api/health', async () => ({ ok: true, time: new Date().toISOString() }));

  registerAuthRoutes(app, deps.auth);
  registerAdminRoutes(app, deps.auth, deps.generations);
  registerDatasetRoutes(app, deps.dataset);
  registerAssetRoutes(app, deps.config);
  registerStyleRoutes(app, deps.styles, deps.auth);
  registerGenerationRoutes(app, deps.generations, deps.estimates, deps.auth);
  registerArtifactRoutes(app, deps.artifacts, deps.generations, deps.auth);
  registerSseRoute(app, deps.bus);

  return app;
}
