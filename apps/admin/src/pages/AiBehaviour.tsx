import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  api,
  type AiBehaviourState,
  type AiBehaviourVersion,
  type AiBehaviourVersionSummary,
  type AiSafetyReport,
  type AiTryResult,
} from '../lib/api';
import { formatTime } from '../lib/time';
import { hasChanges, lineDiff } from '../lib/lineDiff';
import { Dialog } from '../components/Dialog';
import { ErrorState, TableSkeleton } from '../components/states';
import { useToast } from '../components/Toast';

type Load = 'loading' | 'ready' | 'error';

/** Rough token estimate shown next to each box (English text ≈ 4 chars/token). */
const tokens = (chars: number) => Math.round(chars / 4);

function Counter({ value, target, max }: { value: string; target: number; max: number }) {
  const n = value.length;
  const tone = n > max ? 'var(--danger)' : n > target ? 'var(--warning)' : 'var(--ink-muted)';
  return (
    <div style={{ fontSize: 12, color: tone, marginTop: 4 }}>
      {n.toLocaleString()} characters (≈ {tokens(n).toLocaleString()} tokens) · recommended up to{' '}
      {target.toLocaleString()} · limit {max.toLocaleString()}
      {n > max ? ' — too long to save' : n > target ? ' — longer than recommended; long text slows the bot down' : ''}
    </div>
  );
}

