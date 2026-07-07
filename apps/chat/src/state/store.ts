import { useCallback, useEffect, useReducer, useRef } from 'preact/hooks';
import type { LanguageCode } from '@vertex/shared';
import * as api from '../api/client';
import { getMessages } from '../i18n';
import { localizedCategories, type LocalizedCategory } from '../data/menuLocalized';
import { initialState, reducer, type ChatMessage } from './flow';

const STORAGE_KEY = 'vertex_chat_session';
const AI_TIMEOUT_MS = 15_000; // §6.3, criterion 10 (client-side safety net)
const POLL_MS = 5_000; // §6.3

interface Persisted {
  token: string;
  language: LanguageCode;
}

function loadPersisted(): Persisted | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Persisted) : null;
  } catch {
    return null;
  }
}

function savePersisted(p: Persisted): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(p));
  } catch {
    /* ignore quota / privacy-mode errors */
  }
}

function sourceTag(): string {
  try {
    return new URLSearchParams(window.location.search).get('src') ?? '';
  } catch {
    return '';
  }
}

/** session_token from the email deep link (?t=…, §8). Restores a prior chat. */
function linkToken(): string | null {
  try {
    return new URLSearchParams(window.location.search).get('t');
  } catch {
    return null;
  }
}

function toChatMessages(msgs: api.ApiMessage[]): ChatMessage[] {
  return msgs
    .filter((m) => !(m.sender === 'system' && m.body === '')) // hide escalation markers
    .map((m) => ({ key: `srv-${m.id}`, sender: m.sender, body: m.body }));
}

