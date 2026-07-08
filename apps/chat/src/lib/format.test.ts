import { describe, expect, it } from 'vitest';
import { en } from '../i18n/en';
import type { ChatMessage } from '../state/flow';
import { clock, dayLabel, successCardLines, withSeparators } from './format';

const ui = en.ui;

describe('successCardLines (§6.2 escalation success)', () => {
  it('weaves the name into the title and shows the email note', () => {
    const l = successCardLines(ui, { name: 'Aiko', email: 'a@b.com' });
    expect(l.title).toBe('Thank you, Aiko. Your question has been sent to our support team.');
    expect(l.within24).toBe('We will reply within 24 hours.');
    expect(l.contactNote).toBe("We'll also send the reply to a@b.com.");
  });

  it('omits the name when not given and shows the WhatsApp note for a phone', () => {
    const l = successCardLines(ui, { whatsapp: '+8190' });
    expect(l.title).toBe('Thank you. Your question has been sent to our support team.');
    expect(l.contactNote).toBe('Our staff may contact you on WhatsApp at +8190.');
  });

  it('has no contact note when only a name is given', () => {
    const l = successCardLines(ui, { name: 'Bob' });
    expect(l.title).toContain('Bob');
    expect(l.contactNote).toBeUndefined();
  });
});

describe('clock / dayLabel (§6.2 timestamps)', () => {
  it('formats a clock time with a colon', () => {
    expect(clock('2026-07-08T09:05:00Z', 'en')).toContain(':');
  });

  it('labels today / yesterday / older dates', () => {
    const now = new Date('2026-07-08T12:00:00').getTime();
    expect(dayLabel('2026-07-08T09:00:00', now, 'en', ui.today, ui.yesterday)).toBe('Today');
    expect(dayLabel('2026-07-07T09:00:00', now, 'en', ui.today, ui.yesterday)).toBe('Yesterday');
    const older = dayLabel('2026-07-01T09:00:00', now, 'en', ui.today, ui.yesterday);
    expect(older).not.toBe('Today');
    expect(older).not.toBe('Yesterday');
  });
});

describe('withSeparators', () => {
  it('inserts one separator per local day', () => {
    const now = new Date('2026-07-08T12:00:00').getTime();
    const msgs: ChatMessage[] = [
      { key: 'a', sender: 'customer', body: '1', at: '2026-07-07T10:00:00' },
      { key: 'b', sender: 'ai', body: '2', at: '2026-07-07T10:01:00' },
      { key: 'c', sender: 'customer', body: '3', at: '2026-07-08T09:00:00' },
    ];
    const feed = withSeparators(msgs, now, 'en', ui.today, ui.yesterday);
    const seps = feed.filter((f) => f.kind === 'sep');
    expect(seps).toHaveLength(2);
    expect(feed.filter((f) => f.kind === 'msg')).toHaveLength(3);
  });

  it('skips messages without a timestamp for separators', () => {
    const now = Date.now();
    const feed = withSeparators([{ key: 's', sender: 'system', body: 'Topic: X' }], now, 'en', ui.today, ui.yesterday);
    expect(feed.filter((f) => f.kind === 'sep')).toHaveLength(0);
    expect(feed).toHaveLength(1);
  });
});
