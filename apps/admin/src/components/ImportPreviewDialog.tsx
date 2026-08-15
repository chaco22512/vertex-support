import { useEffect, useState } from 'react';
import { api, type ImportApplyResult, type ImportPreview } from '../lib/api';
import { Dialog } from './Dialog';

type Phase = 'previewing' | 'ready' | 'applying' | 'error';

/**
 * CSV import: shows a diff preview and only applies on an explicit "Apply
 * changes" click (spec v1.7 §7.4 safety requirement). No write happens on load.
 */
export function ImportPreviewDialog({
  csv,
  fileName,
  onClose,
  onApplied,
}: {
  csv: string;
  fileName: string;
  onClose: () => void;
  onApplied: (result: ImportApplyResult) => void;
}) {
  const [phase, setPhase] = useState<Phase>('previewing');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api
      .importPreview(csv)
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
  }, [csv]);

  async function apply() {
    setPhase('applying');
    try {
      const result = await api.importApply(csv);
      onApplied(result);
    } catch {
      setError('Could not apply the changes. Please try again.');
      setPhase('error');
    }
  }

  const s = preview?.summary;
  return (
    <Dialog title={`Review import — ${fileName}`} onClose={onClose}>
      {phase === 'previewing' ? (
        <p className="muted">Reading and comparing the file…</p>
      ) : phase === 'error' ? (
        <div className="state error" role="alert" style={{ padding: 0 }}>
          {error}
        </div>
      ) : (
        <>
          <div className="row wrap" style={{ gap: 12 }}>
            <strong>{s!.changed} to change</strong>
            <span className="muted">· {s!.unchanged} unchanged</span>
            <span className="muted">· {s!.ignored} ignored</span>
            {s!.errors > 0 ? <span style={{ color: 'var(--danger)' }}>· {s!.errors} with errors (skipped)</span> : null}
          </div>

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
          ) : (
            <p className="muted" style={{ marginTop: 'var(--sp-3)' }}>
              No changes to apply.
            </p>
          )}

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

          <div className="dialog-actions">
            <button className="btn" onClick={onClose} disabled={phase === 'applying'}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void apply()}
              disabled={phase === 'applying' || preview!.changes.length === 0}
            >
              {phase === 'applying' ? 'Applying…' : `Apply changes (${s!.changed})`}
            </button>
          </div>
        </>
      )}
    </Dialog>
  );
}
