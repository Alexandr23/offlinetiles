import fs from 'node:fs/promises';
import type { SSEEvent } from '@map-exporter/contracts';
import { buildServer } from './app/server.js';
import { getConfig, type AppConfig } from './config/config.js';
import { createDb, pingDb, type Db } from './db/client.js';
import { runMigrations } from './db/migrations.js';
import { PgEventBus, type EventEnvelope } from './events/event-bus.js';
import { AuthService } from './modules/auth/auth.service.js';
import { UsersRepository } from './modules/auth/users.repository.js';
import { ArtifactService } from './modules/artifacts/artifacts.service.js';
import { DatasetService } from './modules/dataset/dataset.service.js';
import { EstimateService } from './modules/estimates/estimates.service.js';
import { GenerationRepository } from './modules/generations/generations.repository.js';
import { GenerationService } from './modules/generations/generations.service.js';
import { QueueWorker } from './modules/queue/worker.js';
import { StyleRepository } from './modules/styles/styles.repository.js';
import { StyleService } from './modules/styles/styles.service.js';
import { createStdLogger, type Logger } from './shared/logging/logger.js';

type Mode = 'api' | 'worker' | 'all' | 'migrate';

function parseMode(argv: string[]): Mode {
  const mode = (argv[2] ?? 'all') as Mode;
  if (!['api', 'worker', 'all', 'migrate'].includes(mode)) {
    throw new Error(`Unknown mode "${mode}". Use: api | worker | all | migrate`);
  }
  return mode;
}

interface Container {
  config: AppConfig;
  db: Db;
  logger: Logger;
  bus: PgEventBus;
  dataset: DatasetService;
  styleRepo: StyleRepository;
  styles: StyleService;
  generationRepo: GenerationRepository;
  artifacts: ArtifactService;
  estimates: EstimateService;
  generations: GenerationService;
  auth: AuthService;
}

export async function createContainer(config: AppConfig, logger: Logger): Promise<Container> {
  const db = createDb(config.databaseUrl);
  await pingDb(db);

  const dataset = new DatasetService(config, logger.child({ module: 'dataset' }));
  await dataset.load();

  const styleRepo = new StyleRepository(db);
  const generationRepo = new GenerationRepository(db);
  const usersRepo = new UsersRepository(db);
  const auth = new AuthService(config, usersRepo, logger.child({ module: 'auth' }));
  await auth.ensureAdmin();

  const hydrate = async (env: EventEnvelope): Promise<SSEEvent | null> => {
    const id = env.ref?.id;
    if (!id) return null;
    if (env.type.startsWith('generation.')) {
      const generation = await generationRepo.findById(id);
      if (!generation) return null;
      const { styleSnapshot: _snapshot, ...dto } = generation;
      return { type: env.type, data: dto } as SSEEvent;
    }
    if (env.type.startsWith('style.')) {
      const style = await styleRepo.findById(id);
      return style ? ({ type: env.type, data: style } as SSEEvent) : null;
    }
    return null;
  };
  const bus = new PgEventBus(db, logger.child({ module: 'events' }), hydrate);

  const styles = new StyleService(styleRepo, bus);
  const artifacts = new ArtifactService(config);
  const estimates = new EstimateService(config, dataset, generationRepo, logger.child({ module: 'estimates' }));
  const generations = new GenerationService(
    config,
    generationRepo,
    artifacts,
    estimates,
    dataset,
    bus,
    logger.child({ module: 'generations' }),
    auth,
  );

  return { config, db, logger, bus, dataset, styleRepo, styles, generationRepo, artifacts, estimates, generations, auth };
}

async function main(): Promise<void> {
  const mode = parseMode(process.argv);
  const config = getConfig();
  const logger = createStdLogger(config.logLevel, { app: 'map-exporter', mode });

  if (mode === 'migrate') {
    const db = createDb(config.databaseUrl, { max: 1 });
    try {
      const result = await runMigrations(db);
      logger.info({ applied: result.applied, skipped: result.skipped.length }, 'migrations complete');
      for (const name of result.applied) process.stdout.write(`applied ${name}\n`);
      if (result.applied.length === 0) process.stdout.write('database is up to date\n');
    } finally {
      await db.end();
    }
    return;
  }

  await fs.mkdir(config.exportsDir, { recursive: true });
  const c = await createContainer(config, logger);
  const closers: Array<() => Promise<void>> = [];

  if (mode === 'api' || mode === 'all') {
    const app = await buildServer({ ...c, logger: logger.child({ module: 'http' }) });
    await app.listen({ port: config.port, host: config.host });
    logger.info({ port: config.port, dataset: c.dataset.isReady() }, 'api listening');
    closers.push(() => app.close());
  }

  if (mode === 'worker' || mode === 'all') {
    const worker = new QueueWorker({
      config,
      repo: c.generationRepo,
      artifacts: c.artifacts,
      dataset: c.dataset,
      bus: c.bus,
      logger: logger.child({ module: 'worker' }),
    });
    await worker.start();
    logger.info({ generator: config.generatorBinary, threads: config.generatorThreads }, 'worker started');
    closers.unshift(() => worker.stop());
  }

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, 'shutting down');
    for (const close of closers) {
      await close().catch((err) => logger.error({ err }, 'close failed'));
    }
    await c.bus.close();
    await c.dataset.close();
    await c.db.end({ timeout: 5 });
    process.exit(0);
  };
  process.on('SIGINT', () => void shutdown('SIGINT'));
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
}

main().catch((err) => {
  process.stderr.write(`${(err as Error).stack ?? String(err)}\n`);
  process.exit(1);
});
