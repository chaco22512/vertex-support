import { describe, expect, it } from 'vitest';
import { buildEscalationMessage, buildReminderMessage, type SlackNoticeFields } from './slackMessage';

const base: SlackNoticeFields = {
  channel: 'webchat',
  sourceTag: 'agent042',
  language: 'vi',
  question: 'Monthly plan price for 30GB?',
  reason: 'price_question',
  assigneeSlackId: 'U012ABC',
  conversationId: 'abc-123',
  adminUrl: 'http://localhost:5174',
};

describe('buildEscalationMessage (§8)', () => {
  it('formats the escalation notice with all fields', () => {
    const msg = buildEscalationMessage(base, '24h');
    expect(msg).toContain('🔔 Escalation — due in 24h');
    expect(msg).toContain('Channel: webchat (src: agent042) | Lang: VI');
    expect(msg).toContain('Q: "Monthly plan price for 30GB?"');
    expect(msg).toContain('AI reason: price_question');
    expect(msg).toContain('Assigned: <@U012ABC>');
    expect(msg).toContain('▶ Open conversation: http://localhost:5174/inbox/abc-123');
  });

  it('falls back to @channel when unassigned and omits an empty src', () => {
    const msg = buildEscalationMessage({ ...base, assigneeSlackId: null, sourceTag: '' }, '24h');
    expect(msg).toContain('Assigned: @channel');
    expect(msg).toContain('Channel: webchat | Lang: VI');
    expect(msg).not.toContain('(src:');
  });
});

describe('buildReminderMessage (§8)', () => {
  it('warns with ⚠️ when time remains', () => {
    expect(buildReminderMessage('warn', base, '3h')).toContain('⚠️ Reminder — due in 3h');
  });

  it('flags overdue with 🚨', () => {
    expect(buildReminderMessage('overdue', base, '0h')).toContain('🚨 Overdue — reply deadline passed');
  });
});
