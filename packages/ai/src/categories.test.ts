import { describe, expect, it } from 'vitest';
import { resolveKbCategories, type MenuCategories } from './categories';
import { fetchScopedRules } from './rules';
import realMenu from '../../../data/menu_categories.json';

const menu: MenuCategories = {
  categories: [
    { id: 'internet', kb_categories: ['APN SETTINGS', 'GENERAL RULES'] },
    { id: 'lost', kb_categories: ['LOST ITEM RULES', 'RE-ISSUE  RULE'] }, // no GENERAL RULES
    { id: 'plans', kb_categories: [], behavior: 'always_escalate' },
    { id: 'others', kb_categories: ['*'], behavior: 'free_text' },
  ],
};

describe('resolveKbCategories', () => {
  it('returns null (all) for others', () => {
    expect(resolveKbCategories('others', menu)).toBeNull();
  });

  it('returns null (all) for unset/unknown topic', () => {
    expect(resolveKbCategories('', menu)).toBeNull();
    expect(resolveKbCategories('nope', menu)).toBeNull();
  });

  it('returns null when kb_categories is empty (plans) or contains *', () => {
    expect(resolveKbCategories('plans', menu)).toBeNull();
  });

  it('scopes to the category set and always adds GENERAL RULES', () => {
    expect(resolveKbCategories('internet', menu)?.sort()).toEqual(
      ['APN SETTINGS', 'GENERAL RULES'].sort(),
    );
    // 'lost' has no GENERAL RULES listed — it must be added
    expect(resolveKbCategories('lost', menu)).toContain('GENERAL RULES');
    expect(resolveKbCategories('lost', menu)).toContain('LOST ITEM RULES');
  });

  it('scopes the real Deposit refund tile to deposit + cancellation context (v1.7 CS docs Phase 4)', () => {
    const scope = resolveKbCategories('deposit', realMenu as unknown as MenuCategories);
    expect(scope).toContain('CS AI DOC: AI_Deposit Refund');
    // Deposit refund depends on the cancellation notice period → include AI_Cancellation.
    expect(scope).toContain('CS AI DOC: AI_Cancellation');
    expect(scope).toContain('REFUNDDEPOSIT CASHBACK');
    expect(scope).toContain('GENERAL RULES');
  });
});

// Minimal chainable mock recording the filters applied.
function mockClient() {
  const calls: Record<string, unknown> = {};
  const builder: Record<string, unknown> = {
    select() {
      return builder;
    },
    eq(col: string, val: unknown) {
      calls[`eq:${col}`] = val;
      return builder;
    },
    in(col: string, val: unknown) {
      calls[`in:${col}`] = val;
      return builder;
    },
    order() {
      return builder;
    },
    range(from: number, to: number) {
      calls['range'] = [from, to];
      return builder;
    },
    then(resolve: (r: { data: unknown[]; error: null }) => unknown) {
      // Empty page (< PAGE_SIZE) so fetchScopedRules stops after one request.
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
  };
  return {
    calls,
    client: { from: () => builder } as unknown as import('@supabase/supabase-js').SupabaseClient,
  };
}

describe('fetchScopedRules', () => {
  it('always filters status=active, audience=customer, ai_can_answer=true (Hard rule 3)', async () => {
    const { calls, client } = mockClient();
    await fetchScopedRules(client, ['APN SETTINGS']);
    expect(calls['eq:status']).toBe('active');
    expect(calls['eq:audience']).toBe('customer');
    expect(calls['eq:ai_can_answer']).toBe(true);
    expect(calls['in:category']).toEqual(['APN SETTINGS']);
  });

  it('omits the category filter when categories is null', async () => {
    const { calls, client } = mockClient();
    await fetchScopedRules(client, null);
    expect(calls['eq:status']).toBe('active');
    expect(calls['eq:audience']).toBe('customer');
    expect(calls['eq:ai_can_answer']).toBe(true);
    expect(calls['in:category']).toBeUndefined();
  });
});
