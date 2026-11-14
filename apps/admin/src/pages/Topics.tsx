import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  OTHERS_TILE_ID,
  TILE_ICONS,
  TILE_LANGUAGES,
  TILE_LIMITS,
  tileIconPaths,
} from '@vertex/shared/tiles';
import {
  api,
  ApiError,
  type AdminTile,
  type AiPublishResult,
  type TileInput,
  type TilesState,
} from '../lib/api';
import { LANGUAGE_NAMES } from '../lib/categories';
import { Dialog } from '../components/Dialog';
import { ErrorState, TableSkeleton } from '../components/states';
import { useToast } from '../components/Toast';

type Load = 'loading' | 'ready' | 'error' | 'not_ready';

/** The fixed set of tile icons, drawn like the customer chat draws them. */
export function TileIcon({ name, size = 20 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {tileIconPaths(name).map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

/** Codes that bring knowledge of their own (GN is shared by every topic). */
function ownCodes(codes: string[]): string[] {
  return codes.filter((c) => c !== 'GN' && c !== '*');
}

/**
 * True when the chosen knowledge has no rule the bot can use, so every customer
 * who taps the tile goes to staff (same rule as the server's no_knowledge).
 */
export function wouldHaveNoKnowledge(
  tile: Pick<AdminTile, 'scope_of' | 'behavior' | 'kb_categories'> | null,
  codes: string[],
  counts: Map<string, number>,
): boolean {
  if (tile?.scope_of || tile?.behavior === 'free_text') return false;
  if ((tile?.kb_categories ?? []).some((c) => c !== '*' && c !== 'GENERAL RULES')) return false;
  return ownCodes(codes).reduce((n, c) => n + (counts.get(c) ?? 0), 0) === 0;
}

/**
 * ★2026-11-14 admin "Topics": the tiles customers see in the chat. CS adds,
 * edits, reorders and hides tiles, picks their knowledge (topic codes) and
 * writes their Topic instructions in one place. Tile changes reach the chat at
 * once; Topic instructions go live through Publish (safety check).
 */
export function Topics() {
  const [data, setData] = useState<TilesState | null>(null);
  const [load, setLoad] = useState<Load>('loading');
  const [editing, setEditing] = useState<AdminTile | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResult, setPublishResult] = useState<AiPublishResult | null>(null);
  const toast = useToast();

  const fetchData = useCallback(async () => {
    try {
      setData(await api.tiles());
      setLoad('ready');
    } catch (e) {
      setLoad(e instanceof ApiError && e.code === 'tiles_not_ready' ? 'not_ready' : 'error');
    }
  }, []);

  useEffect(() => {
    void fetchData();
  }, [fetchData]);

  const counts = useMemo(
    () => new Map((data?.codes ?? []).map((c) => [c.code, c.rule_count])),
    [data],
  );
  const labelOf = (id: string) => data?.tiles.find((t) => t.id === id)?.labels.en ?? id;
  const unpublished = (data?.tiles ?? []).filter(
    (t) => t.instructions !== t.instructions_published,
  );

  const move = async (index: number, delta: -1 | 1) => {
    if (!data) return;
    const movable = data.tiles.filter((t) => t.id !== OTHERS_TILE_ID).map((t) => t.id);
    const j = index + delta;
    if (j < 0 || j >= movable.length) return;
    [movable[index], movable[j]] = [movable[j]!, movable[index]!];
    setBusy(true);
    try {
      await api.reorderTiles(movable);
      await fetchData();
    } catch {
      toast.show({ message: 'Order not saved. Reload and try again.' });
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!data?.latest_version) return;
    setPublishing(true);
    setPublishResult(null);
    try {
      const r = await api.publishAiBehaviour(data.latest_version.id);
      setPublishResult(r);
      if (r.published) toast.show({ message: 'Published. Customers get the new Topic instructions now.' });
      await fetchData();
    } catch {
      toast.show({ message: 'Could not publish. Please try again.' });
    } finally {
      setPublishing(false);
    }
  };

  if (load === 'loading') return <TableSkeleton cols={5} />;
  if (load === 'error') return <ErrorState onRetry={() => void fetchData()} />;
  if (load === 'not_ready')
    return (
      <div className="notice-warn" role="status">
        Topics are not set up in the database yet. Ask the developer to apply the latest update.
      </div>
    );

  const tiles = data!.tiles;
  return (
    <>
      <div className="page-head">
        <h1>Topics</h1>
        <button className="btn btn-primary" onClick={() => setEditing('new')}>
          Add topic
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        The buttons customers see in the chat. Saved changes appear the next time a customer opens
        the chat (within about a minute). &ldquo;Something else&rdquo; is always last.
      </p>

      {unpublished.length > 0 ? (
        <div className="notice-warn" role="status" style={{ marginBottom: 'var(--sp-4)' }}>
          <strong>Topic instructions not live yet:</strong>{' '}
          {unpublished.map((t) => t.labels.en).join(', ')}. Publish runs the safety check (5 AI
          requests) and then customers get them.
          {unpublished.some((t) => t.other_unpublished_changes) ||
          tiles.some((t) => t.other_unpublished_changes) ? (
            <div style={{ marginTop: 'var(--sp-1)' }}>
              Publishing also makes live the other unpublished changes in AI behaviour.
            </div>
          ) : null}
          <div style={{ marginTop: 'var(--sp-2)' }}>
            <button className="btn btn-sm btn-primary" disabled={publishing} onClick={() => void publish()}>
              {publishing ? 'Running the safety check…' : 'Publish'}
            </button>
          </div>
        </div>
      ) : null}
      {publishResult && !publishResult.published ? (
        <div className="notice-warn" role="alert" style={{ marginBottom: 'var(--sp-4)' }}>
          <strong>Not published — the safety check failed.</strong>
          <ul style={{ margin: 'var(--sp-1) 0 0' }}>
            {publishResult.report.checks
              .filter((c) => !c.pass)
              .map((c) => (
                <li key={c.id}>
                  {c.label}: {c.detail}
                </li>
              ))}
          </ul>
        </div>
      ) : null}

      <div className="table-wrap">
        <table className="data">
          <thead>
            <tr>
              <th style={{ width: 72 }}>Order</th>
              <th>Topic</th>
              <th>Knowledge</th>
              <th>In chat</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {tiles.map((t, i) => {
              const isOthers = t.id === OTHERS_TILE_ID;
              return (
                <tr key={t.id} style={{ cursor: 'default' }}>
                  <td>
                    {isOthers ? (
                      <span className="muted">Last</span>
                    ) : (
                      <div className="row">
                        <button
                          className="btn btn-sm btn-ghost"
                          aria-label={`Move ${t.labels.en} up`}
                          disabled={busy || i === 0}
                          onClick={() => void move(i, -1)}
                        >
                          ↑
                        </button>
                        <button
                          className="btn btn-sm btn-ghost"
                          aria-label={`Move ${t.labels.en} down`}
                          disabled={busy || i >= tiles.length - 2}
                          onClick={() => void move(i, 1)}
                        >
                          ↓
                        </button>
                      </div>
                    )}
                  </td>
                  <td>
                    <div className="row">
                      <TileIcon name={t.icon} />
                      <strong>{t.labels.en}</strong>
                    </div>
                  </td>
                  <td>
                    {isOthers ? (
                      <span className="muted">All knowledge</span>
                    ) : t.scope_of ? (
                      <span className="muted">Same as &ldquo;{labelOf(t.scope_of)}&rdquo;</span>
                    ) : (
                      <span>{ownCodes(t.id_prefixes).join(', ') || <span className="muted">—</span>}</span>
                    )}
                    {t.no_knowledge && t.enabled ? (
                      <div style={{ color: 'var(--warning)', fontSize: 'var(--font-aux)' }}>
                        ⚠ No knowledge — every customer goes to staff
                      </div>
                    ) : null}
                  </td>
                  <td>{t.enabled ? 'Shown' : <span className="muted">Hidden</span>}</td>
                  <td>
                    <button className="btn btn-sm" onClick={() => setEditing(t)}>
                      Edit
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {editing ? (
        <TileEditor
          tile={editing === 'new' ? null : editing}
          codes={data!.codes}
          counts={counts}
          scopeLabel={editing !== 'new' && editing.scope_of ? labelOf(editing.scope_of) : ''}
          limits={data!.instructions_limits}
          onClose={() => setEditing(null)}
          onSaved={async (msg) => {
            setEditing(null);
            toast.show({ message: msg });
            await fetchData();
          }}
        />
      ) : null}
    </>
  );
}

const linesOf = (text: string) =>
  text
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean);

function TileEditor({
  tile,
  codes,
  counts,
  scopeLabel,
  limits,
  onClose,
  onSaved,
}: {
  tile: AdminTile | null;
  codes: TilesState['codes'];
  counts: Map<string, number>;
  scopeLabel: string;
  limits: TilesState['instructions_limits'];
  onClose: () => void;
  onSaved: (message: string) => Promise<void>;
}) {
  const isOthers = tile?.id === OTHERS_TILE_ID;
  const fixedKnowledge = isOthers || Boolean(tile?.scope_of);
  const [labels, setLabels] = useState<Record<string, string>>({ ...(tile?.labels ?? {}) });
  const [icon, setIcon] = useState(tile?.icon ?? 'ti-message-circle');
  const [picked, setPicked] = useState<string[]>(tile ? tile.id_prefixes : ['GN']);
  const [questions, setQuestions] = useState<Record<string, string>>(
    Object.fromEntries(TILE_LANGUAGES.map((l) => [l, (tile?.sub_questions[l] ?? []).join('\n')])),
  );
  const [enabled, setEnabled] = useState(tile?.enabled ?? true);
  const [instructions, setInstructions] = useState(tile?.instructions ?? '');
  const [saving, setSaving] = useState(false);
  const [translating, setTranslating] = useState(false);
  const [error, setError] = useState('');
  const [confirmEmpty, setConfirmEmpty] = useState(false);
  const toast = useToast();

  const noKnowledge = enabled && !fixedKnowledge && wouldHaveNoKnowledge(tile, picked, counts);
  const enQuestions = linesOf(questions.en ?? '');
  const tooMany = TILE_LANGUAGES.some((l) => linesOf(questions[l] ?? '').length > TILE_LIMITS.subQuestions);

  const toggleCode = (code: string) =>
    setPicked((p) => (p.includes(code) ? p.filter((c) => c !== code) : [...p, code]));

  const translate = async () => {
    if (!labels.en?.trim()) return setError('Write the English label first.');
    setTranslating(true);
    setError('');
    try {
      const r = await api.translateTile(labels.en.trim(), enQuestions);
      setLabels((cur) => {
        const next = { ...cur };
        for (const [l, v] of Object.entries(r.labels)) if (!next[l]?.trim()) next[l] = v;
        return next;
      });
      setQuestions((cur) => {
        const next = { ...cur };
        for (const [l, v] of Object.entries(r.sub_questions))
          if (!next[l]?.trim()) next[l] = v.join('\n');
        return next;
      });
      toast.show({ message: 'Translations added to the empty boxes. Please check them before saving.' });
    } catch (e) {
      const msg =
        e instanceof ApiError && (e.body as { message?: string } | null)?.message
          ? (e.body as { message: string }).message
          : 'Could not translate right now.';
      setError(msg);
    } finally {
      setTranslating(false);
    }
  };

  const save = async (confirmed = false) => {
    setError('');
    if (!labels.en?.trim()) return setError('Write the English label.');
    if (tooMany) return setError(`Up to ${TILE_LIMITS.subQuestions} sample questions per language.`);
    if (instructions.length > limits.max)
      return setError(`Topic instructions can be at most ${limits.max.toLocaleString()} characters.`);
    if (noKnowledge && !confirmed) return setConfirmEmpty(true);
    setConfirmEmpty(false);
    const body: TileInput = {
      labels,
      icon,
      id_prefixes: picked,
      sub_questions: Object.fromEntries(TILE_LANGUAGES.map((l) => [l, linesOf(questions[l] ?? '')])),
      enabled,
    };
    setSaving(true);
    try {
      const res = tile ? await api.updateTile(tile.id, body) : await api.createTile(body);
      const id = res.tile.id;
      let draft = false;
      if (instructions.trim() !== (tile?.instructions ?? '').trim()) {
        const r = await api.saveTileInstructions(id, instructions);
        draft = !r.unchanged;
      }
      await onSaved(
        `${tile ? 'Saved' : 'Topic added'}. The chat shows it now.` +
          (draft ? ' Topic instructions saved as a draft — Publish to make them live.' : ''),
      );
    } catch (e) {
      const msg =
        e instanceof ApiError && (e.body as { message?: string } | null)?.message
          ? (e.body as { message: string }).message
          : 'Not saved. Please try again.';
      setError(msg);
    } finally {
      setSaving(false);
    }
  };

  const title = tile ? `Edit topic: ${tile.labels.en}` : 'Add a topic';
  return (
    <Dialog title={title} onClose={onClose}>
      <div className="stack" style={{ minWidth: 'min(720px, 90vw)', maxHeight: '75vh', overflowY: 'auto' }}>
        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>1. Button text</strong> (English is required; an empty language shows English)</legend>
          {TILE_LANGUAGES.map((l) => (
            <label key={l} className="field">
              <span>{LANGUAGE_NAMES[l]}</span>
              <input
                type="text"
                lang={l}
                maxLength={TILE_LIMITS.label}
                value={labels[l] ?? ''}
                placeholder={l === 'en' ? 'e.g. Holiday plans' : '(shows English)'}
                onChange={(e) => setLabels({ ...labels, [l]: e.target.value })}
              />
            </label>
          ))}
        </fieldset>

        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>2. Icon</strong></legend>
          <div className="row wrap" role="radiogroup" aria-label="Icon">
            {Object.entries(TILE_ICONS).map(([id, ic]) => (
              <button
                key={id}
                type="button"
                role="radio"
                aria-checked={icon === id}
                aria-label={ic.name}
                title={ic.name}
                className={`chip${icon === id ? ' active' : ''}`}
                style={{ padding: 6 }}
                onClick={() => setIcon(id)}
              >
                <TileIcon name={id} />
              </button>
            ))}
          </div>
        </fieldset>

        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>3. Knowledge</strong> — the rules the bot uses for this topic (by Rule ID code)</legend>
          {isOthers ? (
            <p className="muted">&ldquo;Something else&rdquo; always uses all knowledge.</p>
          ) : tile?.scope_of ? (
            <p className="muted">Uses the same knowledge as &ldquo;{scopeLabel}&rdquo; (only the sample questions differ).</p>
          ) : (
            <div className="stack" style={{ gap: 'var(--sp-1)' }}>
              {codes
                .filter((c) => c.code !== 'OT')
                .map((c) => (
                  <label key={c.code} className="row">
                    <input type="checkbox" checked={picked.includes(c.code)} onChange={() => toggleCode(c.code)} />
                    <span>
                      <strong>{c.code}</strong> {c.label}{' '}
                      <span className="muted">
                        {c.code === 'GN'
                          ? '— general, useful on every topic'
                          : `— ${c.rule_count} rule${c.rule_count === 1 ? '' : 's'} the bot can use`}
                      </span>
                    </span>
                  </label>
                ))}
            </div>
          )}
          {noKnowledge ? (
            <div className="notice-warn" role="alert">
              ⚠ The chosen knowledge has no rule the bot can use. Customers who tap this topic will
              all be handed to staff.
            </div>
          ) : null}
        </fieldset>

        <fieldset className="field" style={{ border: 0, padding: 0 }}>
          <legend><strong>4. Sample questions</strong> — one per line, up to {TILE_LIMITS.subQuestions}. Customers tap them after choosing the topic.</legend>
          {TILE_LANGUAGES.map((l) => (
            <label key={l} className="field">
              <span>{LANGUAGE_NAMES[l]}</span>
              <textarea
                lang={l}
                rows={l === 'en' ? 4 : 2}
                value={questions[l] ?? ''}
                placeholder={l === 'en' ? 'How do I apply?' : '(shows English)'}
                onChange={(e) => setQuestions({ ...questions, [l]: e.target.value })}
              />
            </label>
          ))}
          <div>
            <button type="button" className="btn btn-sm" disabled={translating} onClick={() => void translate()}>
              {translating ? 'Translating…' : 'Translate empty languages from English'}
            </button>{' '}
            <span className="muted">Uses 1 AI request. Fills only the empty boxes.</span>
          </div>
        </fieldset>

        <label className="row">
          <input
            type="checkbox"
            checked={enabled}
            disabled={isOthers}
            onChange={(e) => setEnabled(e.target.checked)}
          />
          <span>
            <strong>5. Show in the chat</strong>{' '}
            <span className="muted">(untick to hide it; nothing is deleted)</span>
          </span>
        </label>

        <label className="field">
          <span>
            <strong>6. Topic instructions</strong> — how the bot should handle this topic (what to ask
            first, what never to do). Same as the topic&rsquo;s tab in AI behaviour.
          </span>
          <textarea
            rows={8}
            value={instructions}
            onChange={(e) => setInstructions(e.target.value)}
            placeholder="e.g. First ask whether the customer is still in Japan."
          />
          <span className="muted">
            {instructions.length.toLocaleString()} characters
            {instructions.length > limits.topicTarget ? ` — over the ${limits.topicTarget.toLocaleString()} guide` : ''}.
            Saved as a draft; customers get it after Publish (safety check).
          </span>
        </label>

        {error ? (
          <div className="notice-warn" role="alert">
            {error}
          </div>
        ) : null}
        {confirmEmpty ? (
          <div className="notice-warn" role="alert">
            <strong>Customers who tap this topic will all be handed to staff</strong> — its knowledge
            has no rule the bot can use yet. Save anyway?
            <div className="row" style={{ marginTop: 'var(--sp-2)' }}>
              <button className="btn btn-sm btn-primary" disabled={saving} onClick={() => void save(true)}>
                Save anyway
              </button>
              <button className="btn btn-sm" onClick={() => setConfirmEmpty(false)}>
                Go back
              </button>
            </div>
          </div>
        ) : null}
        <div className="row" style={{ justifyContent: 'flex-end' }}>
          <button className="btn" onClick={onClose}>
            Cancel
          </button>
          <button className="btn btn-primary" disabled={saving} onClick={() => void save()}>
            {saving ? 'Saving…' : tile ? 'Save' : 'Add topic'}
          </button>
        </div>
      </div>
    </Dialog>
  );
}
