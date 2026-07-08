/**
 * Apply a SQL migration file to the Supabase Postgres via SUPABASE_DB_URL.
 * Usage: pnpm --filter @vertex/scripts apply:migration <path-to.sql>
 *
 * Non-destructive migrations only unless a human has approved otherwise
 * (CLAUDE.md hard rule 5). The connection string (incl. password) comes from
 * .env and is never printed.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import postgres from 'postgres';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const url = process.env.SUPABASE_DB_URL;
  if (!url) throw new Error('SUPABASE_DB_URL is not set in .env');

  const file = process.argv[2];
  if (!file) throw new Error('Usage: apply:migration <path-to.sql>');
  const sql = readFileSync(resolve(process.cwd(), file), 'utf8');

  const client = postgres(url, { max: 1, prepare: false });
  try {
    await client.unsafe(sql);
    console.log(`Applied migration: ${file}`);
  } finally {
    await client.end();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
