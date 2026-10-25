import type { AiDiag, FallbackResult } from '@vertex/shared';

/** Plain-English outcome labels for CS (spec v1.8 §7.3 / §7.9). */
export const FALLBACK_LABELS: Record<FallbackResult, string> = {
  answered: 'Found in full manual — answered',
  not_found: 'Not in manual (full manual searched)',
  policy_escalation: 'Escalated by policy after search',
  no_candidates: 'No matching rules in the manual',
  rate_limited: 'AI rate limit (429) during search',
  timeout: 'Search timed out',
  skipped_no_time: 'Search skipped — out of time',
  scope_was_all: 'Topic already covered the whole manual',
  error: 'Error during search',
};

export const ERROR_LABELS: Record<NonNullable<AiDiag['error']>, string> = {
  rate_limited: 'AI rate limit (429)',
  timeout: 'AI timed out',
  llm_error: 'AI service error',
  parse_failed: 'AI reply unreadable',
  rule_fetch_failed: 'Could not load rules',
  no_active_rules: 'No active rules — all passed to staff',
};

/** One-line outcome for a diagnosed AI turn. */
export function diagOutcome(d: AiDiag): string {
  if (d.error) return ERROR_LABELS[d.error];
  if (d.fallback_result) return FALLBACK_LABELS[d.fallback_result];
  return 'No search (policy escalation)';
}

/**
 * Why the AI escalated / what the fallback search did (★v1.8). Collapsed by
 * default under an AI message in the conversation detail.
 */
export function AiDiagPanel({ diag, reason }: { diag: AiDiag; reason?: string }) {
  return (
    <details className="diag">
      <summary>AI diagnostics: {diagOutcome(diag)}</summary>
      <dl>
        {reason ? (
          <>
            <dt>Reason</dt>
            <dd>{reason}</dd>
          </>
        ) : null}
        <dt>Topic</dt>
        <dd>
          {diag.topic || '—'}
          {diag.topic_guess && diag.topic_guess !== diag.topic ? ` → guessed ${diag.topic_guess}` : ''}
        </dd>
        <dt>Rules in topic</dt>
        <dd>{diag.scoped_rule_count}</dd>
        <dt>First try</dt>
        <dd>{diag.primary_reason ?? '—'}</dd>
        <dt>Full-manual search</dt>
        <dd>
          {diag.fallback_tried ? (diag.fallback_result ? FALLBACK_LABELS[diag.fallback_result] : 'tried') : 'not needed'}
          {diag.candidate_count ? ` (${diag.candidate_count} candidate rules)` : ''}
        </dd>
        {diag.keywords.length ? (
          <>
            <dt>Keywords</dt>
            <dd>{diag.keywords.join(', ')}</dd>
          </>
        ) : null}
        <dt>Time</dt>
        <dd>
          {(diag.timings.total_ms / 1000).toFixed(1)}s
          {diag.timings.primary_ms !== null ? ` (first ${(diag.timings.primary_ms / 1000).toFixed(1)}s` : ''}
          {diag.timings.fallback_ms !== null ? `, search ${(diag.timings.fallback_ms / 1000).toFixed(1)}s` : ''}
          {diag.timings.primary_ms !== null ? ')' : ''}
        </dd>
      </dl>
    </details>
  );
}
