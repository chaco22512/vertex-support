import type { AiMeta, KbRule } from '@vertex/shared';
import type { LlmClient } from './llm';
import { buildLlmMessages, buildSystemPrompt, type HistoryMessage } from './prompt';
import { parseAiResponse, type AiResponse } from './parse';
import { fallbackEscalationMessage } from './locales';

export interface RunAiReplyInput {
  /** Scoped rules from fetchScopedRules (already active + customer only). */
  rules: KbRule[];
  /** Conversation history, chronological, capped to the last 20 by the caller (§4.1). */
  history: HistoryMessage[];
  /** Conversation language, used for the fallback message if parsing fails. */
  language: string;
  llm: LlmClient;
}

export interface AiReplyResult {
  answer: string;
  detected_language: string;
  /** Persisted to messages.ai_meta by the API (§4.3). */
  aiMeta: AiMeta;
  /** True when the pipeline fell back to escalation after unparseable output. */
  fellBack: boolean;
}

const MAX_ATTEMPTS = 2; // initial try + one retry (§4.2)

/**
 * Run the AI reply pipeline (§4.1–4.3): build prompt from scoped rules and
 * PII-masked history, call the LLM, parse JSON. On parse failure retry once,
 * then fall back to an escalation response.
 */
export async function runAiReply(input: RunAiReplyInput): Promise<AiReplyResult> {
  const system = buildSystemPrompt(input.rules);
  const messages = buildLlmMessages(input.history);

  let parsed: AiResponse | null = null;
  for (let attempt = 0; attempt < MAX_ATTEMPTS && parsed === null; attempt++) {
    const raw = await input.llm.generate({ system, messages });
    parsed = parseAiResponse(raw);
  }

  if (parsed === null) {
    return {
      answer: fallbackEscalationMessage(input.language),
      detected_language: input.language,
      aiMeta: {
        escalate: true,
        reason: 'other',
        rule_ids: [],
        model: input.llm.model,
      },
      fellBack: true,
    };
  }

  return {
    answer: parsed.answer,
    detected_language: parsed.detected_language,
    aiMeta: {
      escalate: parsed.escalate,
      reason: parsed.reason,
      rule_ids: parsed.rule_ids,
      model: input.llm.model,
    },
    fellBack: false,
  };
}
