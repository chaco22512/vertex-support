import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { KbRule, RuleStatus } from '@vertex/shared';
import { api, type ImportApplyResult, type ImportMode } from '../lib/api';
import { EmptyState, ErrorState, TableSkeleton } from '../components/states';
import { RuleDialog } from '../components/RuleDialog';
import { ImportPreviewDialog } from '../components/ImportPreviewDialog';
import { BackupsDialog, ConfirmAllDialog, DisableViewDialog } from '../components/BulkActions';
import { Dialog } from '../components/Dialog';
import { useToast } from '../components/Toast';
import { useAuth } from '../lib/auth';

type Load = 'loading' | 'ready' | 'error';

/** Status filter (★v1.8): archived rules are hidden by default. */
type StatusFilter = 'not_archived' | RuleStatus | 'all';
const STATUS_FILTER_LABEL: Record<StatusFilter, string> = {
  not_archived: 'All except archived',
  active: 'Active',
  pending_review: 'Waiting for review',
  disabled: 'Disabled',
  archived: 'Archived',
  all: 'Everything',
};

export function Knowledge() {
  const toast = useToast();
  const { staff } = useAuth();
  const isAdmin = staff?.role === 'admin';
  const fileRef = useRef<HTMLInputElement | null>(null);
  const replaceFileRef = useRef<HTMLInputElement | null>(null);
  const [rules, setRules] = useState<KbRule[]>([]);
  const [load, setLoad] = useState<Load>('loading');
  const [search, setSearch] = useState('');
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  // ★v1.8: archived rules (set aside by Replace all) are hidden unless asked for.
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('not_archived');
  const [editing, setEditing] = useState<KbRule | null>(null);
  const [creating, setCreating] = useState(false);
  const [importCsv, setImportCsv] = useState<{ text: string; name: string; mode: ImportMode } | null>(null);
  const [busy, setBusy] = useState(false);
  const [bulkOpen, setBulkOpen] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [backupsOpen, setBackupsOpen] = useState(false);
  // ★v1.8 (owner decision 2026-10-31): Archive all / permanent delete of archived rules.
  const [confirmAll, setConfirmAll] = useState<'archive' | 'delete' | null>(null);
  const archivedCount = useMemo(() => rules.filter((r) => r.status === 'archived').length, [rules]);
  const liveCount = rules.length - archivedCount;

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

  const statusRules = useMemo(
    () =>
      rules.filter((r) =>
        statusFilter === 'all' ? true : statusFilter === 'not_archived' ? r.status !== 'archived' : r.status === statusFilter,
      ),
    [rules, statusFilter],
  );

  const categories = useMemo(
    () => [...new Set(statusRules.map((r) => r.category))].sort(),
    [statusRules],
  );

  // Incremental full-text filter (§7.4): narrows on each keystroke.
  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return statusRules.filter((r) => {
      if (activeCategory && r.category !== activeCategory) return false;
      if (!q) return true;
      return (
        r.rule_text.toLowerCase().includes(q) ||
        r.id.toLowerCase().includes(q) ||
        r.subcategory.toLowerCase().includes(q)
      );
    });
  }, [statusRules, search, activeCategory]);

  // ★v1.8 "Disable all in this view": exactly the rows on screen that are still on.
  const disableTargets = useMemo(
    () => filtered.filter((r) => r.status !== 'disabled' && r.status !== 'archived'),
    [filtered],
  );
  const viewDescription = [
    activeCategory ? `Topic: ${activeCategory}` : 'All topics',
    search.trim() ? `search "${search.trim()}"` : '',
    statusFilter !== 'not_archived' ? `status: ${STATUS_FILTER_LABEL[statusFilter]}` : '',
  ]
    .filter(Boolean)
    .join(', ');
  const usableAfterDisable = useMemo(() => {
    const off = new Set(disableTargets.map((r) => r.id));
    return rules.filter((r) => r.status === 'active' && r.audience === 'customer' && r.ai_can_answer && !off.has(r.id))
      .length;
  }, [rules, disableTargets]);

  /** Toast with a one-click Undo backed by the bulk-change backup (★v1.8). */
  function showBulkUndo(message: string, snapshotId: string | null) {
    toast.show(
      {
        message,
        ...(snapshotId
          ? {
              actionLabel: 'Undo',
              onAction: async () => {
                try {
                  const u = await api.undoSnapshot(snapshotId);
                  toast.show({ message: `Undone — ${u.restored} rule(s) put back.` });
                  void fetchRules();
                } catch {
                  toast.show({ message: 'Undo failed. You can also undo from Backups.' });
                }
              },
            }
          : {}),
      },
      30_000,
    );
  }

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
    setImportCsv({ text: await file.text(), name: file.name, mode: 'update' });
  }

  async function onReplaceFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportCsv({ text: await file.text(), name: file.name, mode: 'replace' });
  }

  function onApplied(result: ImportApplyResult) {
    setImportCsv(null);
    void fetchRules();
    // ★v1.8: both modes are backed up, so both undo from the backup.
    const archived = result.archived ? `, ${result.archived} archived (kept, not deleted)` : '';
    const skipped = result.skipped ? `, ${result.skipped} row(s) skipped` : '';
    showBulkUndo(
      `Imported: ${result.applied} updated, ${result.added ?? 0} added${archived}${skipped}.`,
      result.snapshot_id,
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
                Upload CSV
              </button>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => void onFile(e)}
              />
              <input
                ref={replaceFileRef}
                type="file"
                accept=".csv,text/csv"
                style={{ display: 'none' }}
                onChange={(e) => void onReplaceFile(e)}
              />
              <div className="menu-wrap">
                <button
                  className="btn btn-sm"
                  aria-haspopup="menu"
                  aria-expanded={bulkOpen}
                  onClick={() => setBulkOpen((o) => !o)}
                >
                  Bulk actions ▾
                </button>
                {bulkOpen ? (
                  <div className="menu" role="menu" onClick={() => setBulkOpen(false)}>
                    <button role="menuitem" onClick={() => replaceFileRef.current?.click()}>
                      Replace all from CSV…
                    </button>
                    <button role="menuitem" onClick={() => setDisabling(true)} disabled={disableTargets.length === 0}>
                      Disable all in this view ({disableTargets.length})…
                    </button>
                    <button role="menuitem" onClick={() => setConfirmAll('archive')} disabled={liveCount === 0}>
                      Archive all ({liveCount})…
                    </button>
                    <button role="menuitem" onClick={() => setBackupsOpen(true)}>
                      Backups…
                    </button>
                    <hr className="menu-sep" />
                    <button
                      role="menuitem"
                      className="menu-danger"
                      onClick={() => setConfirmAll('delete')}
                      disabled={archivedCount === 0}
                    >
                      Delete archived rules permanently ({archivedCount})…
                    </button>
                  </div>
                ) : null}
              </div>
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
        <div className="field">
          <label htmlFor="kb-status">Status</label>
          <select
            id="kb-status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          >
            {(Object.keys(STATUS_FILTER_LABEL) as StatusFilter[]).map((k) => (
              <option key={k} value={k}>
                {STATUS_FILTER_LABEL[k]}
              </option>
            ))}
          </select>
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
                        <span
                          className={`badge status-${r.status === 'active' ? 'resolved' : r.status === 'disabled' || r.status === 'archived' ? 'closed' : 'escalated'}`}
                        >
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
                  All ({statusRules.length})
                </button>
              </li>
              {categories.map((cat) => (
                <li key={cat}>
                  <button
                    className={`nav-link${activeCategory === cat ? ' active' : ''}`}
                    onClick={() => setActiveCategory(cat)}
                  >
                    {cat} ({statusRules.filter((r) => r.category === cat).length})
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
          mode={importCsv.mode}
          onClose={() => setImportCsv(null)}
          onApplied={onApplied}
        />
      ) : null}
      {disabling ? (
        <DisableViewDialog
          ids={disableTargets.map((r) => r.id)}
          description={viewDescription}
          usableAfter={usableAfterDisable}
          onClose={() => setDisabling(false)}
          onDone={(result) => {
            setDisabling(false);
            void fetchRules();
            showBulkUndo(`Disabled ${result.disabled} rule(s) (kept, not deleted).`, result.snapshot_id);
          }}
        />
      ) : null}
      {confirmAll ? (
        <ConfirmAllDialog
          kind={confirmAll}
          count={confirmAll === 'archive' ? liveCount : archivedCount}
          onClose={() => setConfirmAll(null)}
          onDone={(r) => {
            const kind = confirmAll;
            setConfirmAll(null);
            void fetchRules();
            showBulkUndo(
              kind === 'archive'
                ? `Archived ${r.count} rule(s) (kept, not deleted). The bot now passes every question to staff.`
                : `Permanently deleted ${r.count} archived rule(s). Change history is kept.`,
              r.snapshot_id,
            );
          }}
        />
      ) : null}
      {backupsOpen ? (
        <BackupsDialog
          onClose={() => setBackupsOpen(false)}
          onChanged={(message) => {
            toast.show({ message });
            void fetchRules();
          }}
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
