import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import type { ConvStatus, KbRule, Staff } from '@vertex/shared';
import { api, type ConversationDetail, type DetailMessage } from '../lib/api';
import { languageName, topicLabel } from '../lib/categories';
import { contactLine, customerLabel } from '../lib/customer';
import { formatTime } from '../lib/time';
import { templatesFor } from '../lib/templates';
import { markSeen } from '../lib/seen';
import { useAuth } from '../lib/auth';
import { useToast } from '../components/Toast';
import { StatusBadge } from '../components/StatusBadge';
import { ErrorState } from '../components/states';
import { RuleDialog } from '../components/RuleDialog';

type Load = 'loading' | 'ready' | 'error';

export function Conversation() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const toast = useToast();
  const { staff } = useAuth();
  const isAdmin = staff?.role === 'admin';

  const [detail, setDetail] = useState<ConversationDetail | null>(null);
  const [load, setLoad] = useState<Load>('loading');

  const [reply, setReply] = useState('');
  const [translateOn, setTranslateOn] = useState(false);
  const [translations, setTranslations] = useState<Record<number, string>>({});
  const [drafting, setDrafting] = useState(false);
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [editingRule, setEditingRule] = useState<KbRule | null>(null);
  const rulesCache = useRef<Map<string, KbRule> | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const fetchDetail = useCallback(async () => {
    setLoad('loading');
    try {
      const d = await api.getConversation(id);
      setDetail(d);
      setReply(d.draft);
      setLoad('ready');
      markSeen(id);
    } catch {
      setLoad('error');
    }
  }, [id]);

  useEffect(() => {
    void fetchDetail();
  }, [fetchDetail]);

  // Autosave the draft to reply_drafts every 3s after edits (§7.3). Skips the
  // initial hydrate so we don't immediately re-write the loaded draft.
  const lastSaved = useRef<string | null>(null);
  useEffect(() => {
    if (load !== 'ready') return;
    if (lastSaved.current === null) {
      lastSaved.current = reply;
      return;
    }
    if (reply === lastSaved.current) return;
    const t = setTimeout(() => {
      lastSaved.current = reply;
      void api.saveDraft(id, reply).catch(() => {});
    }, 3000);
    return () => clearTimeout(t);
  }, [reply, id, load]);

  const toggleTranslate = useCallback(async () => {
    const next = !translateOn;
    setTranslateOn(next);
    if (!next || !detail) return;
    const pending = detail.messages.filter((m) => m.sender === 'customer' && !(m.id in translations));
    const results = await Promise.all(
      pending.map(async (m) => {
        try {
          const { translation } = await api.translate(id, m.body);
          return [m.id, translation] as const;
        } catch {
          return [m.id, '(translation unavailable)'] as const;
        }
      }),
    );
    if (results.length) setTranslations((prev) => ({ ...prev, ...Object.fromEntries(results) }));
  }, [translateOn, detail, translations, id]);

  const openRule = useCallback(async (ruleId: string) => {
    if (!rulesCache.current) {
      const { rules } = await api.listRules();
      rulesCache.current = new Map(rules.map((r) => [r.id, r]));
    }
    const rule = rulesCache.current.get(ruleId);
    if (rule) setEditingRule(rule);
  }, []);

  function insertTemplate(text: string) {
    const el = textareaRef.current;
    const pos = el ? el.selectionStart : reply.length;
    setReply((r) => r.slice(0, pos) + text + r.slice(pos));
    setShowTemplates(false);
  }

  async function generateDraft() {
    setDrafting(true);
    try {
      const { draft } = await api.aiDraft(id);
      // Insert-only: never auto-send (Hard rule 4). Staff must edit + send.
      setReply((r) => (r.trim() ? `${r}\n\n${draft}` : draft));
    } catch {
      toast.show({ message: 'Could not generate a draft. Try again.' });
    } finally {
      setDrafting(false);
    }
  }

  async function send() {
    if (!reply.trim()) return;
    setSending(true);
    try {
      await api.reply(id, reply.trim());
      lastSaved.current = '';
      setReply('');
      await fetchDetail();
    } catch {
      toast.show({ message: 'Could not send. Please try again.' });
    } finally {
      setSending(false);
    }
  }

  const changeStatus = useCallback(
    async (status: ConvStatus) => {
      await api.patchConversation(id, { status });
      await fetchDetail();
    },
    [id, fetchDetail],
  );

  // Resolve: immediate, no confirm dialog, with a 5s Undo toast (§7.3).
  async function resolve() {
    const prev = detail?.conversation.status ?? 'escalated';
    await changeStatus('resolved');
    toast.show(
      {
        message: 'Marked resolved.',
        actionLabel: 'Undo',
        onAction: () => void changeStatus(prev),
      },
      5000,
    );
  }

  if (load === 'loading') {
    return (
      <>
        <div className="page-head">
          <h1>Conversation</h1>
        </div>
        <div className="skeleton" style={{ height: 300 }} />
      </>
    );
  }
  if (load === 'error' || !detail) {
    return <ErrorState onRetry={() => void fetchDetail()} />;
  }

  const { conversation, messages } = detail;

  return (
    <>
      <div className="page-head">
        <div className="row wrap" style={{ gap: 12 }}>
          <button className="btn btn-sm btn-ghost" onClick={() => navigate('/inbox')}>
            ← Inbox
          </button>
          <h1>{topicLabel(conversation.topic_category)}</h1>
          <StatusBadge status={conversation.status} />
          <span className="muted">
            {conversation.channel}
            {conversation.source_tag ? ` · ${conversation.source_tag}` : ''} ·{' '}
            {languageName(conversation.language)}
          </span>
        </div>
        <label className="row">
          <input type="checkbox" checked={translateOn} onChange={() => void toggleTranslate()} />
          Translate
        </label>
      </div>

      <div className="row wrap" style={{ gap: 8, marginBottom: 'var(--sp-4)' }}>
        <strong>{customerLabel(conversation)}</strong>
        {contactLine(conversation) ? (
          <span className="muted">· {contactLine(conversation)}</span>
        ) : (
          <span className="muted">· no contact left</span>
        )}
      </div>

      <div className="detail-grid">
        <section className="thread" aria-label="Messages">
          {messages.map((m) => (
            <Message
              key={m.id}
              m={m}
              translation={translateOn ? translations[m.id] : undefined}
              isAdmin={isAdmin}
              onRule={openRule}
            />
          ))}
        </section>

        <aside className="composer" aria-label="Reply">
          <div className="row wrap">
            <button className="btn btn-sm" onClick={() => void generateDraft()} disabled={drafting}>
              {drafting ? 'Drafting…' : 'AI draft'}
            </button>
            <div style={{ position: 'relative' }}>
              <button className="btn btn-sm" onClick={() => setShowTemplates((v) => !v)}>
                Templates
              </button>
              {showTemplates ? (
                <div className="table-wrap" style={{ position: 'absolute', zIndex: 10, marginTop: 4, minWidth: 180 }}>
                  {templatesFor(conversation.language).map((t) => (
                    <button
                      key={t.label}
                      className="btn btn-sm btn-ghost"
                      style={{ display: 'block', width: '100%', textAlign: 'left' }}
                      onClick={() => insertTemplate(t.text)}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={reply}
            onChange={(e) => setReply(e.target.value)}
            placeholder="Write a reply…"
            aria-label="Reply text"
          />
          <div className="autosave-note">Draft saves automatically every few seconds.</div>

          <div className="composer-actions">
            <button className="btn btn-primary" onClick={() => void send()} disabled={sending || !reply.trim()}>
              {sending ? 'Sending…' : 'Send'}
            </button>
          </div>

          <hr style={{ border: 'none', borderTop: '1px solid var(--line)', width: '100%' }} />
          <ReassignControl
            conversationId={id}
            currentStaffId={staff?.userId ?? null}
            assigned={conversation.assigned_staff}
            onChanged={() => void fetchDetail()}
          />
          <div className="composer-actions">
            <button className="btn btn-sm" onClick={() => void resolve()}>
              Resolve
            </button>
            <button className="btn btn-sm" onClick={() => void changeStatus('escalated')}>
              Reopen
            </button>
          </div>
        </aside>
      </div>

      {editingRule ? (
        <RuleDialog
          rule={editingRule}
          onClose={() => setEditingRule(null)}
          onSaved={(u) => {
            rulesCache.current?.set(u.id, u);
            setEditingRule(null);
            toast.show({ message: `Rule ${u.id} saved.` });
          }}
        />
      ) : null}
    </>
  );
}

function Message({
  m,
  translation,
  isAdmin,
  onRule,
}: {
  m: DetailMessage;
  translation: string | undefined;
  isAdmin: boolean;
  onRule: (ruleId: string) => void;
}) {
  const senderLabel =
    m.sender === 'ai' ? 'AI' : m.sender === 'staff' ? 'Staff' : m.sender === 'system' ? '' : 'Customer';
  const ruleIds = m.ai_meta?.rule_ids ?? [];
  return (
    <div className={`msg ${m.sender}`}>
      {m.sender !== 'system' ? (
        <div className="msg-meta">
          {m.sender === 'ai' ? <span className="ai-dot" aria-hidden="true" /> : null}
          <span>{senderLabel}</span>
          <span>·</span>
          <span>{formatTime(m.created_at)}</span>
        </div>
      ) : null}
      <div lang={m.sender === 'customer' ? undefined : 'en'}>{m.body}</div>
      {translation !== undefined ? (
        <div className="msg-translation" lang="en">
          {translation || 'Translating…'}
        </div>
      ) : null}
      {ruleIds.length ? (
        <div className="rule-chips">
          {ruleIds.map((rid) =>
            isAdmin ? (
              <button key={rid} className="chip" onClick={() => onRule(rid)} title="Edit this rule">
                {rid}
              </button>
            ) : (
              <span key={rid} className="chip" style={{ cursor: 'default', color: 'var(--ink-muted)' }}>
                {rid}
              </span>
            ),
          )}
        </div>
      ) : null}
    </div>
  );
}

function ReassignControl({
  conversationId,
  currentStaffId,
  assigned,
  onChanged,
}: {
  conversationId: string;
  currentStaffId: string | null;
  assigned: string | null;
  onChanged: () => void;
}) {
  const [staffList, setStaffList] = useState<Staff[] | null>(null);

  useEffect(() => {
    // Staff list is admin-only; degrade gracefully to "Assign to me" for staff.
    api
      .listStaff()
      .then(({ staff }) => setStaffList(staff))
      .catch(() => setStaffList([]));
  }, []);

  async function assign(value: string) {
    await api.patchConversation(conversationId, { assigned_staff: value || null });
    onChanged();
  }

  return (
    <div className="field">
      <label htmlFor="reassign">Assigned to</label>
      {staffList && staffList.length > 0 ? (
        <select id="reassign" value={assigned ?? ''} onChange={(e) => void assign(e.target.value)}>
          <option value="">Unassigned</option>
          {staffList.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
      ) : (
        <div className="row">
          <button className="btn btn-sm" onClick={() => void assign(currentStaffId ?? '')} disabled={!currentStaffId}>
            Assign to me
          </button>
          {assigned ? (
            <button className="btn btn-sm btn-ghost" onClick={() => void assign('')}>
              Unassign
            </button>
          ) : null}
        </div>
      )}
    </div>
  );
}
