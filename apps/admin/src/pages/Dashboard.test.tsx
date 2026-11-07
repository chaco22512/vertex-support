// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const kbHealth = vi.fn();
const aiUsage = vi.fn(async () => ({
  used_today: 3,
  limit: 20,
  remaining: 17,
  resets_at: '2026-11-01T07:00:00.000Z',
  daily_limit_hit: false,
}));
vi.mock('../lib/api', () => ({
  api: {
    listConversations: async () => ({ conversations: [] }),
    kbHealth: () => kbHealth(),
    aiUsage: () => aiUsage(),
  },
  jstTime: () => 'today 17:00 (JST)',
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ staff: { role: 'admin' } }) }));

const { Dashboard } = await import('./Dashboard');

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <MemoryRouter>
        <Dashboard />
      </MemoryRouter>,
    ),
  );
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

describe('Dashboard knowledge warning (v1.8 §7.1)', () => {
  it('warns when the bot has no active rules, with a link for admins', async () => {
    kbHealth.mockResolvedValue({ active_rules: 0 });
    await mount();
    expect(container!.textContent).toContain('The knowledge base has no active rules');
    expect(container!.querySelector('a[href="/knowledge"]')).toBeTruthy();
  });

  it('shows nothing when rules exist', async () => {
    kbHealth.mockResolvedValue({ active_rules: 15 });
    await mount();
    expect(container!.textContent).not.toContain('no active rules');
  });
});

describe('Dashboard AI requests card (v1.8 §7.1)', () => {
  it('shows used / limit and how many are left', async () => {
    kbHealth.mockResolvedValue({ active_rules: 15 });
    await mount();
    expect(container!.textContent).toContain('AI requests (whole company)');
    expect(container!.textContent).toContain('3 / 20');
    expect(container!.textContent).toContain('17 left · resets today 17:00 (JST)');
  });

  it('warns when the daily allowance is used up', async () => {
    kbHealth.mockResolvedValue({ active_rules: 15 });
    aiUsage.mockResolvedValueOnce({
      used_today: 20,
      limit: 20,
      remaining: 0,
      resets_at: '2026-11-01T07:00:00.000Z',
      daily_limit_hit: true,
    });
    await mount();
    expect(container!.textContent).toContain("Google's daily AI limit is used up");
    expect(container!.textContent).toContain('passed to staff');
  });
});

describe('Dashboard per-minute AI requests (2026-11-07)', () => {
  const hour = Array.from({ length: 60 }, (_, i) => ({
    minute: new Date(Date.UTC(2026, 10, 7, 3, i)).toISOString(),
    calls: i === 59 ? 4 : i === 30 ? 5 : 0,
    limited: i === 30,
  }));
  const withMinute = (used: number, limited = false) => ({
    used_today: 9,
    limit: 20,
    remaining: 11,
    resets_at: '2026-11-07T08:00:00.000Z',
    daily_limit_hit: false,
    minute: { used, limit: 5, limited },
    last_hour: hour,
  });
  const minuteCard = () =>
    [...container!.querySelectorAll('.metric-card')].find((c) =>
      c.textContent?.includes('AI requests this minute'),
    )!;

  it('shows "n / 5" in the warning colour near the limit, and the last-hour chart', async () => {
    kbHealth.mockResolvedValue({ active_rules: 15 });
    aiUsage.mockResolvedValueOnce(withMinute(4));
    await mount();
    expect(minuteCard().textContent).toContain('4 / 5');
    expect(minuteCard().querySelector('.metric-value.warn')).toBeTruthy();
    expect(container!.textContent).toContain('AI requests per minute — last hour');
    expect(container!.textContent).toContain('limit hit in 1 minute');
    expect(container!.querySelectorAll('.minute-bar')).toHaveLength(2);
    expect(container!.querySelectorAll('.minute-bar.limited')).toHaveLength(1);
  });

  it('turns red when the per-minute limit was hit', async () => {
    kbHealth.mockResolvedValue({ active_rules: 15 });
    aiUsage.mockResolvedValueOnce(withMinute(5, true));
    await mount();
    expect(container!.textContent).toContain('Per-minute limit hit');
    expect(minuteCard().querySelector('.metric-value.danger')).toBeTruthy();
  });
});
