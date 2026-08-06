import { z } from 'zod';
import type { AiAction, EscalationReason, FollowUp } from '@vertex/shared';

export const ESCALATION_REASONS = [
  'none',
  'price_question',
  'not_in_manual',
  'account_specific',
  'complaint',
  'other',
] as const satisfies readonly EscalationReason[];

export const AI_ACTIONS = ['answer', 'ask', 'escalate'] as const satisfies readonly AiAction[];

const followUpSchema = z.object({
  question: z.string().min(1),
  options: z.array(z.string().min(1)),
});

/** Options shown for an "ask" turn (spec §2-2): keep 2–5, else the ask degrades. */
const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;

/**
 * Lenient input schema (★v1.6). Accepts the action-based shape and tolerates
 * drift: `action` may be absent (derived from legacy `escalate`/`follow_up` in
 * normalizeResponse below), and `follow_up` is optional here so an under-specified
 * "ask" can be safely downgraded rather than rejected.
 */
export const aiResponseSchema = z.object({
  action: z.enum(AI_ACTIONS).optional(),
  escalate: z.boolean().optional(),
  answer: z.string(),
  follow_up: followUpSchema.nullish(),
  reason: z.enum(ESCALATION_REASONS),
  rule_ids: z.array(z.string()),
  detected_language: z.string(),
});

/** Normalized response: `action` and `follow_up` are always resolved. */
export interface AiResponse {
  action: AiAction;
  answer: string;
  follow_up: FollowUp | null;
  reason: EscalationReason;
  rule_ids: string[];
  detected_language: string;
}

/**
 * Resolve a validated raw object to a normalized AiResponse (★v1.6):
 * - `action` absent → derive from legacy `escalate` (true → escalate) / a
 *   present `follow_up` (→ ask) / else answer.
 * - `action==='ask'` but no valid `follow_up` → downgrade to 'answer' (never
 *   emit an ask the UI can't render).
 * - `follow_up` is only kept for the final 'ask' action.
 */
function normalizeResponse(raw: z.infer<typeof aiResponseSchema>): AiResponse {
  let action: AiAction =
    raw.action ?? (raw.escalate ? 'escalate' : raw.follow_up ? 'ask' : 'answer');
  // An "ask" needs a usable follow_up (≥2 options); otherwise degrade to a plain
  // answer rather than emit an ask the UI can't render.
  let followUp: FollowUp | null = raw.follow_up ?? null;
  if (followUp && followUp.options.length > MAX_OPTIONS) {
    followUp = { ...followUp, options: followUp.options.slice(0, MAX_OPTIONS) };
  }
  if (action === 'ask' && (!followUp || followUp.options.length < MIN_OPTIONS)) {
    action = 'answer';
  }
  return {
    action,
    answer: raw.answer,
    follow_up: action === 'ask' ? followUp : null,
    reason: raw.reason,
    rule_ids: raw.rule_ids,
    detected_language: raw.detected_language,
  };
}

/**
 * Extract the first balanced-looking JSON object from model text, tolerating
 * ```json code fences and surrounding prose.
 */
function extractJsonObject(text: string): string | null {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const source = fenced?.[1] ?? text;
  const start = source.indexOf('{');
  const end = source.lastIndexOf('}');
  if (start === -1 || end === -1 || end <= start) return null;
  return source.slice(start, end + 1);
}

/**
 * Parse and validate the model's JSON output (§4.2). Returns null on any
 * malformed / invalid output so the pipeline can retry then fall back.
 */
export function parseAiResponse(text: string): AiResponse | null {
  const json = extractJsonObject(text);
  if (json === null) return null;
  let obj: unknown;
  try {
    obj = JSON.parse(json);
  } catch {
    return null;
  }
  const result = aiResponseSchema.safeParse(obj);
  return result.success ? normalizeResponse(result.data) : null;
}
