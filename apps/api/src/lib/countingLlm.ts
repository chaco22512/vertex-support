import type { SupabaseClient } from '@supabase/supabase-js';
import { GeminiError, type LlmClient, type LlmGenerateRequest } from '@vertex/ai';

export type AiCallOutcome = 'ok' | 'error' | 'rate_limited' | 'daily_limit';

/** Classify a failed model call for the usage log. */
export function outcomeOf(err: unknown): AiCallOutcome {
  if (err instanceof GeminiError && err.status === 429) return err.isDailyLimit ? 'daily_limit' : 'rate_limited';
  return 'error';
}

/**
 * Wraps the model client so every call is logged in ai_call_log (spec v1.8
 * §7.1 "AI requests today"). Counts only — no prompt or customer text. A
 * logging failure never affects the reply.
 */
export function countingLlm(inner: LlmClient, db: SupabaseClient): LlmClient {
  const record = async (outcome: AiCallOutcome) => {
    try {
      await db.from('ai_call_log').insert({ model: inner.model, outcome });
    } catch {
      /* best effort */
    }
  };
  return {
    model: inner.model,
    async generate(req: LlmGenerateRequest): Promise<string> {
      try {
        const out = await inner.generate(req);
        await record('ok');
        return out;
      } catch (err) {
        // Our own timeout aborts the request; it may still count at Google, so
        // treat it like any other error (counted as used).
        await record(outcomeOf(err));
        throw err;
      }
    },
  };
}
