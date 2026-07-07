/**
 * Seed the first admin account (build_spec_v1_4.md §7.6 / M5).
 * Creates a Supabase Auth user and an admin `staff` row. Idempotent.
 *
 * Setup: add to .env
 *   ADMIN_EMAIL=you@example.com   (defaults to the project owner's email)
 *   ADMIN_PASSWORD=...            (choose a strong password — never committed)
 *   ADMIN_NAME=Your Name          (optional)
 *
 * Run: pnpm seed:admin
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createServiceClient, parseEnv } from '@vertex/shared';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const env = parseEnv(process.env);

  const email = process.env.ADMIN_EMAIL ?? 'yusuke.kaga@sim-point.jp';
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME ?? 'Admin';
  if (!password) {
    throw new Error('Set ADMIN_PASSWORD in .env before seeding the admin account.');
  }

  const supabase = createServiceClient(env);

  // 1. Create the auth user (or reuse if it already exists).
  let userId: string | undefined;
  const created = await supabase.auth.admin.createUser({ email, password, email_confirm: true });
  if (created.error) {
    const list = await supabase.auth.admin.listUsers();
    if (list.error) {
      throw new Error(`createUser failed (${created.error.message}); listUsers failed (${list.error.message})`);
    }
    const existing = list.data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase());
    if (!existing) throw new Error(`createUser failed and no existing user found: ${created.error.message}`);
    userId = existing.id;
    console.log('Auth user already existed — reusing it.');
  } else {
    userId = created.data.user?.id;
    console.log('Auth user created.');
  }
  if (!userId) throw new Error('Could not resolve the user id.');

  // 2. Upsert the admin staff row (idempotent).
  const { error } = await supabase.from('staff').upsert({
    id: userId,
    name,
    email,
    role: 'admin',
    languages: ['en'],
    channels: ['webchat'],
    is_active: true,
  });
  if (error) throw new Error(`staff upsert failed: ${error.message}`);

  console.log(`Admin ready: ${email} (role=admin). Log in at the /admin app.`);
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
