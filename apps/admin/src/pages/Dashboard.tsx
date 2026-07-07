import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, type InboxRow } from '../lib/api';
import { ErrorState } from '../components/states';

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

  const load = useCallback(async () => {
    setError(false);
    try {
      const { conversations } = await api.listConversations();
      setMetrics(compute(conversations, Date.now()));
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
      ]
    : [];

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
      </div>
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
            : Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="metric-card" aria-busy="true">
                  <div className="skeleton" style={{ height: 12, width: '60%' }} />
                  <div className="skeleton" style={{ height: 30, width: '40%', marginTop: 12 }} />
                </div>
              ))}
        </div>
      )}
    </>
  );
}
