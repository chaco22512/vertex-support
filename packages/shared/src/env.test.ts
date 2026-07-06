import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

const FULL = {
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'anon',
  SUPABASE_SERVICE_ROLE_KEY: 'service',
  GEMINI_API_KEY: 'gemini',
  SLACK_WEBHOOK_URL: 'https://hooks.slack.com/x',
  RESEND_API_KEY: 'resend',
  ADMIN_BASE_URL: 'http://localhost:5174',
};

describe('parseEnv', () => {
  it('returns the full env when all keys are present', () => {
    expect(parseEnv(FULL)).toEqual(FULL);
  });

  it('throws listing every missing key', () => {
    const partial: Record<string, string> = { ...FULL };
    delete partial.GEMINI_API_KEY;
    delete partial.SLACK_WEBHOOK_URL;
    expect(() => parseEnv(partial)).toThrowError(/GEMINI_API_KEY.*SLACK_WEBHOOK_URL/);
  });

  it('treats an empty string as missing', () => {
    expect(() => parseEnv({ ...FULL, RESEND_API_KEY: '' })).toThrowError(/RESEND_API_KEY/);
  });

  it('ignores unknown extra keys', () => {
    const result = parseEnv({ ...FULL, EXTRA: 'ignored' });
    expect(result).not.toHaveProperty('EXTRA');
  });
});
