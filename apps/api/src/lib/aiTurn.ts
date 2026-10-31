import {
  buildRetrievalQuery,
  fallbackEscalationMessage,
  fetchScopedRules,
  GeminiError,
  rankRules,
  resolveIdPrefixes,
  resolveKbCategories,
  resolveTopicLabel,
  runAiReply,
  type AiReplyResult,
  type HistoryMessage,
} from '@vertex/ai';
import type { AiDiag, AiErrorKind, Conversation, FallbackResult, KbRule } from '@vertex/shared';
import type { Deps } from '../types';
import { menu } from './menu';
import { behaviourFor, loadPublishedBehaviour, type BehaviourContent } from './aiBehaviour';

/**
 * Server-side budget for a whole AI turn (spec v1.8 §4.1.1). The chat client
 * gives up at 15s (§6.3, acceptance criterion 10), so the server must finish —
 * including the DB writes after this returns — well inside that.
 */
export const AI_BUDGET_MS = 13_500;
/** The scoped (first) LLM call is cut off here; measured 2–5.3s (§13). */
export const PRIMARY_TIMEOUT_MS = 8_000;
/** The retrieval fallback only starts if at most this much time has elapsed. */
export const FALLBACK_START_LIMIT_MS = 7_500;
/** @deprecated v1.8 — kept for callers that still reference the old name. */
export const AI_TIMEOUT_MS = AI_BUDGET_MS;

/** Topics the model may assign a question to (★v1.8). 'plans' is handled client-side. */
const TOPICS = menu.categories
  .filter((c) => c.id !== 'plans')
  .map((c) => ({ id: c.id, label: c.label_en ?? c.id }));
const TOPIC_IDS = new Set(TOPICS.map((t) => t.id));

export interface AiTurnResult extends AiReplyResult {
  /** New topic_category when the latest question moved to another topic (★v1.8). */
  topicSwitch: string | null;
}

/** Map an LLM failure to the kind recorded in ai_meta.diag (★v1.8, never silent). */
function errorKind(err: unknown, signal: AbortSignal): AiErrorKind {
  if (err instanceof GeminiError && err.status === 429) return 'rate_limited';
  if (signal.aborted) return 'timeout';
  return 'llm_error';
}

/** An AbortSignal that fires after `ms` (never negative). Call clear() when done. */
function deadline(ms: number): { signal: AbortSignal; clear: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(0, ms));
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

/** Fallback-escalation reply used when no model output is usable. */
function cannedEscalation(deps: Deps, conversation: Conversation): AiReplyResult {
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
    searchKeywords: [],
  };
}

/**
 * Produce the AI reply for a turn (spec v1.8 §4.1.1):
 * 1. Scoped attempt — rules of conversation.topic_category, ≤ PRIMARY_TIMEOUT_MS.
 * 2. If it reports not_in_manual, retry ONCE with the top-K keyword matches
 *    from the whole manual (fetched in parallel with step 1) before escalating.
 * 3. Record why in ai_meta.diag whenever the turn escalates or the fallback ran
 *    — including 429 / timeout / no candidates. Never throws: every failure
 *    degrades to an escalation the caller can persist.
 * Also reports a topic switch when the model labels the latest question with a
 * different menu topic, so the caller can re-scope the conversation.
 */
