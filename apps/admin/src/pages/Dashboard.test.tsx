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
  jstTime: () => '16:00',
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
    expect(container!.textContent).toContain('AI requests today');
    expect(container!.textContent).toContain('3 / 20');
    expect(container!.textContent).toContain('17 left · resets 16:00 (JST)');
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
    expect(container!.textContent).toContain("The AI has used up today's allowance");
  });
});
