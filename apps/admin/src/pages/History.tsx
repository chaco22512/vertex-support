import { useCallback, useEffect, useState } from 'react';
import type { KbChangeLog } from '@vertex/shared';
import { api, type TileChange } from '../lib/api';
import { formatTime } from '../lib/time';
import { topicLabel } from '../lib/categories';
import { EmptyState, ErrorState, TableSkeleton } from '../components/states';

type Load = 'loading' | 'ready' | 'error';

function fees(record: Record<string, unknown> | undefined): number[] {
  const v = record?.fee_amounts_jpy;
  return Array.isArray(v) ? (v as number[]) : [];
}

/** Highlight fee changes before→after (§7.7): struck-out old, emphasised new. */
function FeeDiff({ before, after }: { before: number[]; after: number[] }) {
  const same = before.length === after.length && before.every((v, i) => v === after[i]);
  if (same) {
    return <span className="muted">{after.length ? after.map((n) => `¥${n.toLocaleString()}`).join(', ') : '—'}</span>;
  }
  return (
    <span>
      {before.length ? <span className="diff-old">{before.map((n) => `¥${n.toLocaleString()}`).join(', ')}</span> : null}
      {before.length ? ' → ' : ''}
      <span className="diff-new">{after.length ? after.map((n) => `¥${n.toLocaleString()}`).join(', ') : '(none)'}</span>
    </span>
  );
}

const TILE_ACTIONS: Record<string, string> = {
  create: 'Added',
  update: 'Edited',
  enable: 'Shown again',
  disable: 'Hidden',
  reorder: 'Order changed',
  link_codes: 'Knowledge codes changed',
};

/** What changed in a tile, in plain words. */
function tileChangeSummary(e: TileChange): string {
  if (e.action === 'reorder') return '';
  const b = e.before ?? {};
  const a = e.after ?? {};
  const parts: string[] = [];
  const same = (k: string) => JSON.stringify(b[k] ?? null) === JSON.stringify(a[k] ?? null);
  if (e.action === 'create') return `Knowledge: ${((a.id_prefixes as string[]) ?? []).join(', ') || '—'}`;
  if (!same('labels')) parts.push('button text');
  if (!same('icon')) parts.push('icon');
  if (!same('id_prefixes'))
    parts.push(`knowledge ${((b.id_prefixes as string[]) ?? []).join(', ') || '—'} → ${((a.id_prefixes as string[]) ?? []).join(', ') || '—'}`);
  if (!same('sub_questions')) parts.push('sample questions');
  return parts.join('; ');
}

/** ★2026-11-14 tile changes from admin "Topics" / "Topic codes". */
function TopicChanges() {
  const [entries, setEntries] = useState<TileChange[] | null>(null);
  useEffect(() => {
    api
      .tileChangelog()
      .then((r) => setEntries(r.entries))
      .catch(() => setEntries([]));
  }, []);
  if (entries === null) return <TableSkeleton cols={4} />;
  if (entries.length === 0) return <EmptyState title="No topic changes recorded yet." />;
  return (
    <div className="table-wrap">
      <table className="data">
        <thead>
          <tr>
            <th>When</th>
            <th>Topic</th>
            <th>Change</th>
            <th>By</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((e) => (
            <tr key={e.id} style={{ cursor: 'default' }}>
              <td>{formatTime(e.changed_at)}</td>
              <td>{e.tile_id === '*' ? 'All topics' : topicLabel(e.tile_id)}</td>
              <td>
                {TILE_ACTIONS[e.action] ?? e.action}
                {tileChangeSummary(e) ? <span className="muted"> — {tileChangeSummary(e)}</span> : null}
              </td>
              <td className="muted">{e.changed_by_name || '—'}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function History() {
  const [entries, setEntries] = useState<KbChangeLog[]>([]);
  const [load, setLoad] = useState<Load>('loading');

  const fetchLog = useCallback(async () => {
    setLoad('loading');
    try {
      const { entries } = await api.listChangelog();
      setEntries(entries);
      setLoad('ready');
    } catch {
      setLoad('error');
    }
  }, []);

  useEffect(() => {
    void fetchLog();
  }, [fetchLog]);

  return (
    <>
      <div className="page-head">
        <h1>Change history</h1>
      </div>
      <h2>Knowledge changes</h2>

      {load === 'loading' ? (
        <TableSkeleton cols={5} />
      ) : load === 'error' ? (
        <ErrorState onRetry={() => void fetchLog()} />
      ) : entries.length === 0 ? (
        <EmptyState title="No changes recorded yet." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>Rule</th>
                <th>By</th>
                <th>Fee change</th>
                <th>Rule text (after)</th>
              </tr>
            </thead>
            <tbody>
              {entries.map((e) => (
                <tr key={e.id} style={{ cursor: 'default' }}>
                  <td>{formatTime(e.changed_at)}</td>
                  <td>{e.rule_id}</td>
                  <td className="muted">{e.changed_by?.slice(0, 8) ?? '—'}</td>
                  <td>
                    <FeeDiff before={fees(e.before)} after={fees(e.after)} />
                  </td>
                  <td>
                    {String((e.after?.rule_text as string) ?? '').slice(0, 60) || <span className="muted">—</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="page-head" style={{ marginTop: 'var(--sp-6, 32px)' }}>
        <h2>Topic changes</h2>
      </div>
      <TopicChanges />
    </>
  );
}
