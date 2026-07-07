import {
  fallbackEscalationMessage,
  fetchScopedRules,
  resolveKbCategories,
  runAiReply,
  type AiReplyResult,
  type HistoryMessage,
} from '@vertex/ai';
import type { Conversation } from '@vertex/shared';
import type { Deps } from '../types';
import { menu } from './menu';

/** AI response budget (§6.3, acceptance criterion 10). */
export const AI_TIMEOUT_MS = 15_000;

/**
 * Produce the AI reply for a turn: scope rules by topic_category, run the
 * pipeline with a 15s timeout, and on timeout / LLM error fall back to an
 * escalation response. The caller persists messages and applies the escalation.
 */
export async function generateAiReply(
  deps: Deps,
  conversation: Conversation,
  history: HistoryMessage[],
): Promise<AiReplyResult> {
  const categories = resolveKbCategories(conversation.topic_category, menu);
  const rules = await fetchScopedRules(deps.db, categories);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    return await runAiReply({
      rules,
      history,
      language: conversation.language,
      llm: deps.llm,
      signal: controller.signal,
    });
  } catch {
    // Timeout (abort) or LLM error → escalate rather than fail the request.
    return {
      answer: fallbackEscalationMessage(conversation.language),
      detected_language: conversation.language,
      aiMeta: { escalate: true, reason: 'other', rule_ids: [], model: deps.llm.model },
      fellBack: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
