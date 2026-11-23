import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Db } from './client.js';

const here = path.dirname(fileURLToPath(import.meta.url));
export const MIGRATIONS_DIR = path.resolve(here, '../../migrations');

export interface MigrationResult {
  applied: string[];
  skipped: string[];
}

/**
 * Plain SQL migrations: `migrations/NNNN_name.sql`, applied in lexical order,
 * each inside its own transaction and recorded in `schema_migrations`.
 */
export async function runMigrations(db: Db, dir: string = MIGRATIONS_DIR): Promise<MigrationResult> {
  await db`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `;

  const files = (await fs.readdir(dir)).filter((f) => f.endsWith('.sql')).sort();
  const appliedRows = await db<{ name: string }[]>`SELECT name FROM schema_migrations`;
  const applied = new Set(appliedRows.map((r) => r.name));

  const result: MigrationResult = { applied: [], skipped: [] };

  for (const file of files) {
    if (applied.has(file)) {
      result.skipped.push(file);
      continue;
    }
    const sqlText = await fs.readFile(path.join(dir, file), 'utf8');
    await db.begin(async (tx) => {
      await tx.unsafe(sqlText);
      await tx`INSERT INTO schema_migrations (name) VALUES (${file})`;
    });
    result.applied.push(file);
  }

  return result;
}