export function useChat() {
  const persisted = loadPersisted();
  // A ?t= link (from a staff-reply email) wins over localStorage so the customer
  // can reopen the conversation from the email on any device (§8).
  const restoreToken = linkToken() ?? persisted?.token ?? null;
  const restoreLanguage = persisted?.language ?? null;
  const [state, dispatch] = useReducer(
    reducer,
    initialState(restoreLanguage, restoreToken),
  );
  const t = getMessages(state.language ?? 'en');
  const lastFailedBody = useRef<string | null>(null);

  // Restore a prior session's messages (§6.3 session_token history restore).
  useEffect(() => {
    if (!restoreToken) return;
    let cancelled = false;
    api
      .getMessages(restoreToken)
      .then((res) => {
        if (cancelled) return;
        const msgs = toChatMessages(res.messages);
        const lastId = res.messages.reduce((m, x) => Math.max(m, x.id), 0);
        dispatch({ type: 'MERGE_MESSAGES', messages: msgs, lastMessageId: lastId, hasNewStaff: false });
        if (restoreLanguage) dispatch({ type: 'SELECT_LANGUAGE', language: restoreLanguage });
        // Persist the link token so polling/resend and later visits keep working.
        savePersisted({ token: restoreToken, language: restoreLanguage ?? 'en' });
      })
      .catch(() => {
        /* stale token — start fresh silently */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Offline / online banner + auto-resend on reconnect (§5.4/§6.3).
  // Driven solely by the browser's connectivity events, never by request errors.
  useEffect(() => {
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      dispatch({ type: 'SET_OFFLINE', offline: true });
    }
    const goOffline = () => dispatch({ type: 'SET_OFFLINE', offline: true });
    const goOnline = () => {
      dispatch({ type: 'SET_OFFLINE', offline: false });
      if (lastFailedBody.current) {
        const body = lastFailedBody.current;
        lastFailedBody.current = null;
        void send(body);
      }
    };
    window.addEventListener('offline', goOffline);
    window.addEventListener('online', goOnline);
    return () => {
      window.removeEventListener('offline', goOffline);
      window.removeEventListener('online', goOnline);
    };
  }, []);

  // Poll for staff replies after escalation (§6.3, "Our team replied" banner).
  useEffect(() => {
    if (!state.token || state.resolved || !state.escalated) return;
    const id = setInterval(() => {
      if (!state.token) return;
      api
        .getMessages(state.token, state.lastMessageId)
        .then((res) => {
          if (res.messages.length === 0) return;
          const merged = toChatMessages([
            ...state.messages
              .filter((m) => m.key.startsWith('srv-'))
              .map((m) => ({ id: Number(m.key.slice(4)), sender: m.sender, body: m.body, ai_meta: null, created_at: '' })),
            ...res.messages,
          ]);
          const lastId = res.messages.reduce((mx, x) => Math.max(mx, x.id), state.lastMessageId);
          const hasNewStaff = res.messages.some((m) => m.sender === 'staff');
          dispatch({ type: 'MERGE_MESSAGES', messages: dedupe(merged), lastMessageId: lastId, hasNewStaff });
        })
        .catch(() => {
          /* Transient poll error — retry next tick. Offline state is driven only
             by the browser's online/offline events, not by request failures. */
        });
    }, POLL_MS);
    return () => clearInterval(id);
  }, [state.token, state.escalated, state.resolved, state.lastMessageId, state.messages]);

  const ensureConversation = useCallback(
    async (topicCategory: string): Promise<string | null> => {
      if (state.token) return state.token;
      try {
        const res = await api.createConversation({
          language: state.language ?? 'en',
          source_tag: sourceTag(),
          topic_category: topicCategory,
        });
        dispatch({ type: 'CONVERSATION_CREATED', token: res.token });
        savePersisted({ token: res.token, language: state.language ?? 'en' });
        return res.token;
      } catch {
        dispatch({ type: 'AI_ERROR' });
        return null;
      }
    },
    [state.token, state.language],
  );

  const selectLanguage = useCallback((language: LanguageCode) => {
    dispatch({ type: 'SELECT_LANGUAGE', language });
  }, []);

  const selectCategory = useCallback(
    async (category: LocalizedCategory) => {
      dispatch({
        type: 'SELECT_CATEGORY',
        topicCategory: category.id,
        behavior: category.behavior,
        chips: category.subQuestions,
        topicLabel: `Topic: ${category.label}`,
        plansMessage: t.ui.plansMessage,
      });
      await ensureConversation(category.id);
    },
    [ensureConversation, t],
  );

  const send = useCallback(
    async (body: string) => {
      const trimmed = body.trim();
      if (!trimmed) return;
      const token = state.token ?? (await ensureConversation(state.topicCategory ?? 'others'));
      if (!token) return;

      dispatch({ type: 'SEND_START', body: trimmed });
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), AI_TIMEOUT_MS);
      try {
        const res = await api.postMessage(token, trimmed, controller.signal);
        clearTimeout(timer);
        lastFailedBody.current = null;
        dispatch({
          type: 'AI_REPLY',
          body: res.reply.body,
          escalated: res.escalated,
          messageId: res.reply.id,
        });
      } catch {
        clearTimeout(timer);
        if (controller.signal.aborted) {
          // 15s timeout → auto-escalation (§6.3, criterion 10).
          dispatch({ type: 'AI_REPLY', body: t.ui.escalationTitle, escalated: true, messageId: 0 });
        } else {
          lastFailedBody.current = trimmed;
          dispatch({ type: 'AI_ERROR' });
        }
      }
    },
    [state.token, state.topicCategory, ensureConversation, t],
  );

  const submitContact = useCallback(
    async (contact: { email?: string; whatsapp?: string }) => {
      if (!state.token) return;
      const reason = state.behavior === 'always_escalate' ? 'price_question' : 'not_in_manual';
      try {
        await api.postContact(state.token, { ...contact, reason });
        dispatch({ type: 'CONTACT_SENT' });
      } catch {
        dispatch({ type: 'AI_ERROR' });
      }
    },
    [state.token, state.behavior],
  );

  const feedbackSolved = useCallback(async () => {
    if (!state.token) return;
    try {
      await api.postFeedback(state.token, 'solved');
    } catch {
      /* non-critical */
    }
    dispatch({ type: 'FEEDBACK_SOLVED' });
  }, [state.token]);

  const stillNeedHelp = useCallback(() => dispatch({ type: 'SHOW_ESCALATION' }), []);
  const openComposer = useCallback(() => dispatch({ type: 'OPEN_COMPOSER' }), []);
  const changeTopic = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY); // abandon the empty conversation
    } catch {
      /* ignore */
    }
    dispatch({ type: 'CHANGE_TOPIC' });
  }, []);
  const changeLanguage = useCallback(() => dispatch({ type: 'CHANGE_LANGUAGE' }), []);
  const newQuestion = useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
    dispatch({ type: 'NEW_QUESTION' });
  }, []);
  const retry = useCallback(() => {
    dispatch({ type: 'CLEAR_ERROR' });
    if (lastFailedBody.current) void send(lastFailedBody.current);
  }, [send]);

  return {
    state,
    t,
    categories: localizedCategories(t),
    selectLanguage,
    selectCategory,
    send,
    submitContact,
    feedbackSolved,
    stillNeedHelp,
    openComposer,
    changeTopic,
    changeLanguage,
    newQuestion,
    retry,
  };
}

function dedupe(msgs: ChatMessage[]): ChatMessage[] {
  const seen = new Set<string>();
  return msgs.filter((m) => (seen.has(m.key) ? false : (seen.add(m.key), true)));
}
