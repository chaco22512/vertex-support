import { describe, expect, it } from 'vitest';
import { initialState, reducer, type State } from './flow';

function withCategory(behavior: 'always_escalate' | 'free_text' | undefined, chips: string[] = []): State {
  const s = initialState('en', 't');
  return reducer(s, {
    type: 'SELECT_CATEGORY',
    topicCategory: 'x',
    behavior,
    chips,
    topicLabel: 'Topic: X',
    plansMessage: 'Staff will help with prices.',
  });
}

describe('reducer', () => {
  it('starts at language when no language, category when set', () => {
    expect(initialState(null, null).view).toBe('language');
    expect(initialState('en', null).view).toBe('category');
  });

  it('plans category goes straight to the intake→escalation flow, no AI, no composer', () => {
    const s = withCategory('always_escalate');
    expect(s.view).toBe('chat');
    expect(s.showIntake).toBe(true);
    expect(s.showEscalation).toBe(false);
    expect(s.showComposer).toBe(false);
    expect(s.messages.some((m) => m.key === 'plans-msg')).toBe(true);
  });

  it('others category opens the composer', () => {
    const s = withCategory('free_text');
    expect(s.showComposer).toBe(true);
    expect(s.showEscalation).toBe(false);
  });

  it('normal category shows chips and hides composer', () => {
    const s = withCategory(undefined, ['q1', 'q2']);
    expect(s.chips).toEqual(['q1', 'q2']);
    expect(s.showComposer).toBe(false);
  });

  it('SEND_START adds a pending customer message and awaits AI', () => {
    const s = reducer(withCategory(undefined, ['q']), { type: 'SEND_START', body: 'hi', at: '2026-07-08T00:00:00Z' });
    expect(s.awaitingAi).toBe(true);
    expect(s.chips).toEqual([]);
    const last = s.messages[s.messages.length - 1]!;
    expect(last.sender).toBe('customer');
    expect(last.pending).toBe(true);
  });

  it('AI_REPLY action=answer shows feedback and clears pending', () => {
    let s = reducer(withCategory(undefined), { type: 'SEND_START', body: 'hi', at: '2026-07-08T00:00:00Z' });
    s = reducer(s, { type: 'AI_REPLY', body: 'answer', action: 'answer', options: [], messageId: 5, at: '2026-07-08T00:00:00Z' });
    expect(s.awaitingAi).toBe(false);
    expect(s.showFeedback).toBe(true);
    expect(s.showEscalation).toBe(false);
    expect(s.chips).toEqual([]);
    expect(s.messages.some((m) => m.pending)).toBe(false);
    expect(s.messages.some((m) => m.sender === 'ai' && m.body === 'answer')).toBe(true);
    expect(s.lastMessageId).toBe(5);
  });

  it('AI_REPLY action=ask shows option chips, keeps composer, no feedback/escalation (criteria 27/33)', () => {
    let s = reducer(withCategory(undefined), { type: 'SEND_START', body: 'no signal', at: '2026-07-08T00:00:00Z' });
    s = reducer(s, {
      type: 'AI_REPLY',
      body: 'Which best describes it?',
      action: 'ask',
      options: ['Not connecting', 'Slow', 'Wi-Fi only'],
      messageId: 3,
      at: '2026-07-08T00:00:00Z',
    });
    expect(s.chips).toEqual(['Not connecting', 'Slow', 'Wi-Fi only']);
    expect(s.showFeedback).toBe(false);
    expect(s.showEscalation).toBe(false);
    expect(s.showComposer).toBe(true);
  });

  it('AI_REPLY action=escalate shows the intake card first, not the contact card (§6.2 v1.6)', () => {
    let s = reducer(withCategory(undefined), { type: 'SEND_START', body: 'price?', at: '2026-07-08T00:00:00Z' });
    s = reducer(s, { type: 'AI_REPLY', body: 'staff soon', action: 'escalate', options: [], messageId: 1, at: '2026-07-08T00:00:00Z' });
    expect(s.showIntake).toBe(true);
    expect(s.showEscalation).toBe(false);
    expect(s.showFeedback).toBe(false);
    expect(s.escalated).toBe(true);
  });

  it('intake flow: SHOW_ESCALATION → intake → INTAKE_DONE → contact card (criterion 35)', () => {
    let s = reducer(withCategory(undefined), { type: 'SHOW_ESCALATION' });
    expect(s.showIntake).toBe(true);
    expect(s.showEscalation).toBe(false);
    s = reducer(s, { type: 'INTAKE_DONE', intake: { customer_number: '12345', device_model: 'iPhone 12' } });
    expect(s.showIntake).toBe(false);
    expect(s.showEscalation).toBe(true);
    expect(s.intake).toEqual({ customer_number: '12345', device_model: 'iPhone 12' });
  });

  it('Plans & prices shows the intake card first (before contact)', () => {
    const s = withCategory('always_escalate');
    expect(s.showIntake).toBe(true);
    expect(s.showEscalation).toBe(false);
  });

  it('FEEDBACK_SOLVED resolves and hides composer', () => {
    const s = reducer(withCategory('free_text'), { type: 'FEEDBACK_SOLVED' });
    expect(s.resolved).toBe(true);
    expect(s.showComposer).toBe(false);
  });

  it('OPEN_COMPOSER reveals input and clears chips', () => {
    const s = reducer(withCategory(undefined, ['q']), { type: 'OPEN_COMPOSER' });
    expect(s.showComposer).toBe(true);
    expect(s.chips).toEqual([]);
  });

  it('OPEN_COMPOSER always opens free input, never an escalation/intake card (criterion 29)', () => {
    // Even if an intake/escalation card was showing, "Something else" opens input.
    let s = reducer(withCategory(undefined, ['q']), { type: 'SHOW_ESCALATION' });
    expect(s.showIntake).toBe(true);
    s = reducer(s, { type: 'OPEN_COMPOSER' });
    expect(s.showComposer).toBe(true);
    expect(s.showIntake).toBe(false);
    expect(s.showEscalation).toBe(false);
    expect(s.showFeedback).toBe(false);
  });

  it('tracks firstMessageSent only after a send', () => {
    const before = withCategory(undefined, ['q']);
    expect(before.firstMessageSent).toBe(false);
    const after = reducer(before, { type: 'SEND_START', body: 'hi', at: '2026-07-08T00:00:00Z' });
    expect(after.firstMessageSent).toBe(true);
  });

  it('CHANGE_TOPIC returns to category with a fresh conversation', () => {
    let s = reducer(withCategory(undefined, ['q']), { type: 'CONVERSATION_CREATED', token: 'abc' });
    s = reducer(s, { type: 'CHANGE_TOPIC' });
    expect(s.view).toBe('category');
    expect(s.token).toBeNull();
    expect(s.firstMessageSent).toBe(false);
    expect(s.language).toBe('en');
  });

  it('NEW_QUESTION returns to category with a fresh (tokenless) conversation', () => {
    let s = reducer(withCategory('free_text'), { type: 'CONVERSATION_CREATED', token: 'abc' });
    s = reducer(s, { type: 'NEW_QUESTION' });
    expect(s.view).toBe('category');
    expect(s.token).toBeNull();
    expect(s.messages).toEqual([]);
    expect(s.language).toBe('en');
  });
});
