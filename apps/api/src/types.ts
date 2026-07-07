import type { SupabaseClient } from '@supabase/supabase-js';
import type { LlmClient } from '@vertex/ai';
import type { Conversation, Env, Role } from '@vertex/shared';

/** Worker bindings: the parseEnv secrets/vars plus the KV rate-limit store. */
export interface ApiBindings extends Env {
  RATE_LIMIT: KVNamespace;
}

/** Authenticated staff context resolved from a Supabase Auth JWT (§7). */
export interface StaffAuth {
  userId: string;
  role: Role;
  isActive: boolean;
  name: string;
}

/** Per-request dependencies, injectable for testing. */
export interface Deps {
  db: SupabaseClient;
  llm: LlmClient;
  kv: KVNamespace;
  adminOrigin: string;
  chatOrigin: string;
  /** Validate a Supabase Auth JWT and resolve the staff row, or null. */
  verifyStaff: (token: string) => Promise<StaffAuth | null>;
}

export interface Variables {
  deps: Deps;
  conversation: Conversation;
  staff: StaffAuth;
}

export type AppEnv = { Bindings: ApiBindings; Variables: Variables };
