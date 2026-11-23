/**
 * Runs Planetiler (OpenMapTiles profile) to turn an .osm.pbf into PMTiles.
 *
 * Two runners, chosen automatically:
 *   - `jar`    when PLANETILER_JAR points at a planetiler.jar (needs Java 21+)
 *   - `docker` otherwise, using PLANETILER_IMAGE (no Java required)
 *
 * Processes are always spawned with argument arrays, never shell strings.
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { CliError, formatDuration, log, type InitEnv } from './cli.ts';

export type PlanetilerRunner = 'docker' | 'jar';

export interface PlanetilerJob {
  /** Absolute path to the .osm.pbf input (must be inside env.dataDir for Docker). */
  osmPath: string;
  /** Absolute path of the PMTiles output (must end in .pmtiles). */
  outputPath: string;
  /** True for the full planet: switches node storage to mmap arrays. */
  planet: boolean;
  /** Override JVM heap, e.g. "4g". */
  memory?: string;
  /** Extra raw Planetiler arguments (advanced). */
  extraArgs?: string[];
}

export interface PlanetilerRun {
  runner: PlanetilerRunner;
  image?: string;
  jar?: string;
  args: string[];
  durationMs: number;
}

export function detectRunner(env: InitEnv): PlanetilerRunner {
  if (env.planetilerJar) {
    if (!fs.existsSync(env.planetilerJar)) throw new CliError(`PLANETILER_JAR is set but ${env.planetilerJar} does not exist`);
    return 'jar';
  }
  return 'docker';
}

/** Translate a host path inside env.dataDir into the container path under /data. */
function containerPath(env: InitEnv, hostPath: string): string {
  const rel = path.relative(path.resolve(env.dataDir), path.resolve(hostPath));
  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new CliError(`${hostPath} must live inside DATA_DIR (${env.dataDir}) to be visible to the Planetiler container`);
  }
  return path.posix.join('/data', rel.split(path.sep).join('/'));
}

function planetilerArgs(env: InitEnv, job: PlanetilerJob, toPath: (p: string) => string): string[] {
  const scratch = toPath(env.planetilerDir);
  const args = [
    `--osm-path=${toPath(job.osmPath)}`,
    `--output=${toPath(job.outputPath)}`,
    // Water polygons, Natural Earth and lake centerlines are fetched once and cached.
    '--download',
    `--water-polygons-path=${scratch}/water-polygons-split-3857.zip`,
    `--natural-earth-path=${scratch}/natural_earth_vector.sqlite.zip`,
    `--lake-centerlines-path=${scratch}/lake_centerline.shp.zip`,
    `--tmpdir=${scratch}/tmp`,
    '--force',
    '--maxzoom=12',
    // Avoid MappedByteBuffer int-overflows in ExternalMergeSort when heap is large
    // (chunk size ≈ min(2GB, Xmx/3)); buffered IO is slower but reliable in Docker.
    '--mmap-temp=false',
  ];
  if (job.planet) {
    args.push('--bounds=planet', '--nodemap-type=array', '--storage=mmap');
  }
  if (job.extraArgs) args.push(...job.extraArgs);
  return args;
}

async function commandExists(cmd: string, args: string[]): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { stdio: 'ignore' });
    child.on('error', () => resolve(false));
    child.on('exit', (code) => resolve(code === 0));
  });
}

