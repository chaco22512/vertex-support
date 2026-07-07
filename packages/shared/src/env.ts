/**
 * Typed server-side environment.
 *
 * SECURITY (Hard rule 1): every value here is a secret or server config and must
 * NEVER reach the browser bundle. Only apps/api and scripts import this. The chat
 * and admin front-ends receive only public, RLS-guarded values (SUPABASE_URL and
 * SUPABASE_ANON_KEY) via Vite's VITE_-prefixed env — not through this module.
 *
 * `parseEnv` works for both Node scripts (process.env) and Cloudflare Workers
 * (the env bindings object), since both are `Record<string, string | undefined>`.
 */

export interface Env {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  GEMINI_API_KEY: string;
  SLACK_WEBHOOK_URL: string;
  RESEND_API_KEY: string;
  ADMIN_BASE_URL: string;
  /**
   * Optional (not required by parseEnv). Chat front-end origin for CORS.
   * Set as a Worker var, defaulted to localhost in dev. Kept out of ENV_KEYS so
   * scripts/import that call parseEnv are not forced to define it.
   */
  CHAT_BASE_URL?: string;
}

export const ENV_KEYS = [
  'SUPABASE_URL',
  'SUPABASE_ANON_KEY',
  'SUPABASE_SERVICE_ROLE_KEY',
  'GEMINI_API_KEY',
  'SLACK_WEBHOOK_URL',
  'RESEND_API_KEY',
  'ADMIN_BASE_URL',
] as const satisfies ReadonlyArray<keyof Env>;

/**
 * Validate and extract the required environment. Throws a single error naming
 * every missing key. An empty string is treated as missing.
 */
export function parseEnv(source: Record<string, unknown>): Env {
  const out = {} as Record<keyof Env, string>;
  const missing: string[] = [];

  for (const key of ENV_KEYS) {
    const value = source[key];
    if (typeof value !== 'string' || value === '') {
      missing.push(key);
    } else {
      out[key] = value;
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
  }

  return out;
}
