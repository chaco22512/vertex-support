import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Env } from './env';

/**
 * Anon client: subject to Row Level Security. Safe for browser and server use.
 * Uses the public URL + anon key only.
 */
export function createAnonClient(
  env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_ANON_KEY'>,
): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    auth: { persistSession: false },
  });
}

/**
 * Service-role client: BYPASSES Row Level Security. SERVER-ONLY.
 * Never import this from apps/chat or apps/admin — it would leak the service_role
 * key into a browser bundle (Hard rule 1). Use only in apps/api and scripts.
 */
export function createServiceClient(
  env: Pick<Env, 'SUPABASE_URL' | 'SUPABASE_SERVICE_ROLE_KEY'>,
): SupabaseClient {
  return createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}
