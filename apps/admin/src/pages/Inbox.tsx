import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api, type InboxFilters, type InboxRow } from '../lib/api';
import { languageName, topicLabel } from '../lib/categories';
import { customerLabel } from '../lib/customer';
import { formatDue } from '../lib/time';
import { isSeen } from '../lib/seen';
import { StatusBadge } from '../components/StatusBadge';
import { EmptyState, ErrorState, TableSkeleton } from '../components/states';
import { Dialog } from '../components/Dialog';

type Load = 'loading' | 'ready' | 'error';

const SHORTCUTS = [
  ['j / k', 'Move down / up'],
  ['Enter', 'Open conversation'],
  ['e', 'Resolve'],
  ['?', 'Toggle this help'],
];

export function Inbox() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  // Default view (§7.2): status=escalated, due ascending (the API orders by
  // reply_due_at asc). Deep-links from the dashboard override via URL params.
  const status = params.get('status') ?? 'escalated';
  const dueSoonOnly = params.get('due') === 'soon';
  const channel = params.get('channel') ?? '';
  const language = params.get('language') ?? '';
  const assigned = params.get('assigned') ?? '';
  const q = params.get('q') ?? '';

  const [rows, setRows] = useState<InboxRow[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [cursor, setCursor] = useState(0);
  const [showHelp, setShowHelp] = useState(false);
  const [search, setSearch] = useState(q);
  const nowMs = useMemo(() => Date.now(), [rows]);

  const setParam = useCallback(
    (key: string, value: string) => {
      const next = new URLSearchParams(params);
      if (value) next.set(key, value);
      else next.delete(key);
      setParams(next, { replace: true });
    },
    [params, setParams],
  );

  const fetchRows = useCallback(async () => {
    setLoad('loading');
    const filters: InboxFilters = {};
    if (status) filters.status = status;
    if (channel) filters.channel = channel;
    if (language) filters.language = language;
    if (assigned) filters.assigned = assigned;
    if (q) filters.q = q;
    try {
      const { conversations } = await api.listConversations(filters);
      const filtered = dueSoonOnly
        ? conversations.filter(
            (r) => r.reply_due_at && new Date(r.reply_due_at).getTime() - Date.now() < 4 * 3600_000,
          )
        : conversations;
      setRows(filtered);
      setCursor(0);
      setLoad('ready');
    } catch {
      setLoad('error');
    }
  }, [status, channel, language, assigned, q, dueSoonOnly]);

  useEffect(() => {
    void fetchRows();
  }, [fetchRows]);

  const rowRefs = useRef<(HTMLTableRowElement | null)[]>([]);

  const resolveRow = useCallback(
    async (row: InboxRow) => {
      await api.patchConversation(row.id, { status: 'resolved' });
      await fetchRows();
    },
    [fetchRows],
  );

  // Keyboard navigation (§7.2, §5.6): j/k move, Enter open, e resolve, ? help.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (e.key === '?') {
        setShowHelp((v) => !v);
        return;
      }
      if (load !== 'ready' || rows.length === 0) return;
      if (e.key === 'j') {
        setCursor((c) => Math.min(c + 1, rows.length - 1));
      } else if (e.key === 'k') {
        setCursor((c) => Math.max(c - 1, 0));
      } else if (e.key === 'Enter') {
        const row = rows[cursor];
        if (row) navigate(`/inbox/${row.id}`);
      } else if (e.key === 'e') {
        const row = rows[cursor];
        if (row) void resolveRow(row);
      }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [rows, cursor, load, navigate, resolveRow]);

  useEffect(() => {
    rowRefs.current[cursor]?.scrollIntoView({ block: 'nearest' });
  }, [cursor]);

  return (
    <>
      <div className="page-head">
        <h1>Inbox</h1>
        <button className="btn btn-sm btn-ghost" onClick={() => setShowHelp(true)}>
          Keyboard shortcuts (?)
        </button>
      </div>

      <div className="filters">
        <div className="field grow">
          <label htmlFor="q">Search customer messages</label>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setParam('q', search.trim());
            }}
          >
            <input
              id="q"
              type="search"
              placeholder="Search…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ width: '100%' }}
            />
          </form>
        </div>
        <div className="field">
          <label htmlFor="f-status">Status</label>
          <select id="f-status" value={status} onChange={(e) => setParam('status', e.target.value)}>
            <option value="">All</option>
            <option value="escalated">Escalated</option>
            <option value="staff_replied">Staff replied</option>
            <option value="resolved">Resolved</option>
            <option value="ai_handling">AI handling</option>
            <option value="closed">Closed</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-channel">Channel</label>
          <select id="f-channel" value={channel} onChange={(e) => setParam('channel', e.target.value)}>
            <option value="">All</option>
            <option value="webchat">Webchat</option>
            <option value="whatsapp">WhatsApp</option>
            <option value="line">LINE</option>
            <option value="messenger">Messenger</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-lang">Language</label>
          <select id="f-lang" value={language} onChange={(e) => setParam('language', e.target.value)}>
            <option value="">All</option>
            <option value="en">English</option>
            <option value="id">Indonesian</option>
            <option value="tl">Tagalog</option>
            <option value="ne">Nepali</option>
            <option value="vi">Vietnamese</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="f-assigned">Assignment</label>
          <select id="f-assigned" value={assigned} onChange={(e) => setParam('assigned', e.target.value)}>
            <option value="">Anyone</option>
            <option value="me">Assigned to me</option>
          </select>
        </div>
      </div>

      {load === 'loading' ? (
        <TableSkeleton cols={8} />
      ) : load === 'error' ? (
        <ErrorState onRetry={() => void fetchRows()} />
      ) : rows.length === 0 ? (
        <EmptyState title="All caught up — no inquiries waiting." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Source</th>
                <th>Customer</th>
                <th>Category</th>
                <th>Question</th>
                <th>Lang</th>
                <th>Answered by</th>
                <th>Status</th>
                <th>Due</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => {
                const due = formatDue(r.reply_due_at, nowMs);
                const unread = r.status === 'escalated' && !isSeen(r.id);
                return (
                  <tr
                    key={r.id}
                    ref={(el) => (rowRefs.current[i] = el)}
                    className={`${i === cursor ? 'selected' : ''}${unread ? ' unread' : ''}`}
                    onClick={() => navigate(`/inbox/${r.id}`)}
                    onMouseEnter={() => setCursor(i)}
                  >
                    <td>
                      {r.channel}
                      {r.source_tag ? <span className="muted"> · {r.source_tag}</span> : null}
                    </td>
                    <td>{customerLabel(r)}</td>
                    <td>{topicLabel(r.topic_category)}</td>
                    <td>{r.question || <span className="muted">—</span>}</td>
                    <td title={languageName(r.language)}>{r.language.toUpperCase()}</td>
                    <td>
                      {r.answered_by === 'AI' ? <span className="ai-dot" aria-hidden="true" /> : null}
                      {r.answered_by}
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                    </td>
                    <td className={due.soon ? 'due-soon' : ''}>{due.text}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showHelp ? (
        <Dialog title="Keyboard shortcuts" onClose={() => setShowHelp(false)}>
          <table className="data">
            <tbody>
              {SHORTCUTS.map(([k, d]) => (
                <tr key={k} style={{ cursor: 'default' }}>
                  <td style={{ width: 90 }}>
                    <kbd>{k}</kbd>
                  </td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Dialog>
      ) : null}
    </>
  );
}
