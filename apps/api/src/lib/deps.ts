import { GeminiClient } from '@vertex/ai';
import { createServiceClient, parseEnv } from '@vertex/shared';
import type { ApiBindings, Deps } from '../types';

/** Build the real per-request dependencies from Worker bindings. */
export function defaultDeps(env: ApiBindings): Deps {
  const parsed = parseEnv(env as unknown as Record<string, unknown>);
  return {
    db: createServiceClient(parsed),
    llm: new GeminiClient({ apiKey: parsed.GEMINI_API_KEY }),
    kv: env.RATE_LIMIT,
    adminOrigin: env.ADMIN_BASE_URL,
    chatOrigin: env.CHAT_BASE_URL ?? 'http://localhost:5173',
  };
}
