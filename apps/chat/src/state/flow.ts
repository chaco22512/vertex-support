import type { AiAction, IntakeInfo, LanguageCode } from '@vertex/shared';
import type { CategoryBehavior } from '../data/menuLocalized';

export type View = 'language' | 'category' | 'chat';

export interface ChatMessage {
  key: string;
  sender: 'customer' | 'ai' | 'staff' | 'system';
  body: string;
  pending?: boolean;
  /** ISO timestamp for the bubble clock + date separators (§6.2). */
  at?: string;
}

export interface SubmittedContact {
  name?: string;
  email?: string;
  whatsapp?: string;
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
  /** Pre-escalation situation card, shown before the contact card (§6.2 v1.6). */
  showIntake: boolean;
  /** Situation details collected on the intake card (or null if not yet done). */
  intake: IntakeInfo | null;
  showEscalation: boolean;
  /** Set once the escalation contact is accepted → show the success card (§6.2). */
  contactSent: boolean;
  contact: SubmittedContact | null;
  /** A contact submit failed (network) — show error + retry, keep the card. */
  contactError: boolean;
  firstMessageSent: boolean;
  escalated: boolean;
  resolved: boolean;
  teamReplied: boolean;
  offline: boolean;
  error: string | null;
  lastMessageId: number;
  /** ★v1.8: the topic picker was opened from a live conversation — keep its history. */
  switchingTopic: boolean;
}

