import { useCallback, useEffect, useMemo, useState } from 'react';
import type { KbRule } from '@vertex/shared';
import { api } from '../lib/api';
import { EmptyState, ErrorState, TableSkeleton } from '../components/states';
import { RuleDialog } from '../components/RuleDialog';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import { classify, type ReasonTab } from '../lib/reviewClassify';

type Load = 'loading' | 'ready' | 'error';

export function Review() {
  const toast = useToast();
  const [rules, setRules] = useState<KbRule[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [tab, setTab] = useState<ReasonTab>('A');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState<KbRule | null>(null);
  const [splitting, setSplitting] = useState<KbRule | null>(null);

  const fetchQueue = useCallback(async () => {
    setLoad('loading');
    try {
      const { rules } = await api.listRules({ status: 'pending_review' });
      setRules(rules);
      setSelected(new Set());
      setLoad('ready');
    } catch {
      setLoad('error');
    }
  }, []);

  useEffect(() => {
    void fetchQueue();
  }, [fetchQueue]);

  const buckets = useMemo(() => {
    const a: KbRule[] = [];
    const b: KbRule[] = [];
    for (const r of rules) (classify(r) === 'B' ? b : a).push(r);
    return { A: a, B: b };
  }, [rules]);

  const current = buckets[tab];

  function remove(ids: string[]) {
    const set = new Set(ids);
    setRules((rs) => rs.filter((r) => !set.has(r.id)));
    setSelected(new Set());
  }

  async function approve(ids: string[]) {
    const { approved } = await api.approveRules(ids);
    remove(approved);
    toast.show({ message: `Approved ${approved.length} rule${approved.length === 1 ? '' : 's'}.` });
  }

  async function keepInternal(rule: KbRule) {
    await api.updateRule(rule.id, { audience: 'internal', status: 'active' });
    remove([rule.id]);
    toast.show({ message: `Rule ${rule.id} kept as internal.` });
  }

  async function disable(rule: KbRule) {
    await api.updateRule(rule.id, { status: 'disabled' });
    remove([rule.id]);
    toast.show({ message: `Rule ${rule.id} disabled.` });
  }

  function toggle(id: string) {
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <>
      <div className="page-head">
        <h1>Review queue</h1>
        {selected.size > 0 ? (
          <button className="btn btn-sm btn-primary" onClick={() => void approve([...selected])}>
            Approve selected ({selected.size})
          </button>
        ) : null}
      </div>

      <div className="tabs">
        <button className={`tab${tab === 'A' ? ' active' : ''}`} onClick={() => setTab('A')}>
          A · Strikethrough removal ({buckets.A.length})
        </button>
        <button className={`tab${tab === 'B' ? ' active' : ''}`} onClick={() => setTab('B')}>
          B · Internal classification ({buckets.B.length})
        </button>
      </div>

      {load === 'loading' ? (
        <TableSkeleton cols={3} />
      ) : load === 'error' ? (
        <ErrorState onRetry={() => void fetchQueue()} />
      ) : rules.length === 0 ? (
        <EmptyState title="Review queue is clear. AI is using all approved rules." />
      ) : current.length === 0 ? (
        <EmptyState title="Nothing in this tab." />
      ) : (
        <div className="table-wrap">
          <table className="data">
            <thead>
              <tr>
                <th style={{ width: 32 }} />
                <th>ID</th>
                <th>Rule</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {current.map((r) => (
                <tr key={r.id} style={{ cursor: 'default' }}>
                  <td onClick={(e) => e.stopPropagation()}>
                    <input
                      type="checkbox"
                      checked={selected.has(r.id)}
                      onChange={() => toggle(r.id)}
                      aria-label={`Select ${r.id}`}
                    />
                  </td>
                  <td>{r.id}</td>
                  <td>
                    {r.rule_text.slice(0, 90)}
                    {r.rule_text.length > 90 ? '…' : ''}
                    {r.review_reason ? <div className="muted">{r.review_reason}</div> : null}
                  </td>
                  <td>
                    <div className="row wrap">
                      <button className="btn btn-sm btn-primary" onClick={() => void approve([r.id])}>
                        Approve as-is
                      </button>
                      <button className="btn btn-sm" onClick={() => setEditing(r)}>
                        Edit &amp; approve
                      </button>
                      <button className="btn btn-sm" onClick={() => void keepInternal(r)}>
                        Keep internal
                      </button>
                      <button className="btn btn-sm" onClick={() => void disable(r)}>
                        Disable
                      </button>
                      {tab === 'B' ? (
                        <button className="btn btn-sm" onClick={() => setSplitting(r)}>
                          Split
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editing ? (
        <RuleDialog
          rule={editing}
          onClose={() => setEditing(null)}
          onSaved={(u) => {
            setEditing(null);
            // Edit & approve: after saving edits, approve if still pending.
            if (u.status === 'pending_review') void approve([u.id]);
            else {
              remove([u.id]);
              toast.show({ message: `Rule ${u.id} saved.` });
            }
          }}
        />
      ) : null}
      {splitting ? (
        <SplitDialog
          rule={splitting}
          onClose={() => setSplitting(null)}
          onSplit={(originalId) => {
            remove([originalId]);
            setSplitting(null);
            toast.show({ message: 'Rule split into customer + internal.' });
            void fetchQueue();
          }}
        />
      ) : null}
    </>
  );
}

function SplitDialog({
  rule,
  onClose,
  onSplit,
}: {
  rule: KbRule;
  onClose: () => void;
  onSplit: (originalId: string) => void;
}) {
  const [customerText, setCustomerText] = useState(rule.rule_text);
  const [internalText, setInternalText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit() {
    if (!customerText.trim() || !internalText.trim()) {
      setError('Both the customer and internal halves are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.splitRule(rule.id, customerText.trim(), internalText.trim());
      onSplit(rule.id);
    } catch {
      setError('Could not split the rule. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog title={`Split rule ${rule.id}`} onClose={onClose}>
      <p className="muted" style={{ margin: 0 }}>
        The customer half stays as this rule (active). The internal half becomes a new internal rule.
      </p>
      <div className="field">
        <label htmlFor="split-customer">Customer text (active)</label>
        <textarea id="split-customer" rows={4} value={customerText} onChange={(e) => setCustomerText(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="split-internal">Internal text</label>
        <textarea id="split-internal" rows={4} value={internalText} onChange={(e) => setInternalText(e.target.value)} />
      </div>
      {error ? (
        <div className="state error" style={{ padding: 0 }} role="alert">
          {error}
        </div>
      ) : null}
      <div className="dialog-actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void submit()} disabled={busy}>
          {busy ? 'Splitting…' : 'Split rule'}
        </button>
      </div>
    </Dialog>
  );
}