function SafetyReportPanel({ report, published }: { report: AiSafetyReport; published: boolean | null }) {
  return (
    <div className="table-wrap" style={{ padding: 'var(--sp-4)', marginTop: 'var(--sp-4)' }} role="status">
      <strong>
        {published === null
          ? 'Last safety test'
          : published
            ? 'Published — all safety tests passed.'
            : 'Not published — some safety tests failed. Fix the text and try again.'}
      </strong>
      <ul style={{ listStyle: 'none', padding: 0, margin: 'var(--sp-2) 0 0' }}>
        {report.checks.map((c) => (
          <li key={c.id} style={{ marginBottom: 'var(--sp-2)' }}>
            <span style={{ color: c.pass ? 'var(--success)' : 'var(--danger)', fontWeight: 600 }}>
              {c.pass ? '✓' : '✗'}
            </span>{' '}
            {c.label}
            {!c.pass ? <div className="muted">{c.detail}</div> : null}
            {c.excerpt ? (
              <div className="muted" style={{ fontStyle: 'italic' }}>
                Reply: “{c.excerpt}”
              </div>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}

/**
 * AI behaviour (spec v1.8 §7.8, admin only). CS edits ② common behaviour and
 * ③ per-topic guidance; ① safety rules are shown read-only. Saving creates a
 * draft version; Publish runs the safety tests and only goes live if all pass.
 */
export function AiBehaviour() {
  const toast = useToast();
  const [state, setState] = useState<AiBehaviourState | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [common, setCommon] = useState('');
  const [topics, setTopics] = useState<Record<string, string>>({});
  const [baseId, setBaseId] = useState<number | null>(null);
  const [savedSnapshot, setSavedSnapshot] = useState('');
  const [activeTopic, setActiveTopic] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState<'saving' | 'publishing' | null>(null);
  const [report, setReport] = useState<{ report: AiSafetyReport; published: boolean | null } | null>(null);
  const [diffFor, setDiffFor] = useState<AiBehaviourVersionSummary | null>(null);
  const [restoreFor, setRestoreFor] = useState<AiBehaviourVersionSummary | null>(null);

  const editorKey = (c: string, t: Record<string, string>) => JSON.stringify([c, t]);

  const fetchState = useCallback(async (resetEditor: boolean) => {
    try {
      const s = await api.getAiBehaviour();
      setState(s);
      if (resetEditor) {
        const v = s.latest;
        const c = v ? v.common_behaviour : s.default_common_behaviour;
        const t = v ? { ...v.topic_instructions } : {};
        setCommon(c);
        setTopics(t);
        setBaseId(v?.id ?? null);
        setSavedSnapshot(editorKey(c, t));
        setActiveTopic((cur) => cur || s.topics[0]?.id || '');
        if (v?.safety_report) setReport({ report: v.safety_report, published: null });
      }
      setLoad('ready');
    } catch {
      setLoad('error');
    }
  }, []);

  useEffect(() => {
    void fetchState(true);
  }, [fetchState]);

  const dirty = editorKey(common, topics) !== savedSnapshot;
  const limits = state?.limits;
  const tooLong =
    !!limits && (common.length > limits.max || Object.values(topics).some((t) => t.length > limits.max));
  const latestIsDraft = state?.latest?.state === 'draft';

  async function save(): Promise<number | null> {
    setBusy('saving');
    try {
      const cleaned = Object.fromEntries(Object.entries(topics).filter(([, v]) => v.trim() !== ''));
      const { version } = await api.saveAiBehaviour({
        common_behaviour: common,
        topic_instructions: cleaned,
        note: note.trim(),
        based_on: baseId ?? undefined,
      });
      setBaseId(version.id);
      setSavedSnapshot(editorKey(common, topics));
      setNote('');
      await fetchState(false);
      toast.show({ message: `Saved as draft version #${version.id}. Customers are not affected until you publish.` });
      return version.id;
    } catch {
      toast.show({ message: 'Could not save. Check that no box is over the limit.' });
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function publish() {
    let id = baseId;
    if (dirty || !latestIsDraft) {
      id = dirty ? await save() : id;
      if (id === null) return;
    }
    if (id === null) return;
    setBusy('publishing');
    setReport(null);
    try {
      const r = await api.publishAiBehaviour(id);
      setReport({ report: r.report, published: r.published });
      toast.show({ message: r.published ? `Version #${id} is now live.` : 'Not published — see the safety test results.' });
      await fetchState(false);
    } catch {
      toast.show({ message: 'Could not run the safety tests. Nothing was published. Try again later.' });
    } finally {
      setBusy(null);
    }
  }

  if (load === 'loading') return <TableSkeleton cols={2} />;
  if (load === 'error' || !state || !limits) return <ErrorState onRetry={() => void fetchState(true)} />;

  const published = state.published;
  const topicLabel = (id: string) => state.topics.find((t) => t.id === id)?.label ?? id;

  return (
    <>
      <div className="page-head">
        <h1>AI behaviour</h1>
        <div className="row wrap" style={{ gap: 8 }}>
          <input
            type="text"
            placeholder="What did you change? (optional)"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            style={{ minWidth: 220 }}
            aria-label="Change note"
          />
          <button className="btn btn-sm" onClick={() => void save()} disabled={busy !== null || !dirty || tooLong}>
            {busy === 'saving' ? 'Saving…' : 'Save draft'}
          </button>
          <button
            className="btn btn-sm btn-primary"
            onClick={() => void publish()}
            disabled={busy !== null || tooLong || (!dirty && !latestIsDraft)}
          >
            {busy === 'publishing' ? 'Running safety tests…' : 'Publish'}
          </button>
        </div>
      </div>

      <p className="muted" style={{ marginTop: 0 }}>
        {published
          ? `Live: version #${published.id}, published ${formatTime(published.published_at ?? published.created_at)}.`
          : 'Nothing published yet — the bot uses its built-in default behaviour.'}{' '}
        {dirty ? 'You have unsaved changes.' : latestIsDraft ? `Draft #${state.latest!.id} is not published yet.` : ''}
      </p>
      <p className="muted">
        Publishing first runs 4 test questions with your text; it only goes live if all safety checks pass. Each test
        question and each “Try it” uses the AI’s daily allowance, which is shared with customers.
      </p>

      {report ? <SafetyReportPanel report={report.report} published={report.published} /> : null}

      <details className="table-wrap" style={{ padding: 'var(--sp-4)', marginTop: 'var(--sp-4)' }}>
        <summary>
          <strong>① Safety rules (fixed)</strong> — always applied last and override everything below. Not editable.
        </summary>
        <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12, marginTop: 'var(--sp-3)' }}>{state.fixed.safety_rules}</pre>
      </details>

      <section style={{ marginTop: 'var(--sp-6)' }}>
        <h2 style={{ fontSize: 16 }}>② Common behaviour</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Tone and how the bot talks with every customer, on every topic.
        </p>
        <textarea
          aria-label="Common behaviour"
          rows={16}
          value={common}
          onChange={(e) => setCommon(e.target.value)}
          style={{ width: '100%' }}
        />
        <Counter value={common} target={limits.commonTarget} max={limits.max} />
      </section>

      <section style={{ marginTop: 'var(--sp-6)' }}>
        <h2 style={{ fontSize: 16 }}>③ Topic instructions</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          Extra guidance used only when the customer is on that topic (e.g. which facts to ask for, in order).
        </p>
        <div className="tabs" style={{ flexWrap: 'wrap' }}>
          {state.topics.map((t) => (
            <button
              key={t.id}
              className={`tab${activeTopic === t.id ? ' active' : ''}`}
              onClick={() => setActiveTopic(t.id)}
            >
              {t.label}
              {topics[t.id]?.trim() ? ' •' : ''}
            </button>
          ))}
        </div>
        <textarea
          aria-label={`Instructions for ${topicLabel(activeTopic)}`}
          rows={14}
          value={topics[activeTopic] ?? ''}
          placeholder="No extra guidance for this topic."
          onChange={(e) => setTopics((cur) => ({ ...cur, [activeTopic]: e.target.value }))}
          style={{ width: '100%' }}
        />
        <Counter value={topics[activeTopic] ?? ''} target={limits.topicTarget} max={limits.max} />
      </section>

      <TryIt topics={state.topics} common={common} topicTexts={topics} defaultTopic={activeTopic} />

      <section style={{ marginTop: 'var(--sp-6)' }}>
        <h2 style={{ fontSize: 16 }}>Versions</h2>
        {state.versions.length === 0 ? (
          <p className="muted">No versions saved yet.</p>
        ) : (
          <div className="table-wrap">
            <table className="data">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Saved</th>
                  <th>Status</th>
                  <th>Note</th>
                  <th>Safety tests</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {state.versions.map((v) => (
                  <tr key={v.id} style={{ cursor: 'default' }}>
                    <td>{v.id}</td>
                    <td>
                      {formatTime(v.created_at)}
                      <div className="muted">{v.created_by_name || '—'}</div>
                    </td>
                    <td>
                      <span
                        className={`badge status-${v.state === 'published' ? 'resolved' : v.state === 'draft' ? 'escalated' : 'closed'}`}
                      >
                        {v.state === 'published' ? 'Live' : v.state === 'draft' ? 'Draft' : 'Old'}
                      </span>
                      {v.published_at ? <div className="muted">by {v.published_by_name || '—'}</div> : null}
                    </td>
                    <td>{v.note || '—'}</td>
                    <td>{v.safety_passed === null ? '—' : v.safety_passed ? '✓ passed' : '✗ failed'}</td>
                    <td>
                      <div className="row wrap" style={{ gap: 6 }}>
                        <button className="btn btn-sm" onClick={() => setDiffFor(v)}>
                          View changes
                        </button>
                        {v.state !== 'published' ? (
                          <button className="btn btn-sm btn-ghost" onClick={() => setRestoreFor(v)} disabled={busy !== null}>
                            Restore this version
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
      </section>

      {diffFor ? (
        <VersionDiffDialog
          version={diffFor}
          versions={state.versions}
          topicLabel={topicLabel}
          onClose={() => setDiffFor(null)}
        />
      ) : null}
      {restoreFor ? (
        <RestoreDialog
          version={restoreFor}
          onClose={() => setRestoreFor(null)}
          onDone={async (r) => {
            setRestoreFor(null);
            setReport({ report: r.report, published: r.published });
            toast.show({
              message: r.published ? `Version #${restoreFor.id} is live again.` : 'Not restored — see the safety test results.',
            });
            await fetchState(true);
          }}
        />
      ) : null}
    </>
  );
}

/** "Try it": one sandbox reply with the text currently in the editor (nothing is saved). */
function TryIt({
  topics,
  common,
  topicTexts,
  defaultTopic,
}: {
  topics: { id: string; label: string }[];
  common: string;
  topicTexts: Record<string, string>;
  defaultTopic: string;
}) {
  const [topic, setTopic] = useState(defaultTopic);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<AiTryResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setTopic((t) => t || defaultTopic), [defaultTopic]);

  async function run() {
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      setResult(
        await api.tryAiBehaviour({ question, topic, common_behaviour: common, topic_text: topicTexts[topic] ?? '' }),
      );
    } catch {
      setError('The bot could not reply (the AI may be busy or its daily allowance used up). Try again later.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="table-wrap" style={{ padding: 'var(--sp-4)', marginTop: 'var(--sp-6)' }}>
      <h2 style={{ fontSize: 16, marginTop: 0 }}>Try it</h2>
      <p className="muted" style={{ marginTop: 0 }}>
        Ask a question and see how the bot would answer with the text above — even before saving. Customers are not
        affected.
      </p>
      <div className="row wrap" style={{ gap: 8, alignItems: 'flex-end' }}>
        <div className="field">
          <label htmlFor="try-topic">Topic</label>
          <select id="try-topic" value={topic} onChange={(e) => setTopic(e.target.value)}>
            {topics.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field grow">
          <label htmlFor="try-question">Customer question</label>
          <input
            id="try-question"
            type="text"
            value={question}
            placeholder="e.g. I want to cancel my SIM. How much notice do I need?"
            onChange={(e) => setQuestion(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => void run()} disabled={busy || !question.trim()}>
          {busy ? 'Asking…' : 'Try it'}
        </button>
      </div>
      {error ? (
        <div className="state error" role="alert" style={{ padding: 'var(--sp-2) 0 0' }}>
          {error}
        </div>
      ) : null}
      {result ? (
        <div style={{ marginTop: 'var(--sp-3)' }}>
          <div className="muted">
            {result.action === 'escalate'
              ? `Would pass to staff (reason: ${result.reason})`
              : result.action === 'ask'
                ? 'Would ask a question first'
                : 'Would answer'}
            {result.rule_ids.length ? ` · rules used: ${result.rule_ids.join(', ')}` : ''}
            {!result.format_ok ? ' · ⚠ reply was not in the required format' : ''}
          </div>
          <div style={{ whiteSpace: 'pre-wrap', marginTop: 'var(--sp-2)' }}>{result.answer}</div>
          {result.follow_up ? (
            <div className="row wrap" style={{ gap: 6, marginTop: 'var(--sp-2)' }}>
              {result.follow_up.options.map((o) => (
                <span key={o} className="chip" style={{ cursor: 'default' }}>
                  {o}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** Line-by-line changes between a version and the one it was based on (or the previous one). */
function VersionDiffDialog({
  version,
  versions,
  topicLabel,
  onClose,
}: {
  version: AiBehaviourVersionSummary;
  versions: AiBehaviourVersionSummary[];
  topicLabel: (id: string) => string;
  onClose: () => void;
}) {
  const [pair, setPair] = useState<{ before: AiBehaviourVersion | null; after: AiBehaviourVersion } | null>(null);
  const [error, setError] = useState(false);
  const previousId = version.based_on ?? versions.find((v) => v.id < version.id)?.id ?? null;

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [after, before] = await Promise.all([
          api.getAiBehaviourVersion(version.id),
          previousId ? api.getAiBehaviourVersion(previousId) : Promise.resolve(null),
        ]);
        if (!cancelled) setPair({ after: after.version, before: before?.version ?? null });
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [version.id, previousId]);

  const sections = useMemo(() => {
    if (!pair) return [];
    const b = pair.before;
    const a = pair.after;
    const ids = [...new Set([...Object.keys(b?.topic_instructions ?? {}), ...Object.keys(a.topic_instructions)])];
    return [
      { title: '② Common behaviour', diff: lineDiff(b?.common_behaviour ?? '', a.common_behaviour) },
      ...ids.map((id) => ({
        title: `③ ${topicLabel(id)}`,
        diff: lineDiff(b?.topic_instructions?.[id] ?? '', a.topic_instructions[id] ?? ''),
      })),
    ].filter((s) => hasChanges(s.diff));
  }, [pair, topicLabel]);

  return (
    <Dialog
      title={`Version #${version.id} — changes${previousId ? ` since #${previousId}` : ' (first version)'}`}
      onClose={onClose}
    >
      {error ? (
        <div className="state error">Could not load the versions.</div>
      ) : !pair ? (
        <p className="muted">Loading…</p>
      ) : sections.length === 0 ? (
        <p className="muted">No text changes.</p>
      ) : (
        <div style={{ maxHeight: 420, overflow: 'auto' }}>
          {sections.map((s) => (
            <div key={s.title} style={{ marginBottom: 'var(--sp-4)' }}>
              <strong>{s.title}</strong>
              <pre className="line-diff">
                {s.diff.map((d, i) => (
                  <div key={i} className={`line-${d.type}`}>
                    {d.type === 'add' ? '+ ' : d.type === 'del' ? '− ' : '  '}
                    {d.text}
                  </div>
                ))}
              </pre>
            </div>
          ))}
        </div>
      )}
      <div className="dialog-actions">
        <button className="btn" onClick={onClose}>
          Close
        </button>
      </div>
    </Dialog>
  );
}

function RestoreDialog({
  version,
  onClose,
  onDone,
}: {
  version: AiBehaviourVersionSummary;
  onClose: () => void;
  onDone: (r: { published: boolean; report: AiSafetyReport }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  async function run() {
    setBusy(true);
    setError(false);
    try {
      onDone(await api.restoreAiBehaviour(version.id));
    } catch {
      setError(true);
      setBusy(false);
    }
  }
  return (
    <Dialog title={`Restore version #${version.id}?`} onClose={onClose}>
      <p>
        The text of version #{version.id} becomes a new version and is published after the safety tests pass. Uses the
        AI’s daily allowance (4 test questions).
      </p>
      {error ? <div className="state error">Could not restore. Nothing changed. Try again later.</div> : null}
      <div className="dialog-actions">
        <button className="btn" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn btn-primary" onClick={() => void run()} disabled={busy}>
          {busy ? 'Running safety tests…' : 'Restore and publish'}
        </button>
      </div>
    </Dialog>
  );
}
