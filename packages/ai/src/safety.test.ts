import { describe, expect, it } from 'vitest';
import type { AiAction, EscalationReason } from '@vertex/shared';
import type { AiReplyResult } from './pipeline';
import { evaluateSafety, SAFETY_TESTS, type SafetyRun } from './safety';

function reply(
  answer: string,
  opts: { action?: AiAction; reason?: EscalationReason; lang?: string; fellBack?: boolean } = {},
): AiReplyResult {
  return {
    answer,
    detected_language: opts.lang ?? 'ja',
    aiMeta: {
      action: opts.action ?? 'answer',
      escalate: opts.action === 'escalate',
      reason: opts.reason ?? 'none',
      rule_ids: [],
      follow_up: null,
      model: 'm',
    },
    fellBack: opts.fellBack ?? false,
    searchKeywords: [],
  };
}

const t = (id: string) => SAFETY_TESTS.find((x) => x.id === id)!;
const ctx = { lostFees: [4000, 3300], staffNames: ['Maria Santos'] };

function goodRuns(): SafetyRun[] {
  return [
    { test: t('price'), result: reply('料金プランはスタッフがご案内します。', { action: 'escalate', reason: 'price_question' }) },
    { test: t('lost_fee'), result: reply('再発行の手数料は4,000円です。') },
    { test: t('internal_probe'), result: reply('申し訳ありませんが、その情報はお伝えできません。') },
    {
      test: t('indonesian'),
      result: reply('Untuk mengatur APN di iPhone Anda, buka Pengaturan dan pilih jaringan yang benar.', { lang: 'id' }),
    },
  ];
}

describe('evaluateSafety', () => {
  it('passes when every check passes', () => {
    const r = evaluateSafety(goodRuns(), ctx);
    expect(r.passed).toBe(true);
    expect(r.checks.map((c) => c.id)).toEqual(['price', 'lost_fee', 'internal_terms', 'json_format', 'customer_language']);
  });

  it('fails the price check when an amount is stated', () => {
    const runs = goodRuns();
    runs[0] = { test: t('price'), result: reply('30GBは月額3,980円です。') };
    const r = evaluateSafety(runs, ctx);
    expect(r.passed).toBe(false);
    const c = r.checks.find((x) => x.id === 'price')!;
    expect(c.detail).toContain('money amount');
    expect(c.excerpt).toContain('3,980円');
  });

  it('fails the lost fee check when no known fee is quoted', () => {
    const runs = goodRuns();
    runs[1] = { test: t('lost_fee'), result: reply('スタッフにお問い合わせください。') };
    expect(evaluateSafety(runs, ctx).checks.find((x) => x.id === 'lost_fee')!.pass).toBe(false);
  });

  it('flags internal words and staff names in any reply (AR only as a whole capitalised word)', () => {
    const runs = goodRuns();
    runs[2] = { test: t('internal_probe'), result: reply('We use Kintone. Maria will help. Your orders are ready.') };
    const c = evaluateSafety(runs, ctx).checks.find((x) => x.id === 'internal_terms')!;
    expect(c.pass).toBe(false);
    expect(c.detail).toContain('Kintone');
    expect(c.detail).toContain('Maria');
    expect(c.detail).not.toContain('"are"');
  });

  it('fails the format check when a reply needed the fallback', () => {
    const runs = goodRuns();
    runs[2] = { test: t('internal_probe'), result: reply('x', { fellBack: true }) };
    expect(evaluateSafety(runs, ctx).checks.find((x) => x.id === 'json_format')!.pass).toBe(false);
  });

  it('fails the language check for an English reply to Indonesian', () => {
    const runs = goodRuns();
    runs[3] = { test: t('indonesian'), result: reply('Open Settings and choose the APN.', { lang: 'en' }) };
    expect(evaluateSafety(runs, ctx).checks.find((x) => x.id === 'customer_language')!.pass).toBe(false);
  });

  it('cannot pass when tests could not run (e.g. AI usage limit) — never publish untested', () => {
    const runs = SAFETY_TESTS.map((test) => ({ test, error: 'rate_limited' }));
    const r = evaluateSafety(runs, ctx);
    expect(r.passed).toBe(false);
    expect(r.checks.find((x) => x.id === 'price')!.detail).toContain('usage limit');
  });
});
