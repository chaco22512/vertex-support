import {
  fallbackEscalationMessage,
  fetchScopedRules,
  resolveKbCategories,
  resolveTopicLabel,
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
  const topic = resolveTopicLabel(conversation.topic_category, menu);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
  try {
    // The rule fetch is inside the try so a transient DB error degrades to the
    // same graceful escalation as a timeout / LLM error — never a 500 after the
    // customer message has already been persisted (which would strand the turn
    // and make retries pile up duplicate customer bubbles).
    const rules = await fetchScopedRules(deps.db, categories);
    return await runAiReply({
      rules,
      history,
      language: conversation.language,
      topic,
      llm: deps.llm,
      signal: controller.signal,
    });
  } catch {
    // Rule-fetch failure, timeout (abort), or LLM error → escalate rather than
    // fail the request.
    return {
      answer: fallbackEscalationMessage(conversation.language),
      detected_language: conversation.language,
      aiMeta: {
        action: 'escalate',
        escalate: true,
        reason: 'other',
        rule_ids: [],
        follow_up: null,
        model: deps.llm.model,
      },
      fellBack: true,
    };
  } finally {
    clearTimeout(timer);
  }
}
