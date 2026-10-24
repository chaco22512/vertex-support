import { describe, expect, it } from 'vitest';
import { initialState, reducer, type Action, type State } from './flow';

/** Spec v1.8 Phase 1 — topic switching in a live conversation, no repeated contact cards. */

const AT = '2026-10-24T00:00:00Z';

function selectCategory(s: State, id: string, behavior?: 'always_escalate' | 'free_text'): State {
  return reducer(s, {
    type: 'SELECT_CATEGORY',
    topicCategory: id,
    behavior,
    chips: ['q1'],
    topicLabel: `Topic: ${id}`,
    plansMessage: 'Staff will help with prices.',
  });
}

function aiReply(s: State, extra: Partial<Extract<Action, { type: 'AI_REPLY' }>> = {}): State {
  return reducer(s, {
    type: 'AI_REPLY',
    body: 'reply',
    action: 'answer',
    options: [],
    messageId: s.lastMessageId + 1,
    at: AT,
    ...extra,
  });
}

/** Fresh conversation on Cancellation with one answered question. */
function afterFirstQuestion(): State {
  let s = selectCategory(initialState('en', null), 'cancel');
  s = reducer(s, { type: 'CONVERSATION_CREATED', token: 'tok' });
  s = reducer(s, { type: 'SEND_START', body: 'How do I cancel?', at: AT });
  return aiReply(s);
}

/** Same, then escalated with contact submitted. */
function afterContactSent(): State {
  let s = afterFirstQuestion();
  s = reducer(s, { type: 'SEND_START', body: 'Is my bill paid?', at: AT });
  s = aiReply(s, { action: 'escalate' });
  s = reducer(s, { type: 'INTAKE_DONE', intake: {} });
  return reducer(s, { type: 'CONTACT_SENT', contact: { email: 'a@b.com' } });
}

describe('v1.8 "Ask another question" (§6.1-7)', () => {
  it('in a live conversation, CHANGE_TOPIC keeps the token and the history', () => {
    const before = afterFirstQuestion();
    const s = reducer(before, { type: 'CHANGE_TOPIC' });
    expect(s.view).toBe('category');
    expect(s.switchingTopic).toBe(true);
    expect(s.token).toBe('tok');
    expect(s.messages).toEqual(before.messages);
  });

  it('picking the new topic appends a Topic marker to the existing history', () => {
    const before = afterFirstQuestion();
    const s = selectCategory(reducer(before, { type: 'CHANGE_TOPIC' }), 'internet');
    expect(s.view).toBe('chat');
    expect(s.switchingTopic).toBe(false);
    expect(s.topicCategory).toBe('internet');
    expect(s.messages.slice(0, before.messages.length)).toEqual(before.messages);
    expect(s.messages.at(-1)!.body).toBe('Topic: internet');
    expect(s.chips).toEqual(['q1']);
  });

  it('BACK_TO_CHAT returns without changing anything', () => {
    const before = afterFirstQuestion();
    const s = reducer(reducer(before, { type: 'CHANGE_TOPIC' }), { type: 'BACK_TO_CHAT' });
    expect(s.view).toBe('chat');
    expect(s.messages).toEqual(before.messages);
    expect(s.topicCategory).toBe('cancel');
  });

  it('before the first message, CHANGE_TOPIC still abandons the empty conversation (v1.5)', () => {
    let s = selectCategory(initialState('en', null), 'cancel');
    s = reducer(s, { type: 'CONVERSATION_CREATED', token: 'tok' });
    s = reducer(s, { type: 'CHANGE_TOPIC' });
    expect(s.token).toBeNull();
    expect(s.switchingTopic).toBe(false);
  });
});

describe('v1.8 no repeated intake/contact cards after contact was sent (bug fix)', () => {
  it('a later escalation turn does NOT show the intake card again', () => {
    let s = afterContactSent();
    s = reducer(s, { type: 'SEND_START', body: 'any update?', at: AT });
    s = aiReply(s, { action: 'escalate', followUpNote: 'Added to your open request.' });
    expect(s.showIntake).toBe(false);
    expect(s.showEscalation).toBe(false);
    expect(s.messages.at(-1)!.body).toBe('Added to your open request.');
  });

  it('even without the server note, contactSent suppresses the cards', () => {
    let s = afterContactSent();
    s = reducer(s, { type: 'SEND_START', body: 'x', at: AT });
    s = aiReply(s, { action: 'escalate' });
    expect(s.showIntake).toBe(false);
  });

  it('a new question after contact is answered normally (feedback buttons, composer)', () => {
    let s = afterContactSent();
    s = reducer(s, { type: 'SEND_START', body: 'APN?', at: AT });
    s = aiReply(s, { action: 'answer' });
    expect(s.showFeedback).toBe(true);
    expect(s.showComposer).toBe(true);
    expect(s.showIntake).toBe(false);
  });

  it('first-time escalation still shows the intake card (v1.6 flow unchanged)', () => {
    let s = afterFirstQuestion();
    s = reducer(s, { type: 'SEND_START', body: 'price?', at: AT });
    s = aiReply(s, { action: 'escalate' });
    expect(s.showIntake).toBe(true);
  });

  it('Plans & prices after contact was sent shows no intake card', () => {
    const s = selectCategory(reducer(afterContactSent(), { type: 'CHANGE_TOPIC' }), 'plans', 'always_escalate');
    expect(s.showIntake).toBe(false);
  });

  it('FOLLOWUP_NOTE appends the note and hides any cards', () => {
    let s = selectCategory(initialState('en', 'tok'), 'plans', 'always_escalate');
    expect(s.showIntake).toBe(true);
    s = reducer(s, { type: 'FOLLOWUP_NOTE', note: 'Added.' });
    expect(s.showIntake).toBe(false);
    expect(s.escalated).toBe(true);
    expect(s.messages.at(-1)!.body).toBe('Added.');
  });
});

describe('v1.8 server-side topic switch (§4.1.1)', () => {
  it('mirrors the Topic marker before the reply and re-scopes the state', () => {
    let s = afterFirstQuestion();
    s = reducer(s, { type: 'SEND_START', body: 'APN?', at: AT });
    s = aiReply(s, { topic: { id: 'internet', behavior: undefined, label: 'Topic: Internet' } });
    expect(s.topicCategory).toBe('internet');
    const bodies = s.messages.map((m) => m.body);
    expect(bodies.slice(-2)).toEqual(['Topic: Internet', 'reply']);
  });

  it('adds no marker when the topic is unchanged', () => {
    let s = afterFirstQuestion();
    const n = s.messages.length;
    s = reducer(s, { type: 'SEND_START', body: 'more', at: AT });
    s = aiReply(s, { topic: { id: 'cancel', behavior: undefined, label: 'Topic: cancel' } });
    expect(s.messages).toHaveLength(n + 2);
  });
});
