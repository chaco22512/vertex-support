import type { SupabaseClient } from '@supabase/supabase-js';
import type { LlmClient } from '@vertex/ai';
import type { Conversation, Env } from '@vertex/shared';

/** Worker bindings: the parseEnv secrets/vars plus the KV rate-limit store. */
export interface ApiBindings extends Env {
  RATE_LIMIT: KVNamespace;
}

/** Per-request dependencies, injectable for testing. */
export interface Deps {
  db: SupabaseClient;
  llm: LlmClient;
  kv: KVNamespace;
  adminOrigin: string;
  chatOrigin: string;
}

export interface Variables {
  deps: Deps;
  conversation: Conversation;
}

export type AppEnv = { Bindings: ApiBindings; Variables: Variables };
