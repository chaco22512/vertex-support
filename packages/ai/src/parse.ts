import { z } from 'zod';
import type { EscalationReason } from '@vertex/shared';

export const ESCALATION_REASONS = [
  'none',
  'price_question',
  'not_in_manual',
  'account_specific',
  'complaint',
  'other',
] as const satisfies readonly EscalationReason[];

export const aiResponseSchema = z.object({
  answer: z.string(),
  escalate: z.boolean(),
  reason: z.enum(ESCALATION_REASONS),
  rule_ids: z.array(z.string()),
  detected_language: z.string(),
});

export type AiResponse = z.infer<typeof aiResponseSchema>;

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
  return result.success ? result.data : null;
}
