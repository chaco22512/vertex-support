import type { LanguageCode } from '@vertex/shared';
import type { CategoryBehavior } from '../data/menuLocalized';

export type View = 'language' | 'category' | 'chat';

export interface ChatMessage {
  key: string;
  sender: 'customer' | 'ai' | 'staff' | 'system';
  body: string;
  pending?: boolean;
}

export interface State {
  view: View;
  language: LanguageCode | null;
  token: string | null;
  topicCategory: string | null;
  behavior: CategoryBehavior;
  messages: ChatMessage[];
  chips: string[];
  showComposer: boolean;
  awaitingAi: boolean;
  showFeedback: boolean;
  showEscalation: boolean;
  firstMessageSent: boolean;
  escalated: boolean;
  resolved: boolean;
  teamReplied: boolean;
  offline: boolean;
  error: string | null;
  lastMessageId: number;
}

export type Action =
  | { type: 'SELECT_LANGUAGE'; language: LanguageCode }
  | { type: 'CHANGE_LANGUAGE' }
  | {
      type: 'SELECT_CATEGORY';
      topicCategory: string;
      behavior: CategoryBehavior;
      chips: string[];
      topicLabel: string;
      plansMessage: string;
    }
  | { type: 'CONVERSATION_CREATED'; token: string }
  | { type: 'SEND_START'; body: string }
  | { type: 'AI_REPLY'; body: string; escalated: boolean; messageId: number }
  | { type: 'AI_ERROR' }
  | { type: 'OPEN_COMPOSER' }
  | { type: 'CHANGE_TOPIC' }
  | { type: 'SHOW_ESCALATION' }
  | { type: 'CONTACT_SENT' }
  | { type: 'FEEDBACK_SOLVED' }
  | { type: 'MERGE_MESSAGES'; messages: ChatMessage[]; lastMessageId: number; hasNewStaff: boolean }
  | { type: 'SET_OFFLINE'; offline: boolean }
  | { type: 'CLEAR_ERROR' }
  | { type: 'NEW_QUESTION' };

export function initialState(language: LanguageCode | null, token: string | null): State {
  return {
    view: language ? 'category' : 'language',
    language,
    token,
    topicCategory: null,
    behavior: undefined,
    messages: [],
    chips: [],
    showComposer: false,
    awaitingAi: false,
    showFeedback: false,
    showEscalation: false,
    firstMessageSent: false,
    escalated: false,
    resolved: false,
    teamReplied: false,
    offline: false,
    error: null,
    lastMessageId: 0,
  };
}

let optimisticSeq = 0;

export function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'SELECT_LANGUAGE':
      return { ...state, language: action.language, view: 'category' };

    case 'CHANGE_LANGUAGE':
      return { ...state, view: 'language' };

    case 'SELECT_CATEGORY': {
      const topicMsg: ChatMessage = {
        key: `topic-${action.topicCategory}`,
        sender: 'system',
        body: action.topicLabel,
      };
      if (action.behavior === 'always_escalate') {
        // Plans & prices: no AI. Fixed message + escalation card immediately (§6.1).
        return {
          ...state,
          view: 'chat',
          topicCategory: action.topicCategory,
          behavior: action.behavior,
          chips: [],
          messages: [
            topicMsg,
            { key: 'plans-msg', sender: 'ai', body: action.plansMessage },
          ],
          showComposer: false,
          showEscalation: true,
          showFeedback: false,
        };
      }
      if (action.behavior === 'free_text') {
        // Others: open the input, AI uses all rules (§6.1).
        return {
          ...state,
          view: 'chat',
          topicCategory: action.topicCategory,
          behavior: action.behavior,
          chips: [],
          messages: [topicMsg],
          showComposer: true,
          showEscalation: false,
          showFeedback: false,
        };
      }
      // Normal category: preset question chips + "Something else".
      return {
        ...state,
        view: 'chat',
        topicCategory: action.topicCategory,
        behavior: action.behavior,
        chips: action.chips,
        messages: [topicMsg],
        showComposer: false,
        showEscalation: false,
        showFeedback: false,
      };
    }

    case 'CONVERSATION_CREATED':
      return { ...state, token: action.token };

    case 'SEND_START':
      optimisticSeq += 1;
      return {
        ...state,
        chips: [],
        awaitingAi: true,
        firstMessageSent: true,
        showFeedback: false,
        showComposer: true,
        error: null,
        messages: [
          ...state.messages,
          { key: `opt-${optimisticSeq}`, sender: 'customer', body: action.body, pending: true },
        ],
      };

    case 'AI_REPLY': {
      const messages = state.messages.map((m) => (m.pending ? { ...m, pending: false } : m));
      messages.push({ key: `ai-${action.messageId}`, sender: 'ai', body: action.body });
      return {
        ...state,
        messages,
        awaitingAi: false,
        showFeedback: !action.escalated,
        showEscalation: action.escalated,
        escalated: state.escalated || action.escalated,
        lastMessageId: Math.max(state.lastMessageId, action.messageId),
      };
    }

    case 'AI_ERROR':
      return { ...state, awaitingAi: false, error: 'error', showComposer: true };

    case 'OPEN_COMPOSER':
      return { ...state, chips: [], showComposer: true };

    case 'CHANGE_TOPIC':
      // Allowed only before the first message is sent (§ spec addendum). Abandon
      // the (empty) conversation and return to category selection.
      return { ...initialState(state.language, null), view: 'category' };

    case 'SHOW_ESCALATION':
      return { ...state, showEscalation: true, showFeedback: false };

    case 'CONTACT_SENT':
      return { ...state, showEscalation: false, escalated: true, showFeedback: false };

    case 'FEEDBACK_SOLVED':
      return { ...state, resolved: true, showFeedback: false, showComposer: false };

    case 'MERGE_MESSAGES':
      return {
        ...state,
        messages: action.messages,
        lastMessageId: action.lastMessageId,
        teamReplied: state.teamReplied || action.hasNewStaff,
      };

    case 'SET_OFFLINE':
      return { ...state, offline: action.offline };

    case 'CLEAR_ERROR':
      return { ...state, error: null };

    case 'NEW_QUESTION':
      return {
        ...initialState(state.language, null),
        view: 'category',
      };

    default:
      return state;
  }
}
