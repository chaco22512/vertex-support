import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, jstTime, type AiUsage, type InboxRow } from '../lib/api';
import { ErrorState } from '../components/states';
import { useAuth } from '../lib/auth';

interface Metrics {
  today: number;
  solvedByAi: number;
  solvedPct: number;
  waiting: number;
  dueSoon: number;
}

function compute(rows: InboxRow[], nowMs: number): Metrics {
  const startOfDay = new Date(nowMs);
  startOfDay.setHours(0, 0, 0, 0);
  const todayRows = rows.filter((r) => new Date(r.created_at).getTime() >= startOfDay.getTime());
  const solvedByAi = todayRows.filter((r) => r.status === 'resolved' && r.answered_by === 'AI').length;
  const waiting = rows.filter((r) => r.status === 'escalated').length;
  const dueSoon = rows.filter(
    (r) =>
      r.status === 'escalated' &&
      r.reply_due_at &&
      new Date(r.reply_due_at).getTime() - nowMs < 4 * 3600_000,
  ).length;
  return {
    today: todayRows.length,
    solvedByAi,
    solvedPct: todayRows.length ? Math.round((solvedByAi / todayRows.length) * 100) : 0,
    waiting,
    dueSoon,
  };
}

export function Dashboard() {
  const navigate = useNavigate();
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [error, setError] = useState(false);
  // ★v1.8 §7.1: warn when the bot has no rules to use (it hands everything to staff).
  const [activeRules, setActiveRules] = useState<number | null>(null);
  const { staff } = useAuth();
  // ★v1.8 §7.1: AI requests used / left today (the free tier allows 20 a day).
  const [usage, setUsage] = useState<AiUsage | null>(null);

  const load = useCallback(async () => {
    setError(false);
    try {
      const [{ conversations }, health, ai] = await Promise.all([
        api.listConversations(),
        api.kbHealth().catch(() => null),
        api.aiUsage().catch(() => null),
      ]);
      setMetrics(compute(conversations, Date.now()));
      setActiveRules(health ? health.active_rules : null);
      setUsage(ai);
    } catch {
      setError(true);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const cards = metrics
    ? [
        { label: "Today's inquiries", value: String(metrics.today), to: '/inbox' },
        {
          label: 'Solved by AI',
          value: `${metrics.solvedByAi}`,
          sub: `${metrics.solvedPct}% of today`,
          to: '/inbox?status=resolved',
        },
        { label: 'Waiting for staff', value: String(metrics.waiting), to: '/inbox?status=escalated' },
        {
          label: 'Due within 4h',
          value: String(metrics.dueSoon),
          danger: true,
          to: '/inbox?status=escalated&due=soon',
        },
        ...(usage
          ? [
              {
                label: 'AI requests today',
                value: usage.limit > 0 ? `${usage.used_today} / ${usage.limit}` : String(usage.used_today),
                sub: usage.daily_limit_hit
                  ? `Daily limit reached · resets ${jstTime(usage.resets_at)} (JST)`
                  : usage.remaining !== null
                    ? `${usage.remaining} left · resets ${jstTime(usage.resets_at)} (JST)`
                    : `No daily cap · counter resets ${jstTime(usage.resets_at)} (JST)`,
                danger: usage.daily_limit_hit || (usage.remaining !== null && usage.remaining <= 3),
                to: staff?.role === 'admin' ? '/ai-diagnostics' : '/',
              },
            ]
          : []),
      ]
    : [];

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
      </div>
      {activeRules === 0 ? (
        <div className="state error" role="alert" style={{ padding: 'var(--sp-3) 0' }}>
          <strong>The knowledge base has no active rules</strong> — the bot is passing every question to staff.{' '}
          {staff?.role === 'admin' ? <Link to="/knowledge">Upload the CS sheet in Knowledge</Link> : 'Please tell an admin.'}
        </div>
      ) : null}
      {usage?.daily_limit_hit ? (
        <div className="state error" role="alert" style={{ padding: 'var(--sp-3) 0' }}>
          <strong>The AI has used up today's allowance</strong> — the bot is passing every question to staff until{' '}
          {jstTime(usage.resets_at)} (JST).
        </div>
      ) : null}
      {error ? (
        <ErrorState onRetry={() => void load()} />
      ) : (
        <div className="metric-grid">
          {metrics
            ? cards.map((c) => (
                <button key={c.label} className="metric-card" onClick={() => navigate(c.to)}>
                  <div className="metric-label">{c.label}</div>
                  <div className={`metric-value${c.danger ? ' danger' : ''}`}>{c.value}</div>
                  {c.sub ? <div className="metric-sub">{c.sub}</div> : null}
                </button>
              ))
            : Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="metric-card" aria-busy="true">
                  <div className="skeleton" style={{ height: 12, width: '60%' }} />
                  <div className="skeleton" style={{ height: 30, width: '40%', marginTop: 12 }} />
                </div>
              ))}
        </div>
      )}
      {usage ? (
        <p className="muted" style={{ fontSize: 12 }}>
          AI requests: an estimate from this bot's own calls. Google AI Studio has the official numbers.
        </p>
      ) : null}
    </>
  );
}
