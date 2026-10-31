import { useEffect, useState } from 'react';
import { api, type ImportApplyResult, type ImportMode, type ImportPreview } from '../lib/api';
import { Dialog } from './Dialog';

type Phase = 'previewing' | 'ready' | 'applying' | 'error';

/** The word an admin must type to run Replace all (spec v1.8 §7.4.2). */
export const REPLACE_WORD = 'REPLACE';

/**
 * CSV import: shows a diff preview and only applies on an explicit click
 * (spec v1.7 §7.4 safety requirement). No write happens on load.
 * ★v1.8 `mode="replace"` (Replace all): also lists the rules that will be set
 * aside (archived — kept, restorable), the new rules, and how many rules the
 * bot can use afterwards, and requires typing REPLACE to run.
 */
export function ImportPreviewDialog({
  csv,
  fileName,
  mode: initialMode = 'update',
  onClose,
  onApplied,
}: {
  csv: string;
  fileName: string;
  mode?: ImportMode;
  onClose: () => void;
  onApplied: (result: ImportApplyResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>('previewing');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [typed, setTyped] = useState('');
  // ★v1.8: the admin picks the mode in the dialog; switching re-runs the preview.
  const [mode, setMode] = useState<ImportMode>(initialMode);
  const replace = mode === 'replace';

  useEffect(() => {
    let cancelled = false;
    setPhase('previewing');
    setPreview(null);
    setTyped('');
    api
      .importPreview(csv, mode)
      .then((p) => {
        if (cancelled) return;
        setPreview(p);
        setPhase('ready');
      })
      .catch(() => {
        if (cancelled) return;
        setError('Could not read this CSV. Check that it came from the Download CSV button.');
        setPhase('error');
      });
    return () => {
      cancelled = true;
    };
  }, [csv, mode]);

  async function apply() {
    setPhase('applying');
    try {
      const result = await api.importApply(csv, mode, replace ? typed : undefined);
      onApplied(result);
    } catch {
      setError('Could not apply the changes. Nothing was changed if a backup could not be saved. Please try again.');
      setPhase('error');
    }
  }

  const s = preview?.summary;
  const added = s?.added ?? 0;
  const archived = s?.archived ?? 0;
  const total = (s?.changed ?? 0) + added + archived;
  const canApply =
    phase === 'ready' && total > 0 && (!replace || typed.trim() === REPLACE_WORD);

  return (
    <Dialog title={`${replace ? 'Replace all' : 'Review import'} — ${fileName}`} onClose={onClose}>
      {phase === 'previewing' ? (
        <p className="muted">Reading and comparing the file…</p>
      ) : phase === 'error' ? (
        <div className="state error" role="alert" style={{ padding: 0 }}>
          {error}
        </div>
      ) : (
        <>
          <div className="row wrap" role="radiogroup" aria-label="Import mode" style={{ gap: 16, marginBottom: 'var(--sp-3)' }}>
            <label>
              <input type="radio" name="import-mode" checked={!replace} onChange={() => setMode('update')} /> Add / update
              only <span className="muted">(rules not in the file stay as they are)</span>
            </label>
            <label>
              <input type="radio" name="import-mode" checked={replace} onChange={() => setMode('replace')} /> Replace all{' '}
              <span className="muted">(rules not in the file are archived)</span>
            </label>
          </div>
          <div className="row wrap" style={{ gap: 12 }}>
            <strong>{s!.changed} to change</strong>
            <strong>· {added} new</strong>
            {replace ? <strong>· {archived} to archive</strong> : null}
            <span className="muted">· {s!.unchanged} unchanged</span>
            <span className="muted">· {s!.ignored} ignored</span>
            {s!.errors > 0 ? <span style={{ color: 'var(--danger)' }}>· {s!.errors} with errors (skipped)</span> : null}
          </div>

          {replace ? (
            <>
              <p style={{ marginBottom: 0 }}>
                Rules that are not in this file will be <strong>archived</strong> — kept and restorable, not deleted.
                A backup of every rule is saved first.
              </p>
              <p className="muted" style={{ marginTop: 'var(--sp-1)' }}>
                Rules the bot can use: {preview!.active_before} → <strong>{preview!.active_after}</strong>
              </p>
              {preview!.active_after === 0 ? (
                <div className="state error" role="alert" style={{ padding: 'var(--sp-2) 0' }}>
                  After this the bot will have no rules to use and will pass every question to staff.
                </div>
              ) : null}
              {archived > 0 ? (
                <details style={{ marginTop: 'var(--sp-2)' }}>
                  <summary>{archived} rule(s) will be archived</summary>
                  <p className="muted" style={{ margin: '4px 0 0' }}>
                    {preview!.to_archive!.sample.map((r) => r.id).join(', ')}
                    {archived > preview!.to_archive!.sample.length ? ', …' : ''}
                  </p>
                </details>
              ) : null}
            </>
          ) : null}

          {added > 0 ? (
            <details style={{ marginTop: 'var(--sp-2)' }} open={s!.changed === 0}>
              <summary>{added} new rule(s) will be added</summary>
              <ul className="muted" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {preview!.new_rules!.slice(0, 50).map((n) => (
                  <li key={n.line}>
                    {n.id} · {n.category}: {n.text}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {preview!.changes.length > 0 ? (
            <div className="table-wrap" style={{ maxHeight: 300, overflow: 'auto', marginTop: 'var(--sp-3)' }}>
              <table className="data">
                <thead>
                  <tr>
                    <th>ID</th>
                    <th>Field</th>
                    <th>From → To</th>
                  </tr>
                </thead>
                <tbody>
                  {preview!.changes.flatMap((c) =>
                    c.changes.map((ch, i) => (
                      <tr key={`${c.id}-${i}`}>
                        <td>{i === 0 ? c.id : ''}</td>
                        <td>{ch.field}</td>
                        <td>
                          {ch.field === 'Fee amounts (JPY)' ? (
                            <span>
                              <del className="muted">{ch.from || '—'}</del> →{' '}
                              <strong>{ch.to || '—'}</strong>
                            </span>
                          ) : (
                            <span>
                              <span className="muted">{ch.from || '—'}</span> → {ch.to || '—'}
                            </span>
                          )}
                        </td>
                      </tr>
                    )),
                  )}
                </tbody>
              </table>
            </div>
          ) : total === 0 ? (
            <p className="muted" style={{ marginTop: 'var(--sp-3)' }}>
              No changes to apply.
            </p>
          ) : null}

          {preview!.errors.length > 0 ? (
            <details style={{ marginTop: 'var(--sp-3)' }}>
              <summary style={{ color: 'var(--danger)' }}>{preview!.errors.length} row(s) will be skipped</summary>
              <ul className="muted" style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {preview!.errors.slice(0, 50).map((e) => (
                  <li key={`${e.line}-${e.id}`}>
                    Line {e.line} ({e.id || 'no id'}): {e.reason}
                  </li>
                ))}
              </ul>
            </details>
          ) : null}

          {replace && total > 0 ? (
            <div className="field" style={{ marginTop: 'var(--sp-3)' }}>
              <label htmlFor="replace-confirm">
                This affects {total} rule(s). Type {REPLACE_WORD} to confirm.
              </label>
              <input
                id="replace-confirm"
                type="text"
                autoComplete="off"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
              />
            </div>
          ) : null}

          <div className="dialog-actions">
            <button className="btn" onClick={onClose} disabled={phase === 'applying'}>
              Cancel
            </button>
            <button className="btn btn-primary" onClick={() => void apply()} disabled={!canApply}>
              {phase === 'applying'
                ? 'Applying…'
                : replace
                  ? `Replace all (${total})`
                  : `Apply changes (${total})`}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
