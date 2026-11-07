import { useCallback, useEffect, useState } from 'react';
import { api, type TopicCodeRow, type TopicCodes as TopicCodesData } from '../lib/api';
import { ErrorState, TableSkeleton } from '../components/states';
import { useToast } from '../components/Toast';

type Load = 'loading' | 'ready' | 'error';

/**
 * ★2026-11-07 admin "Topic codes": which chat tiles use the rules of each Rule
 * ID topic code (ESP001 → ESP). Built-in links are fixed (shown ticked and
 * locked); CS can add tiles to any code, including new codes they start.
 */
export function TopicCodes() {
  const [data, setData] = useState<TopicCodesData | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [newCode, setNewCode] = useState('');

  const fetchData = useCallback(async () => {
    setLoad('loading');
    try {
      setData(await api.topicCodes());
      setLoad('ready');
    } catch {
      setLoad('error');
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const code = newCode.trim().toUpperCase();
  const codeValid = /^[A-Z]{2,4}$/.test(code);
  const exists = !!data?.codes.some((c) => c.code === code);
  const rows: TopicCodeRow[] =
    data && codeValid && !exists
      ? [
          ...data.codes,
          {
            code,
            label: '',
            builtin: false,
            builtin_topics: [],
            extra_topics: [],
            rule_count: 0,
            unlinked: true,
          },
        ]
      : (data?.codes ?? []);

  return (
    <>
      <div className="page-head">
        <h1>Topic codes</h1>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        A Rule ID is a topic code (2–4 capital letters) + 3–4 numbers, e.g. DR001, ESP001 or CN0001.
        The code decides which chat tiles the AI uses the rule for. You can start a new code at any
        time — then tick the tiles it belongs to here. Until a code has a tile, its rules are used
        only by “Something else” and the full-manual search.
      </p>

      <div className="row" style={{ gap: 8, marginBottom: 'var(--sp-3)' }}>
        <label htmlFor="new-code">Add a code</label>
        <input
          id="new-code"
          type="text"
          style={{ width: 110 }}
          placeholder="e.g. ESP"
          maxLength={4}
          value={newCode}
          onChange={(e) => setNewCode(e.target.value)}
        />
        {newCode && !codeValid ? (
          <span style={{ color: 'var(--danger)' }}>2–4 letters only</span>
        ) : null}
        {codeValid && exists ? <span className="muted">{code} is already in the list</span> : null}
        {codeValid && !exists ? (
          <span className="muted">Tick its tiles below and press Save.</span>
        ) : null}
      </div>

      {load === 'loading' ? (
        <TableSkeleton cols={4} />
      ) : load === 'error' || !data ? (
        <ErrorState onRetry={() => void fetchData()} />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th>Code</th>
                <th>Name</th>
                <th>Rules</th>
                <th>Chat tiles that use it</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <CodeRow
                  key={r.code}
                  row={r}
                  tiles={data.tiles}
                  onSaved={() => {
                    setNewCode('');
                    void fetchData();
                  }}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function CodeRow({
  row,
  tiles,
  onSaved,
}: {
  row: TopicCodeRow;
  tiles: TopicCodesData['tiles'];
  onSaved: () => void;
}) {
  const toast = useToast();
  const [label, setLabel] = useState(row.label);
  const [extra, setExtra] = useState<string[]>(row.extra_topics);
  const [saving, setSaving] = useState(false);
  const dirty =
    label !== row.label ||
    extra.length !== row.extra_topics.length ||
    extra.some((t) => !row.extra_topics.includes(t));

  const save = async () => {
    setSaving(true);
    try {
      await api.saveTopicCode(row.code, { label, topics: extra });
      toast.show({ message: `Saved ${row.code}.` });
      onSaved();
    } catch {
      toast.show({ message: `Could not save ${row.code}. Try again.` });
    } finally {
      setSaving(false);
    }
  };

  const unlinked = !row.builtin && row.builtin_topics.length + extra.length === 0;
  return (
    <tr>
      <td>
        <strong>{row.code}</strong>
        {unlinked ? (
          <div style={{ color: 'var(--warning)', fontSize: 'var(--font-aux)' }}>No tile yet</div>
        ) : null}
      </td>
      <td>
        {row.builtin ? (
          row.label
        ) : (
          <input
            type="text"
            aria-label={`Name of ${row.code}`}
            placeholder="e.g. eSIM"
            value={label}
            maxLength={80}
            onChange={(e) => setLabel(e.target.value)}
          />
        )}
      </td>
      <td>{row.rule_count}</td>
      <td>
        <div className="row wrap" style={{ gap: '4px 12px' }}>
          {tiles.map((t) => {
            const builtin = row.builtin_topics.includes(t.id);
            return (
              <label
                key={t.id}
                className="row"
                style={{ gap: 4, fontSize: 'var(--font-aux)' }}
                title={builtin ? 'Built in' : ''}
              >
                <input
                  type="checkbox"
                  checked={builtin || extra.includes(t.id)}
                  disabled={builtin}
                  onChange={(e) =>
                    setExtra((prev) =>
                      e.target.checked ? [...prev, t.id] : prev.filter((x) => x !== t.id),
                    )
                  }
                />
                {t.label}
              </label>
            );
          })}
        </div>
      </td>
      <td>
        <button className="btn btn-sm" disabled={!dirty || saving} onClick={() => void save()}>
          {saving ? 'Saving…' : 'Save'}
        </button>
      </td>
    </tr>
  );
}
