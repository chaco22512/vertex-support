import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KbRule } from '@vertex/shared';
import { api, type ImportApplyResult } from '../lib/api';
import { EmptyState, ErrorState, TableSkeleton } from '../components/states';
import { RuleDialog } from '../components/RuleDialog';
import { ImportPreviewDialog } from '../components/ImportPreviewDialog';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import { useAuth } from '../lib/auth';

type Load = 'loading' | 'ready' | 'error';

export function Knowledge() {
  const toast = useToast();
  const { staff } = useAuth();
  const isAdmin = staff?.role === 'admin';
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [rules, setRules] = useState<KbRule[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const [editing, setEditing] = useState<KbRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [importCsv, setImportCsv] = useState<{ text: string; name: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const fetchRules = useCallback(async () => {
    setLoad('loading');
    try {
      const { rules } = await api.listRules();
      setRules(rules);
      setLoad('ready');
    } catch {
      setLoad('error');
    }
  }, []);

  useEffect(() => {
    void fetchRules();
  }, [fetchRules]);

  const categories = useMemo(
    () => [...new Set(rules.map((r) => r.category))].sort(),
    [rules],
  );

  // Incremental full-text filter (§7.4): narrows on each keystroke.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rules.filter((r) => {
      if (activeCategory && r.category !== activeCategory) return false;
      if (!q) return true;
      return (
        r.rule_text.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.subcategory.toLowerCase().includes(q)
      );
    });
  }, [rules, search, activeCategory]);

  function applySaved(updated: KbRule) {
    setRules((rs) => rs.map((r) => (r.id === updated.id ? updated : r)));
    setEditing(null);
    toast.show({ message: `Rule ${updated.id} saved.` });
  }

  async function download(scope: 'filtered' | 'all') {
    setBusy(true);
    try {
      await api.downloadRulesCsv(scope, { q: search.trim() || undefined, category: activeCategory ?? undefined });
    } catch {
      toast.show({ message: 'Could not download the CSV.' });
    } finally {
      setBusy(false);
    }
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file
    if (!file) return;
    setImportCsv({ text: await file.text(), name: file.name });
  }

  function onApplied(result: ImportApplyResult) {
    setImportCsv(null);
    void fetchRules();
    toast.show(
      {
        message: `Imported ${result.applied} change(s)${result.skipped ? `, ${result.skipped} skipped` : ''}.`,
        actionLabel: 'Undo import',
        onAction: async () => {
          try {
            const u = await api.importUndo();
            toast.show({ message: `Reverted ${u.restored} rule(s).` });
            void fetchRules();
          } catch {
            toast.show({ message: 'Undo failed.' });
          }
        },
      },
      30_000,
    );
  }

  return (
    <>
      <div className="page-head">
        <h1>Knowledge</h1>
        <div className="row wrap" style={{ gap: 8 }}>
          <button className="btn btn-sm" onClick={() => void download('filtered')} disabled={busy}>
            Download CSV
          </button>
          <button className="btn btn-sm" onClick={() => void download('all')} disabled={busy}>
            Download all
          </button>
          {isAdmin ? (
            <>
              <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
                Upload reviewed CSV
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => void onFile(e)}
              />
            </>
          ) : null}
          <button className="btn btn-sm btn-primary" onClick={() => setCreating(true)}>
            New rule
          </button>
        </div>
      </div>

      <div className="filters">
        <div className="field grow">
          <label htmlFor="kb-search">Search rules</label>
          <input
            id="kb-search"
            type="search"
            placeholder="Type to filter…"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
      </div>

      {load === 'loading' ? (
        <TableSkeleton cols={4} />
      ) : load === 'error' ? (
        <ErrorState onRetry={() => void fetchRules()} />
      ) : (
        <div className="detail-grid">
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>ID</th>
                  <th>Rule</th>
                  <th>Audience</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr style={{ cursor: 'default' }}>
                    <td colSpan={4}>
                      <EmptyState title="No rules match." />
                    </td>
                  </tr>
                ) : (
                  filtered.map((r) => (
                    <tr key={r.id} onClick={() => setEditing(r)}>
                      <td>{r.id}</td>
                      <td>
                        {r.rule_text.slice(0, 80)}
                        {r.rule_text.length > 80 ? '…' : ''}
                      </td>
                      <td>{r.audience}</td>
                      <td>
                        <span className={`badge status-${r.status === 'active' ? 'resolved' : r.status === 'disabled' ? 'closed' : 'escalated'}`}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          <aside className="table-wrap" style={{ padding: 'var(--sp-4)' }}>
            <div className="tree-cat">Categories</div>
            <ul className="tree">
              <li>
                <button
                  className={`nav-link${activeCategory === null ? ' active' : ''}`}
                  onClick={() => setActiveCategory(null)}
                >
                  All ({rules.length})
                </button>
              </li>
              {categories.map((cat) => (
                <li key={cat}>
                  <button
                    className={`nav-link${activeCategory === cat ? ' active' : ''}`}
                    onClick={() => setActiveCategory(cat)}
                  >
                    {cat} ({rules.filter((r) => r.category === cat).length})
                  </button>
                </li>
              ))}
            </ul>
          </aside>
        </div>
      )}

      {editing ? (
        <RuleDialog rule={editing} onClose={() => setEditing(null)} onSaved={applySaved} />
      ) : null}
      {importCsv ? (
        <ImportPreviewDialog
          csv={importCsv.text}
          fileName={importCsv.name}
          onClose={() => setImportCsv(null)}
          onApplied={onApplied}
        />
      ) : null}
      {creating ? (
        <NewRuleDialog
          onClose={() => setCreating(false)}
          onCreated={(r) => {
            setRules((rs) => [...rs, r]);
            setCreating(false);
            toast.show({ message: `Rule ${r.id} created.` });
          }}
        />
      ) : null}
    </>
  );
}

function NewRuleDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (r: KbRule) => void;
}) {
  const [category, setCategory] = useState('');
  const [ruleText, setRuleText] = useState('');
  const [audience, setAudience] = useState<'customer' | 'internal'>('customer');
  const [aiCanAnswer, setAiCanAnswer] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function create() {
    if (!category.trim() || !ruleText.trim()) {
      setError('Category and rule text are required.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { rule } = await api.createRule({
        category: category.trim(),
        rule_text: ruleText.trim(),
        audience,
        ai_can_answer: aiCanAnswer,
        status: 'active',
      });
      onCreated(rule);
    } catch {
      setError('Could not create the rule. Please try again.');
      setBusy(false);
    }
  }

  return (
    <Dialog title="New rule" onClose={onClose}>
      <div className="field">
        <label htmlFor="new-cat">Category</label>
        <input id="new-cat" type="text" value={category} onChange={(e) => setCategory(e.target.value)} />
      </div>
      <div className="field">
        <label htmlFor="new-text">Rule text</label>
        <textarea id="new-text" rows={5} value={ruleText} onChange={(e) => setRuleText(e.target.value)} />
      </div>
      <div className="row wrap">
        <div className="field">
          <label htmlFor="new-audience">Audience</label>
          <select id="new-audience" value={audience} onChange={(e) => setAudience(e.target.value as 'customer' | 'internal')}>
            <option value="customer">Customer</option>
            <option value="internal">Internal</option>
          </select>
        </div>
        <label className="row" style={{ alignSelf: 'flex-end' }}>
          <input type="checkbox" checked={aiCanAnswer} onChange={(e) => setAiCanAnswer(e.target.checked)} />
          AI can answer
        </label>
      </div>
      <p className="muted" style={{ margin: 0 }}>
        Changes apply to AI instantly.
      </p>
      {error ? (
        <div className="state error" style={{ padding: 0 }} role="alert">
          {error}
        </div>
      ) : null}
      <div className="dialog-actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void create()} disabled={busy}>
          {busy ? 'Saving…' : 'Save rule'}
        </button>
      </div>
    </Dialog>
  );
}
