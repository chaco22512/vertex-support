import { useCallback, useEffect, useState } from 'react';
import { api, type KbSnapshot } from '../lib/api';
import { formatTime } from '../lib/time';
import { Dialog } from './Dialog';

/**
 * Bulk knowledge dialogs (spec v1.8 §7.4.2) — the safe version of "all clear".
 * Nothing here deletes a rule: Disable switches rules off, Backups put them back.
 */

/** "Disable all in this view": confirm the exact count, then switch them off. */
export function DisableViewDialog({
  ids,
  description,
  usableAfter,
  onClose,
  onDone,
}: {
  ids: string[];
  description: string;
  /** Rules the bot could still use afterwards (computed from the loaded list). */
  usableAfter: number;
  onClose: () => void;
  onDone: (result: { disabled: number; snapshot_id: string | null }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      onDone(await api.disableView(ids, description));
    } catch {
      setError('Could not disable the rules. Nothing was changed. Please reload and try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog title="Disable all in this view" onClose={onClose}>
      <p>
        This turns off <strong>{ids.length} rule(s)</strong> shown in this view ({description || 'current view'}).
      </p>
      <p className="muted">
        They are not deleted. A backup is saved first, and you can undo this right after or later from Backups.
      </p>
      {usableAfter === 0 ? (
        <div className="state error" role="alert" style={{ padding: 'var(--sp-2) 0' }}>
          After this the bot will have no rules to use and will pass every question to staff.
        </div>
      ) : (
        <p className="muted">Rules the bot can still use afterwards: {usableAfter}</p>
      )}
      {error ? (
        <div className="state error" role="alert" style={{ padding: 0 }}>
          {error}
        </div>
      ) : null}
      <div className="dialog-actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void run()} disabled={busy || ids.length === 0}>
          {busy ? 'Disabling…' : `Disable ${ids.length} rule(s)`}
        </button>
      </div>
    </Dialog>
  );
}

const KIND_LABEL: Record<string, string> = {
  replace_all: 'Replace all',
  disable_view: 'Disable all in view',
  restore: 'Before a restore',
};

/** Backups: the latest kept snapshots, each undoable / restorable. */
export function BackupsDialog({ onClose, onChanged }: { onClose: () => void; onChanged: (message: string) => void }) {
  const [snapshots, setSnapshots] = useState<KbSnapshot[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirmRestore, setConfirmRestore] = useState<KbSnapshot | null>(null);

  const load = useCallback(async () => {
    try {
      setSnapshots((await api.listSnapshots()).snapshots);
    } catch {
      setError('Could not load the backups.');
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(s: KbSnapshot, kind: 'undo' | 'restore') {
    setBusy(s.id);
    setError(null);
    try {
      const r = kind === 'undo' ? await api.undoSnapshot(s.id) : await api.restoreSnapshot(s.id);
      onChanged(kind === 'undo' ? `Undone — ${r.restored} rule(s) put back.` : `Restored — ${r.restored} rule(s) changed.`);
      setConfirmRestore(null);
      await load();
    } catch {
      setError('That did not work. Nothing was changed. Please try again.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Dialog title="Backups" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        A backup of every rule is saved before each bulk change. The latest 5 are kept.
      </p>
      {error ? (
        <div className="state error" role="alert" style={{ padding: 0 }}>
          {error}
        </div>
      ) : null}
      {snapshots === null ? (
        <p className="muted">Loading…</p>
      ) : snapshots.length === 0 ? (
        <p className="muted">No backups yet. One is saved automatically before every bulk change.</p>
      ) : (
        <div className="table-wrap" style={{ maxHeight: 360, overflow: 'auto' }}>
          <table className="data">
            <thead>
              <tr>
                <th>When</th>
                <th>What</th>
                <th>By</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {snapshots.map((s) => (
                <tr key={s.id} style={{ cursor: 'default' }}>
                  <td>{formatTime(s.created_at)}</td>
                  <td>
                    {KIND_LABEL[s.kind] ?? s.kind}
                    <div className="muted">{s.note}</div>
                  </td>
                  <td>{s.created_by_name || '—'}</td>
                  <td>
                    <div className="row wrap" style={{ gap: 6 }}>
                      {s.kind !== 'restore' ? (
                        <button
                          className="btn btn-sm"
                          disabled={busy !== null || s.undone}
                          onClick={() => void act(s, 'undo')}
                          title="Put back only the rules this change touched"
                        >
                          {s.undone ? 'Undone' : 'Undo this change'}
                        </button>
                      ) : null}
                      <button
                        className="btn btn-sm btn-ghost"
                        disabled={busy !== null}
                        onClick={() => setConfirmRestore(s)}
                        title="Put every rule back to how it was at this time"
                      >
                        Restore everything
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {confirmRestore ? (
        <div className="state error" role="alert" style={{ padding: 'var(--sp-3) 0 0' }}>
          <p style={{ margin: 0 }}>
            Put <strong>every</strong> rule back to how it was on {formatTime(confirmRestore.created_at)}? Changes made
            after that time will be undone. The current state is backed up first.
          </p>
          <div className="dialog-actions">
            <button className="btn" onClick={() => setConfirmRestore(null)} disabled={busy !== null}>
              Cancel
            </button>
            <button
              className="btn btn-primary"
              onClick={() => void act(confirmRestore, 'restore')}
              disabled={busy !== null}
            >
              {busy ? 'Restoring…' : 'Restore everything'}
            </button>
          </div>
        </div>
      ) : (
        <div className="dialog-actions">
          <button className="btn" onClick={onClose}>
            Close
          </button>
        </div>
      )}
    </Dialog>
  );
}