export async function runPlanetiler(env: InitEnv, job: PlanetilerJob): Promise<PlanetilerRun> {
  if (!job.outputPath.endsWith('.pmtiles')) {
    throw new CliError('Planetiler infers the output format from the extension; output must end in .pmtiles');
  }
  const runner = detectRunner(env);
  const memory = job.memory ?? env.planetilerMemory;
  const started = Date.now();
  let command: string;
  let argv: string[];
  let args: string[];

  // Drop leftovers from a previous crash so corrupted feature chunks cannot poison this run.
  await fsp.rm(path.join(env.planetilerDir, 'tmp'), { recursive: true, force: true });

  if (runner === 'jar') {
    // PLANETILER_JAVA_HOME wins over shell JAVA_HOME (loadEnvFile won't override the latter).
    const javaHome = env.planetilerJavaHome ?? process.env.JAVA_HOME?.trim() ?? null;
    const javaBin = javaHome ? path.join(javaHome, 'bin', 'java') : 'java';
    if (!(await commandExists(javaBin, ['-version']))) {
      throw new CliError(
        'PLANETILER_JAR is set but `java` was not found (set PLANETILER_JAVA_HOME or JAVA_HOME to Java 21+, or put java on PATH)',
      );
    }
    args = planetilerArgs(env, job, (p) => path.resolve(p));
    command = javaBin;
    // Parallel GC: G1 has SIGSEGV'd mid-planet on Temurin 21 / Intel macOS (hs_err in GC threads).
    argv = [`-Xmx${memory}`, '-XX:+UseParallelGC', '-jar', env.planetilerJar!, ...args];
  } else {
    if (!(await commandExists('docker', ['version']))) {
      throw new CliError(
        'Docker is not available. Start Docker Desktop, or set PLANETILER_JAR to a local planetiler.jar (requires Java 21+).',
      );
    }
    args = planetilerArgs(env, job, (p) => containerPath(env, p));
    command = 'docker';
    argv = [
      'run',
      '--rm',
      '-e',
      `JAVA_TOOL_OPTIONS=-Xmx${memory} -XX:+UseParallelGC`,
      '-v',
      `${path.resolve(env.dataDir)}:/data`,
    ];
    // On Linux bind mounts keep the container's uid; match the host user so outputs are not root-owned.
    if (os.platform() === 'linux' && typeof process.getuid === 'function' && typeof process.getgid === 'function') {
      argv.push('--user', `${process.getuid()}:${process.getgid()}`, '-e', 'HOME=/tmp');
    }
    argv.push(env.planetilerImage, ...args);
  }

  log.step(`planetiler (${runner}, -Xmx${memory}, ParallelGC)`);
  log.info(`  ${command} ${argv.map(quoteForDisplay).join(' ')}`);

  const exitCode = await new Promise<number>((resolve, reject) => {
    const child = spawn(command, argv, { stdio: ['ignore', 'pipe', 'pipe'] });
    child.stdout.on('data', (chunk: Buffer) => forwardPlanetilerOutput(chunk));
    child.stderr.on('data', (chunk: Buffer) => forwardPlanetilerOutput(chunk));
    child.on('error', reject);
    child.on('exit', (code, signal) => resolve(code ?? (signal ? 128 : 1)));
    const stop = () => child.kill('SIGTERM');
    process.once('SIGINT', stop);
    process.once('SIGTERM', stop);
  });
  log.progressEnd();
  const durationMs = Date.now() - started;
  if (exitCode !== 0) {
    throw new CliError(`Planetiler exited with code ${exitCode} after ${formatDuration(durationMs)}`);
  }
  if (!fs.existsSync(job.outputPath)) {
    throw new CliError(`Planetiler finished but ${job.outputPath} was not produced`);
  }
  log.ok(`planetiler finished in ${formatDuration(durationMs)}`);
  return {
    runner,
    image: runner === 'docker' ? env.planetilerImage : undefined,
    jar: runner === 'jar' ? env.planetilerJar! : undefined,
    args,
    durationMs,
  };
}

let partial = '';
/** Planetiler logs are verbose; forward them line by line, collapsing progress spam onto one line. */
function forwardPlanetilerOutput(chunk: Buffer): void {
  partial += chunk.toString('utf8');
  const lines = partial.split('\n');
  partial = lines.pop() ?? '';
  for (const raw of lines) {
    const line = raw.replace(/\r/g, '').trimEnd();
    if (!line) continue;
    // Periodic progress lines look like "  0:01:23 INF [osm_pass2] - 12% ..." or contain "cpus:" stats.
    const isProgress = /\b\d+%\b/.test(line) || /\bcpus:|\bgc:|\bmem:/.test(line);
    if (isProgress && process.stderr.isTTY) {
      log.progress(`  ${line.slice(0, Math.max(40, (process.stderr.columns ?? 120) - 12))}`);
    } else {
      log.progressEnd();
      process.stderr.write(`  ${line}\n`);
    }
  }
}

function quoteForDisplay(arg: string): string {
  return /[\s"']/.test(arg) ? JSON.stringify(arg) : arg;
}