/** A topic the server switched the conversation to (★v1.8 §4.1.1). */
export interface TopicChange {
  id: string;
  behavior: CategoryBehavior;
  /** Staff-visible marker text, e.g. "Topic: Lost SIM or device". */
  label: string;
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
  | { type: 'SEND_START'; body: string; at: string }
  | {
      type: 'AI_REPLY';
      body: string;
      action: AiAction;
      options: string[];
      messageId: number;
      at: string;
      /** ★v1.8: staff were already notified (contact on file) — show no cards, show this note. */
      followUpNote?: string;
      /** ★v1.8: the question moved the conversation to another topic. */
      topic?: TopicChange;
    }
  | { type: 'AI_ERROR' }
  | { type: 'OPEN_COMPOSER' }
  | { type: 'CHANGE_TOPIC' }
  | { type: 'BACK_TO_CHAT' }
  | { type: 'FOLLOWUP_NOTE'; note: string }
  | { type: 'SHOW_ESCALATION' }
  | { type: 'INTAKE_DONE'; intake: IntakeInfo }
  | { type: 'CONTACT_SENT'; contact: SubmittedContact }
  | { type: 'CONTACT_ERROR' }
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
    showIntake: false,
    intake: null,
    showEscalation: false,
    contactSent: false,
    contact: null,
    contactError: false,
    firstMessageSent: false,
    escalated: false,
    resolved: false,
    teamReplied: false,
    offline: false,
    error: null,
    lastMessageId: 0,
    switchingTopic: false,
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
      optimisticSeq += 1;
      const topicMsg: ChatMessage = {
        key: `topic-${action.topicCategory}-${optimisticSeq}`,
        sender: 'system',
        body: action.topicLabel,
      };
      // ★v1.8: "Ask another question" keeps the same conversation and its history.
      // A restored session (token already set) is live too.
      const history = state.switchingTopic || state.token ? state.messages : [];
      if (action.behavior === 'always_escalate') {
        // Plans & prices: no AI. Fixed message + intake card → contact (§6.1/§6.2).
        // With contact already on file the server hands it to staff directly
        // (★v1.8), so the cards are not shown again.
        return {
          ...state,
          view: 'chat',
          switchingTopic: false,
          topicCategory: action.topicCategory,
          behavior: action.behavior,
          chips: [],
          messages: [
            ...history,
            topicMsg,
            { key: `plans-msg-${optimisticSeq}`, sender: 'ai', body: action.plansMessage },
          ],
          showComposer: false,
          showIntake: !state.contactSent,
          showEscalation: false,
          showFeedback: false,
        };
      }
      if (action.behavior === 'free_text') {
        // Others: open the input, AI uses all rules (§6.1).
        return {
          ...state,
          view: 'chat',
          switchingTopic: false,
          topicCategory: action.topicCategory,
          behavior: action.behavior,
          chips: [],
          messages: [...history, topicMsg],
          showComposer: true,
          showIntake: false,
          showEscalation: false,
          showFeedback: false,
        };
      }
      // Normal category: preset question chips + "Something else".
      return {
        ...state,
        view: 'chat',
        switchingTopic: false,
        topicCategory: action.topicCategory,
        behavior: action.behavior,
        chips: action.chips,
        messages: [...history, topicMsg],
        showIntake: false,
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
          { key: `opt-${optimisticSeq}`, sender: 'customer', body: action.body, pending: true, at: action.at },
        ],
      };

    case 'AI_REPLY': {
      const messages = state.messages.map((m) => (m.pending ? { ...m, pending: false } : m));
      // ★v1.8: the question moved the conversation to another topic — mirror the
      // server's "Topic:" marker just before the reply.
      const topicChanged = action.topic && action.topic.id !== state.topicCategory;
      if (topicChanged) {
        messages.push({ key: `topic-${action.topic!.id}-${action.messageId}`, sender: 'system', body: action.topic!.label });
      }
      messages.push({ key: `ai-${action.messageId}`, sender: 'ai', body: action.body, at: action.at });
      if (action.followUpNote) {
        messages.push({ key: `note-${action.messageId}`, sender: 'system', body: action.followUpNote });
      }
      // Three-way branch on the AI action (§4.2 v1.6):
      //  - ask     → show the clarifier options as chips, keep the composer, no feedback/escalation
      //  - answer  → show Solved / Still need help
      //  - escalate→ show the escalation contact card
      const asking = action.action === 'ask';
      const escalated = action.action === 'escalate';
      return {
        ...state,
        messages,
        awaitingAi: false,
        topicCategory: topicChanged ? action.topic!.id : state.topicCategory,
        behavior: topicChanged ? action.topic!.behavior : state.behavior,
        chips: asking ? action.options : [],
        showFeedback: action.action === 'answer',
        // Escalation routes through the intake card first (§6.2 v1.6) — but only
        // the FIRST time: once contact was sent (or the server already handed
        // the message to staff), never ask for it again (★v1.8 bug fix: the
        // cards re-appeared on every later escalation turn).
        showIntake: escalated && !action.followUpNote && !state.contactSent,
        showEscalation: false,
        showComposer: true,
        escalated: state.escalated || escalated,
        lastMessageId: Math.max(state.lastMessageId, action.messageId),
      };
    }

    case 'FOLLOWUP_NOTE':
      // ★v1.8: the server handed this to staff (contact on file) — no cards.
      optimisticSeq += 1;
      return {
        ...state,
        messages: [...state.messages, { key: `note-${optimisticSeq}`, sender: 'system', body: action.note }],
        showIntake: false,
        showEscalation: false,
        showFeedback: false,
        escalated: true,
      };

    case 'AI_ERROR':
      return { ...state, awaitingAi: false, error: 'error', showComposer: true };

    case 'OPEN_COMPOSER':
      // "Something else": free-text becomes the active affordance. Clear the
      // chips and any escalation/feedback UI so the composer opens unambiguously
      // and never resolves to an escalation card (criterion 29).
      return {
        ...state,
        chips: [],
        showComposer: true,
        showIntake: false,
        showEscalation: false,
        showFeedback: false,
        contactError: false,
      };

    case 'CHANGE_TOPIC':
      // Before anything was sent: abandon the empty conversation (v1.5).
      // ★v1.8 "Ask another question": in a live conversation, open the topic
      // picker but keep the same conversation, its history and escalation state.
      if (!state.firstMessageSent && !state.contactSent) {
        return { ...initialState(state.language, null), view: 'category' };
      }
      return {
        ...state,
        view: 'category',
        switchingTopic: true,
        chips: [],
        showIntake: false,
        showEscalation: false,
        showFeedback: false,
        error: null,
      };

    case 'BACK_TO_CHAT':
      return { ...state, view: 'chat', switchingTopic: false };

    case 'SHOW_ESCALATION':
      // "Still need help" → collect situation details first, then contact (§6.2 v1.6).
      return { ...state, showIntake: true, showEscalation: false, showFeedback: false, contactError: false };

    case 'INTAKE_DONE':
      return { ...state, showIntake: false, showEscalation: true, intake: action.intake, contactError: false };

    case 'CONTACT_SENT':
      return {
        ...state,
        showEscalation: false,
        contactSent: true,
        contact: action.contact,
        contactError: false,
        escalated: true,
        showFeedback: false,
      };

    case 'CONTACT_ERROR':
      // Keep the escalation card visible so the customer can retry (§5.4).
      return { ...state, contactError: true };

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
