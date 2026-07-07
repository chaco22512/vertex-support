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

  it('plans category shows escalation immediately, no AI, no composer', () => {
    const s = withCategory('always_escalate');
    expect(s.view).toBe('chat');
    expect(s.showEscalation).toBe(true);
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
    const s = reducer(withCategory(undefined, ['q']), { type: 'SEND_START', body: 'hi' });
    expect(s.awaitingAi).toBe(true);
    expect(s.chips).toEqual([]);
    const last = s.messages[s.messages.length - 1]!;
    expect(last.sender).toBe('customer');
    expect(last.pending).toBe(true);
  });

  it('AI_REPLY (not escalated) shows feedback and clears pending', () => {
    let s = reducer(withCategory(undefined), { type: 'SEND_START', body: 'hi' });
    s = reducer(s, { type: 'AI_REPLY', body: 'answer', escalated: false, messageId: 5 });
    expect(s.awaitingAi).toBe(false);
    expect(s.showFeedback).toBe(true);
    expect(s.messages.some((m) => m.pending)).toBe(false);
    expect(s.messages.some((m) => m.sender === 'ai' && m.body === 'answer')).toBe(true);
    expect(s.lastMessageId).toBe(5);
  });

  it('AI_REPLY (escalated) shows escalation, not feedback', () => {
    let s = reducer(withCategory(undefined), { type: 'SEND_START', body: 'price?' });
    s = reducer(s, { type: 'AI_REPLY', body: 'staff soon', escalated: true, messageId: 1 });
    expect(s.showEscalation).toBe(true);
    expect(s.showFeedback).toBe(false);
    expect(s.escalated).toBe(true);
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

  it('NEW_QUESTION returns to category with a fresh (tokenless) conversation', () => {
    let s = reducer(withCategory('free_text'), { type: 'CONVERSATION_CREATED', token: 'abc' });
    s = reducer(s, { type: 'NEW_QUESTION' });
    expect(s.view).toBe('category');
    expect(s.token).toBeNull();
    expect(s.messages).toEqual([]);
    expect(s.language).toBe('en');
  });
});
