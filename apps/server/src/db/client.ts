import postgres, { type Sql } from 'postgres';

export type Db = Sql;

export function createDb(databaseUrl: string, options: { max?: number } = {}): Db {
  return postgres(databaseUrl, {
    max: options.max ?? 10,
    idle_timeout: 30,
    connect_timeout: 10,
    // BIGINT columns arrive as strings by default; our sizes/durations fit in JS numbers.
    types: {
      bigint: {
        to: 20,
        from: [20],
        serialize: (v: number | bigint) => String(v),
        parse: (v: string) => Number(v),
      },
    },
    onnotice: () => {},
  });
}

export async function pingDb(db: Db): Promise<void> {
  await db`SELECT 1`;
}
