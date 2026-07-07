import { useCallback, useEffect, useState } from 'react';
import type { KbChangeLog } from '@vertex/shared';
import { api } from '../lib/api';
import { formatTime } from '../lib/time';
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
    </>
  );
}
