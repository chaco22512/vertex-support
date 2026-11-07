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
  const solvedByAi = todayRows.filter(
    (r) => r.status === 'resolved' && r.answered_by === 'AI',
  ).length;
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

  // ★2026-11-07: the per-minute figure goes stale fast — refresh it every 30 s.
  useEffect(() => {
    const t = setInterval(() => {
      void api
        .aiUsage()
        .then(setUsage)
        .catch(() => {});
    }, 30_000);
    return () => clearInterval(t);
  }, []);

  const cards = metrics
    ? [
        { label: "Today's inquiries", value: String(metrics.today), to: '/inbox' },
        {
          label: 'Solved by AI',
          value: `${metrics.solvedByAi}`,
          sub: `${metrics.solvedPct}% of today`,
          to: '/inbox?status=resolved',
        },
        {
          label: 'Waiting for staff',
          value: String(metrics.waiting),
          to: '/inbox?status=escalated',
        },
        {
          label: 'Due within 4h',
          value: String(metrics.dueSoon),
          danger: true,
          to: '/inbox?status=escalated&due=soon',
        },
        ...(usage
          ? [
              {
                label: 'AI requests (whole company)',
                value:
                  usage.limit > 0
                    ? `${usage.used_today} / ${usage.limit}`
                    : String(usage.used_today),
                sub: usage.daily_limit_hit
                  ? `Google's daily limit reached · resets ${jstTime(usage.resets_at)}`
                  : usage.remaining !== null
                    ? `${usage.remaining} left · resets ${jstTime(usage.resets_at)}`
                    : `No daily cap · counter resets ${jstTime(usage.resets_at)}`,
                danger: usage.daily_limit_hit || (usage.remaining !== null && usage.remaining <= 3),
                to: staff?.role === 'admin' ? '/ai-diagnostics' : '/',
              },
            ]
          : []),
        ...(usage?.minute
          ? [
              {
                label: 'AI requests this minute',
                value:
                  usage.minute.limit > 0
                    ? `${usage.minute.used} / ${usage.minute.limit}`
                    : String(usage.minute.used),
                sub: usage.minute.limited
                  ? 'Per-minute limit hit — wait a minute'
                  : usage.minute.limit > 0
                    ? `Limit ${usage.minute.limit} a minute (whole company)`
                    : 'No per-minute cap',
                danger:
                  usage.minute.limited ||
                  (usage.minute.limit > 0 && usage.minute.used >= usage.minute.limit),
                warn: usage.minute.limit > 0 && usage.minute.used >= usage.minute.limit - 1,
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
          <strong>The knowledge base has no active rules</strong> — the bot is passing every
          question to staff.{' '}
          {staff?.role === 'admin' ? (
            <Link to="/knowledge">Upload the CS sheet in Knowledge</Link>
          ) : (
            'Please tell an admin.'
          )}
        </div>
      ) : null}
      {usage?.daily_limit_hit ? (
        <div className="state error" role="alert" style={{ padding: 'var(--sp-3) 0' }}>
          <strong>Google&apos;s daily AI limit is used up</strong> (free plan: {usage.limit || 20}{' '}
          requests a day, shared by every customer chat and every staff test). Until{' '}
          {jstTime(usage.resets_at)}, customers who ask a question are told “We&apos;re receiving a
          lot of questions right now, so a member of our support team will help you directly” and
          are passed to staff with their contact details.
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
                  <div
                    className={`metric-value${c.danger ? ' danger' : 'warn' in c && c.warn ? ' warn' : ''}`}
                  >
                    {c.value}
                  </div>
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
      {usage?.last_hour && usage.minute ? (
        <AiMinuteChart hour={usage.last_hour} limit={usage.minute.limit} />
      ) : null}
      {usage ? (
        <p className="muted" style={{ fontSize: 12 }}>
          AI requests: Google&apos;s free plan allows {usage.limit || 20} a day for the whole
          company — every customer chat, Translate, AI draft, Try it and safety test counts, and one
          question can use 1–3 requests. It also allows only {usage.minute?.limit || 5} requests a
          minute; above that, customers are passed to staff. Google&apos;s day runs from 17:00 to
          17:00 Japan time (16:00 in summer), not midnight. This number is an estimate from the
          bot&apos;s own calls; Google AI Studio has the official figure.
        </p>
      ) : null}
    </>
  );
}

/**
 * ★2026-11-07: AI requests per minute over the last hour (one series, no
 * legend). Minutes where Google refused a request are drawn in the danger
 * color and say so in the tooltip; the dashed line is the per-minute limit.
 */
export function AiMinuteChart({
  hour,
  limit,
}: {
  hour: NonNullable<AiUsage['last_hour']>;
  limit: number;
}) {
  const W = 600;
  const H = 96;
  const top = 14;
  const max = Math.max(limit, ...hour.map((m) => m.calls), 1);
  const y = (v: number) => top + (H - top) * (1 - v / max);
  const slot = W / hour.length;
  const bar = Math.max(2, slot - 2);
  const total = hour.reduce((n, m) => n + m.calls, 0);
  const limitedMinutes = hour.filter((m) => m.limited).length;
  const clock = (iso: string) =>
    new Date(iso).toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'Asia/Tokyo',
    });
  if (hour.length === 0) return null;
  return (
    <figure className="minute-chart">
      <figcaption>
        <strong>AI requests per minute — last hour</strong>{' '}
        <span className="muted">
          {total} request{total === 1 ? '' : 's'}
          {limitedMinutes
            ? ` · limit hit in ${limitedMinutes} minute${limitedMinutes === 1 ? '' : 's'}`
            : ''}
        </span>
      </figcaption>
      <svg
        viewBox={`0 0 ${W} ${H + 16}`}
        role="img"
        aria-label={`${total} AI requests in the last hour; per-minute limit ${limit || 'none'}`}
      >
        <line x1={0} x2={W} y1={H} y2={H} className="minute-axis" />
        {limit > 0 ? (
          <>
            <line x1={0} x2={W} y1={y(limit)} y2={y(limit)} className="minute-limit" />
            <text x={W} y={y(limit) - 3} textAnchor="end" className="minute-text">
              limit {limit}/min
            </text>
          </>
        ) : null}
        {hour.map((m, i) => (
          <g key={m.minute}>
            {m.calls > 0 ? (
              <rect
                x={i * slot + 1}
                y={y(m.calls)}
                width={bar}
                height={H - y(m.calls)}
                rx={Math.min(2, bar / 2)}
                className={m.limited ? 'minute-bar limited' : 'minute-bar'}
              />
            ) : m.limited ? (
              <rect
                x={i * slot + 1}
                y={H - 3}
                width={bar}
                height={3}
                className="minute-bar limited"
              />
            ) : null}
            <rect x={i * slot} y={0} width={slot} height={H} className="minute-hit">
              <title>
                {`${clock(m.minute)} JST — ${m.calls} request${m.calls === 1 ? '' : 's'}${m.limited ? ' · Google refused a request (limit hit)' : ''}`}
              </title>
            </rect>
          </g>
        ))}
        <text x={0} y={H + 13} className="minute-text">
          {clock(hour[0]!.minute)}
        </text>
        <text x={W} y={H + 13} textAnchor="end" className="minute-text">
          now
        </text>
      </svg>
    </figure>
  );
}
