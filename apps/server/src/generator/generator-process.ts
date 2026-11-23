import { spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import type { Logger } from '../shared/logging/logger.js';
import {
  GeneratorEstimateResultSchema,
  LineBuffer,
  parseGeneratorLine,
  type GeneratorEstimateRequest,
  type GeneratorEstimateResult,
  type GeneratorMessage,
  type GeneratorRequest,
} from './generator-protocol.js';

export interface GeneratorRunHandle {
  /** Resolves when the process exits. Never rejects for protocol-level failures. */
  done: Promise<GeneratorExit>;
  /** Ask the generator to stop gracefully (SIGTERM, then SIGKILL after a grace period). */
  cancel(): void;
}

export interface GeneratorExit {
  exitCode: number | null;
  signal: NodeJS.Signals | null;
  /** Last protocol message observed, if any. */
  last: GeneratorMessage | null;
  /** Stderr tail for diagnostics. */
  stderrTail: string;
}

export interface GeneratorRunOptions {
  binary: string;
  request: GeneratorRequest;
  requestDir: string;
  logger: Logger;
  onMessage: (message: GeneratorMessage) => void;
  killGraceMs?: number;
}

const STDERR_TAIL_BYTES = 8 * 1024;

/**
 * Launches the Rust generator as a child process:
 *   tile-generator generate <request.json>
 * Arguments are always passed as an array – never through a shell.
 */
export async function runGenerator(options: GeneratorRunOptions): Promise<GeneratorRunHandle> {
  const { binary, request, requestDir, logger, onMessage } = options;
  await fs.mkdir(requestDir, { recursive: true });
  const requestFile = path.join(requestDir, `${request.jobId}.request.json`);
  await fs.writeFile(requestFile, JSON.stringify(request, null, 2));

  const child = spawn(binary, ['generate', requestFile], {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, RUST_LOG: process.env.RUST_LOG ?? 'info' },
  });

  let last: GeneratorMessage | null = null;
  let stderrTail = '';
  const stdoutLines = new LineBuffer();

  child.stdout.on('data', (chunk: Buffer) => {
    for (const line of stdoutLines.push(chunk)) {
      const msg = parseGeneratorLine(line);
      if (!msg) {
        if (line.trim()) logger.warn({ line: line.slice(0, 300) }, 'unparseable generator stdout line');
        continue;
      }
      last = msg;
      onMessage(msg);
    }
  });

  child.stderr.on('data', (chunk: Buffer) => {
    const text = chunk.toString('utf8');
    stderrTail = (stderrTail + text).slice(-STDERR_TAIL_BYTES);
    for (const line of text.split('\n')) {
      if (line.trim()) logger.debug({ generator: true }, line);
    }
  });

  let killTimer: NodeJS.Timeout | null = null;

  const done = new Promise<GeneratorExit>((resolve) => {
    const finish = (exitCode: number | null, signal: NodeJS.Signals | null) => {
      if (killTimer) clearTimeout(killTimer);
      for (const line of stdoutLines.flush()) {
        const msg = parseGeneratorLine(line);
        if (msg) {
          last = msg;
          onMessage(msg);
        }
      }
      void fs.rm(requestFile, { force: true });
      resolve({ exitCode, signal, last, stderrTail });
    };
    child.on('error', (err) => {
      logger.error({ err }, 'failed to spawn generator');
      stderrTail = `${stderrTail}\n${err.message}`;
      finish(null, null);
    });
    child.on('close', finish);
  });

  return {
    done,
    cancel: () => terminate(child, options.killGraceMs ?? 10_000, (t) => (killTimer = t)),
  };
}

function terminate(child: ChildProcess, graceMs: number, setTimer: (t: NodeJS.Timeout) => void): void {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  const t = setTimeout(() => {
    if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
  }, graceMs);
  t.unref();
  setTimer(t);
}

/**
 * Runs `tile-generator estimate <request.json>` and returns the deterministic
 * tile count + sampled byte sizes. Used by the API process for estimates.
 */
export async function runGeneratorEstimate(
  binary: string,
  request: GeneratorEstimateRequest,
  logger: Logger,
  timeoutMs = 60_000,
): Promise<GeneratorEstimateResult> {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'map-exporter-estimate-'));
  const file = path.join(dir, 'estimate.json');
  await fs.writeFile(file, JSON.stringify(request));

  try {
    return await new Promise<GeneratorEstimateResult>((resolve, reject) => {
      const child = spawn(binary, ['estimate', file], { stdio: ['ignore', 'pipe', 'pipe'] });
      let stdout = '';
      let stderr = '';
      const timer = setTimeout(() => {
        child.kill('SIGKILL');
        reject(new Error('estimate timed out'));
      }, timeoutMs);
      child.stdout.on('data', (c: Buffer) => (stdout += c.toString('utf8')));
      child.stderr.on('data', (c: Buffer) => (stderr = (stderr + c.toString('utf8')).slice(-4000)));
      child.on('error', (err) => {
        clearTimeout(timer);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        const lines = stdout.split('\n').filter((l) => l.trim());
        for (const line of lines) {
          try {
            const parsed = GeneratorEstimateResultSchema.safeParse(JSON.parse(line));
            if (parsed.success) {
              resolve(parsed.data);
              return;
            }
            const failed = parseGeneratorLine(line);
            if (failed?.type === 'failed') {
              reject(new Error(`${failed.code}: ${failed.message}`));
              return;
            }
          } catch {
            // not JSON, keep scanning
          }
        }
        logger.warn({ code, stderr }, 'estimate produced no result');
        reject(new Error(`estimate failed (exit ${code})`));
      });
    });
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
