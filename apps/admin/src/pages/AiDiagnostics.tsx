import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import type { FallbackResult } from '@vertex/shared';
import { api, type DiagnosticRow } from '../lib/api';
import { formatTime } from '../lib/time';
import { EmptyState, ErrorState, TableSkeleton } from '../components/states';
import { diagOutcome, ERROR_LABELS, FALLBACK_LABELS } from '../components/AiDiagPanel';

type Load = 'loading' | 'ready' | 'error';

/** Rules handed to the full-manual search (spec v1.8 §4.1.1, FALLBACK_TOP_K). */
const TOP_K = 150;

function summaryLabel(key: string): string {
  if (key.startsWith('error:')) return ERROR_LABELS[key.slice(6) as keyof typeof ERROR_LABELS] ?? key;
  if (key === 'no_fallback') return 'No search (policy escalation)';
  return FALLBACK_LABELS[key as FallbackResult] ?? key;
}

/**
 * AI diagnostics (★v1.8 §7.9, admin only): every AI turn that escalated or ran
 * the full-manual search, newest first. Lets CS see why the bot escalated and
 * check — with the "correct rule" box — whether the right rule was within the
 * top 150 search results, to validate that threshold on real questions.
 */
export function AiDiagnostics() {
  const [rows, setRows] = useState<DiagnosticRow[]>([]);
  const [summary, setSummary] = useState<Record<string, number>>({});
  const [windowSize, setWindowSize] = useState(0);
  const [filter, setFilter] = useState('');
  const [open, setOpen] = useState<number | null>(null);
  const [load, setLoad] = useState<Load>('loading');

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    try {
      const res = await api.listAiDiagnostics(filter || undefined);
      setRows(res.rows);
      setSummary(res.summary);
      setWindowSize(res.window);
      setLoad('ready');
    } catch {
      setLoad('error');
    }
  }, [filter]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  return (
    <>
      <div className="page-head">
        <h1>AI diagnostics</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        AI replies that were passed to staff or needed a search of the full manual (latest {windowSize}).
        Open a row to see which rules the search found.
      </p>

      <div className="summary-chips">
        <button className={`chip${filter === '' ? ' active' : ''}`} onClick={() => setFilter('')}>
          All ({windowSize})
        </button>
        {Object.entries(summary)
          .sort((a, b) => b[1] - a[1])
          .map(([key, n]) => {
            const value = key.startsWith('error:') ? 'error' : key === 'no_fallback' ? '' : key;
            return (
              <button
                key={key}
                className={`chip${filter && filter === value ? ' active' : ''}`}
                onClick={() => setFilter(value)}
                disabled={key === 'no_fallback'}
              >
                {summaryLabel(key)} ({n})
              </button>
            );
          })}
      </div>

      {load === 'loading' ? (
        <TableSkeleton cols={5} />
      ) : load === 'error' ? (
        <ErrorState onRetry={() => void fetchRows()} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing to show yet." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Customer question</th>
                <th>Topic</th>
                <th>Outcome</th>
                <th>Time</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <DiagRow
                  key={r.message_id}
                  row={r}
                  open={open === r.message_id}
                  onToggle={() => setOpen(open === r.message_id ? null : r.message_id)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function DiagRow({ row, open, onToggle }: { row: DiagnosticRow; open: boolean; onToggle: () => void }) {
  const d = row.diag;
  return (
    <>
      <tr onClick={onToggle}>
        <td>{formatTime(row.created_at)}</td>
        <td>
          {row.question.slice(0, 80)}
          {row.question.length > 80 ? '…' : ''}
        </td>
        <td>
          {d.topic || '—'}
          {d.topic_guess && d.topic_guess !== d.topic ? ` → ${d.topic_guess}` : ''}
        </td>
        <td>
          <span className={`badge status-${row.action === 'escalate' ? 'escalated' : 'resolved'}`}>
            {row.action === 'escalate' ? 'Passed to staff' : 'Answered'}
          </span>{' '}
          {diagOutcome(d)}
        </td>
        <td>{(d.timings.total_ms / 1000).toFixed(1)}s</td>
      </tr>
      {open ? (
        <tr style={{ cursor: 'default' }}>
          <td colSpan={5}>
            <div>
              <Link to={`/inbox/${row.conversation_id}`}>Open conversation</Link>
              {' · '}reason: {row.reason} · rules in topic: {d.scoped_rule_count}
              {d.keywords.length ? ` · keywords: ${d.keywords.join(', ')}` : ''}
            </div>
            {d.candidate_ids.length ? (
              <>
                <div className="muted" style={{ marginTop: 'var(--sp-2)' }}>
                  Search results ({d.candidate_ids.length}, best first): {d.candidate_ids.slice(0, 20).join(', ')}
                  {d.candidate_ids.length > 20 ? ', …' : ''}
                </div>
                <RankCheck candidates={d.candidate_ids} />
              </>
            ) : null}
          </td>
        </tr>
      ) : null}
    </>
  );
}

/** "Which rule SHOULD have answered this?" → its rank in the search, or outside the top 150. */
function RankCheck({ candidates }: { candidates: string[] }) {
  const [ruleId, setRuleId] = useState('');
  const id = ruleId.trim().toUpperCase();
  const rank = id ? candidates.indexOf(id) + 1 : 0;
  return (
    <div className="rank-check">
      <label htmlFor="rank-rule">Correct rule ID:</label>
      <input
        id="rank-rule"
        type="text"
        style={{ width: 120 }}
        placeholder="e.g. R508"
        value={ruleId}
        onChange={(e) => setRuleId(e.target.value)}
        onClick={(e) => e.stopPropagation()}
      />
      {id ? (
        <span>{rank > 0 ? `found at rank ${rank} of ${candidates.length}` : `not in the top ${TOP_K} search results`}</span>
      ) : null}
    </div>
  );
}