export async function generateAiReply(
  deps: Deps,
  conversation: Conversation,
  history: HistoryMessage[],
): Promise<AiTurnResult> {
  const t0 = Date.now();
  const elapsed = () => Date.now() - t0;
  const currentTopic = conversation.topic_category ?? '';
  const categories = resolveKbCategories(currentTopic, menu);
  const topic = resolveTopicLabel(currentTopic, menu);
  const pendingCase = conversation.status === 'escalated' || conversation.status === 'staff_replied';
  const lastCustomer = [...history].reverse().find((m) => m.sender === 'customer')?.body ?? '';

  const diag: AiDiag = {
    topic: currentTopic,
    topic_guess: null,
    scoped_rule_count: 0,
    primary_reason: null,
    fallback_tried: false,
    fallback_result: null,
    candidate_count: 0,
    candidate_ids: [],
    top_scores: [],
    keywords: [],
    error: null,
    timings: { primary_ms: null, retrieve_ms: null, fallback_ms: null, total_ms: 0 },
  };

  // Whole-manual fetch for the fallback starts now, overlapping the primary
  // LLM call, so a fallback does not pay the ~0.5–2s fetch on the critical path.
  const allRulesPromise: Promise<KbRule[] | null> | null =
    categories === null
      ? null
      : fetchScopedRules(deps.db, null).catch(() => null);
  // ★v1.8 Phase 2: the CS-published behaviour (②/③), read alongside the rules.
  const behaviourPromise = loadPublishedBehaviour(deps.db);
  let published: BehaviourContent | null = null;

  const run = (rules: KbRule[], label: string | null, topicId: string | null, signal: AbortSignal) =>
    runAiReply({
      rules,
      history,
      language: conversation.language,
      topic: label,
      topics: TOPICS,
      pendingCase,
      behaviour: behaviourFor(published, topicId),
      llm: deps.llm,
      signal,
    });

  // --- 1. scoped attempt ---------------------------------------------------
  let result: AiReplyResult;
  let scopedRules: KbRule[];
  try {
    [scopedRules, published] = await Promise.all([
      fetchScopedRules(deps.db, categories, resolveIdPrefixes(currentTopic, menu)),
      behaviourPromise,
    ]);
  } catch {
    diag.error = 'rule_fetch_failed';
    return finish(cannedEscalation(deps, conversation));
  }
  diag.scoped_rule_count = scopedRules.length;
  // v1.8 §4.1.0: per-topic count of rules actually handed to the AI (no PII).
  console.info(
    `[ai] rules conversation=${conversation.id} topic=${currentTopic || 'none'} ` +
      `scope=${categories === null ? 'all' : `${categories.length} categories`} count=${scopedRules.length}`,
  );

  if (scopedRules.length === 0) {
    // ★v1.8 §4.1.0: with no usable knowledge at all, never let the model guess —
    // escalate without calling it. If only this topic is empty, skip straight
    // to the whole-manual search below.
    const all = allRulesPromise ? await allRulesPromise : [];
    if (!all || all.length === 0) {
      diag.error = 'no_active_rules';
      return finish(cannedEscalation(deps, conversation));
    }
    const canned = cannedEscalation(deps, conversation);
    result = { ...canned, fellBack: false, aiMeta: { ...canned.aiMeta, reason: 'not_in_manual' } };
    diag.timings.primary_ms = 0;
  } else {
    const primary = deadline(Math.min(PRIMARY_TIMEOUT_MS, AI_BUDGET_MS - elapsed()));
    const tPrimary = Date.now();
    try {
      result = await run(scopedRules, topic, currentTopic || null, primary.signal);
      if (result.fellBack) diag.error = 'parse_failed';
    } catch (err) {
      diag.error = errorKind(err, primary.signal);
      return finish(cannedEscalation(deps, conversation));
    } finally {
      primary.clear();
      diag.timings.primary_ms = Date.now() - tPrimary;
    }
  }
  diag.primary_reason = result.aiMeta.reason;
  diag.topic_guess = validTopic(result.aiMeta.topic);

  const needsFallback =
    !result.fellBack && result.aiMeta.action === 'escalate' && result.aiMeta.reason === 'not_in_manual';
  if (!needsFallback) return finish(result);

  // --- 2. retrieval fallback before a not_in_manual escalation -------------
  diag.fallback_tried = true;
  if (allRulesPromise === null) return finish(result, 'scope_was_all');
  if (elapsed() > FALLBACK_START_LIMIT_MS) return finish(result, 'skipped_no_time');

  const tRetrieve = Date.now();
  const allRules = await allRulesPromise;
  if (allRules === null) {
    diag.timings.retrieve_ms = Date.now() - tRetrieve;
    return finish(result, 'error');
  }
  diag.keywords = buildRetrievalQuery(lastCustomer, result.searchKeywords);
  const guessScope = diag.topic_guess ? resolveKbCategories(diag.topic_guess, menu) : null;
  const ranked = rankRules(allRules, diag.keywords, {
    boostCategories: guessScope,
    boostIdPrefixes: diag.topic_guess ? resolveIdPrefixes(diag.topic_guess, menu) : [],
  });
  diag.timings.retrieve_ms = Date.now() - tRetrieve;
  diag.candidate_count = ranked.length;
  diag.candidate_ids = ranked.map((r) => r.rule.id);
  diag.top_scores = ranked.slice(0, 10).map((r) => r.score);
  if (ranked.length === 0) return finish(result, 'no_candidates');

  const fallback = deadline(AI_BUDGET_MS - elapsed());
  const tFallback = Date.now();
  let retry: AiReplyResult;
  try {
    const guessLabel = diag.topic_guess ? resolveTopicLabel(diag.topic_guess, menu) : topic;
    retry = await run(
      ranked.map((r) => r.rule),
      guessLabel,
      diag.topic_guess ?? (currentTopic || null),
      fallback.signal,
    );
  } catch (err) {
    const kind = errorKind(err, fallback.signal);
    return finish(result, kind === 'rate_limited' || kind === 'timeout' ? kind : 'error');
  } finally {
    fallback.clear();
    diag.timings.fallback_ms = Date.now() - tFallback;
  }
  if (retry.fellBack) return finish(result, 'error');

  diag.topic_guess = validTopic(retry.aiMeta.topic) ?? diag.topic_guess;
  if (retry.aiMeta.action !== 'escalate') return finish(retry, 'answered');
  return finish(retry, retry.aiMeta.reason === 'not_in_manual' ? 'not_found' : 'policy_escalation');

  /** Attach diagnostics (escalations + fallback turns) and the topic switch. */
  function finish(r: AiReplyResult, fallbackResult?: FallbackResult): AiTurnResult {
    if (fallbackResult) diag.fallback_result = fallbackResult;
    diag.timings.total_ms = elapsed();
    const escalated = r.aiMeta.action === 'escalate';
    const aiMeta = escalated || diag.fallback_tried || diag.error ? { ...r.aiMeta, diag } : r.aiMeta;
    if (escalated || diag.fallback_tried) {
      console.info(
        `[ai] diag conversation=${conversation.id} action=${r.aiMeta.action} reason=${r.aiMeta.reason} ` +
          `topic=${diag.topic || 'none'} guess=${diag.topic_guess ?? '-'} scoped=${diag.scoped_rule_count} ` +
          `fallback=${diag.fallback_result ?? '-'} candidates=${diag.candidate_count} error=${diag.error ?? '-'} ` +
          `ms=${diag.timings.total_ms}`,
      );
    }
    const guess = diag.topic_guess;
    const topicSwitch = guess && guess !== currentTopic && guess !== 'others' ? guess : null;
    return { ...r, aiMeta, topicSwitch };
  }
}

/** A model-supplied topic id, kept only if it is a real menu topic. */
function validTopic(id: string | null | undefined): string | null {
  return id && TOPIC_IDS.has(id) ? id : null;
}
