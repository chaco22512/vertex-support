/**
 * Resolve the test conversations created by the v1.8 smoke scripts so they do
 * not sit in the staff Inbox. Only touches conversations whose source_tag is
 * one of SMOKE_TAGS; sets status='resolved' (no deletion).
 *
 * Usage: pnpm --filter @vertex/scripts exec tsx cleanup_smoke.ts
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { createServiceClient, parseEnv } from '@vertex/shared';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SMOKE_TAGS = ['smoke-v1.8-phase0', 'smoke-v1.8-phase1'];

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const db = createServiceClient(parseEnv(process.env));

  const { data: before, error } = await db
    .from('conversations')
    .select('id,source_tag,status')
    .in('source_tag', SMOKE_TAGS);
  if (error) throw new Error(error.message);
  const rows = (before ?? []) as { id: string; source_tag: string; status: string }[];
  const open = rows.filter((r) => r.status !== 'resolved' && r.status !== 'closed');
  console.log(`smoke conversations: ${rows.length} (to resolve: ${open.length})`);

  if (open.length > 0) {
    const { error: e2 } = await db
      .from('conversations')
      .update({ status: 'resolved', updated_at: new Date().toISOString() })
      .in(
        'id',
        open.map((r) => r.id),
      );
    if (e2) throw new Error(e2.message);
  }
  const byTag = new Map<string, number>();
  for (const r of rows) byTag.set(r.source_tag, (byTag.get(r.source_tag) ?? 0) + 1);
  for (const [tag, n] of byTag) console.log(`  ${tag}: ${n}`);
  console.log('all smoke conversations are now resolved');
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
