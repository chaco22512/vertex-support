// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast';

/** 2026-11-07: render checks for Topic codes and Knowledge "select and act". */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const rule = (id: string, status = 'active') => ({
  id,
  category: 'Deposit refund',
  subcategory: '',
  rule_text: `Text ${id}`,
  date_updated: null,
  fee_amounts_jpy: [],
  links: [],
  audience: 'customer',
  ai_can_answer: true,
  requires_fee_disclaimer: false,
  fee_is_fixed: false,
  status,
  review_reason: '',
  updated_by: null,
  updated_at: '2026-11-01T00:00:00Z',
});
const bulkStatus = vi.fn(async (..._a: unknown[]) => ({
  changed: 2,
  snapshot_id: 'snap-1',
  active_after: 1,
}));
const saveTopicCode = vi.fn(async (..._a: unknown[]) => ({ code: 'ESP', topics: ['plans'] }));
vi.mock('../lib/api', () => ({
  api: {
    listRules: async () => ({ rules: [rule('DR001'), rule('DR002'), rule('ESP001')] }),
    bulkStatus: (...a: unknown[]) => bulkStatus(...a),
    topicCodes: async () => ({
      tiles: [
        {
          id: 'internet',
          label: 'Set up APN or mobile internet + Report a signal or connection issue',
        },
        { id: 'plans', label: 'View plans and requirements' },
        { id: 'deposit', label: 'Deposit refund or cashback inquiry' },
      ],
      codes: [
        {
          code: 'DR',
          label: 'Deposit refund',
          builtin: true,
          builtin_topics: ['deposit'],
          extra_topics: [],
          rule_count: 2,
          unlinked: false,
        },
        {
          code: 'ESP',
          label: '',
          builtin: false,
          builtin_topics: [],
          extra_topics: [],
          rule_count: 1,
          unlinked: true,
        },
      ],
    }),
    saveTopicCode: (...a: unknown[]) => saveTopicCode(...a),
    undoSnapshot: async () => ({ restored: 2 }),
  },
}));
vi.mock('../lib/auth', () => ({ useAuth: () => ({ staff: { role: 'admin' } }) }));

const { Knowledge } = await import('./Knowledge');
const { TopicCodes } = await import('./TopicCodes');

let root: Root | null = null;
let container: HTMLDivElement | null = null;
async function mount(node: ReactNode) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () =>
    root!.render(
      <MemoryRouter>
        <ToastProvider>{node}</ToastProvider>
      </MemoryRouter>,
    ),
  );
}
const click = async (el: Element) => act(async () => (el as HTMLElement).click());
const byText = (sel: string, text: string) =>
  [...document.querySelectorAll(sel)].find((e) => e.textContent?.includes(text))!;

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('Knowledge — select and act', () => {
  it('ticking rules shows the bar; Archive confirms with the count, then sends exactly those ids', async () => {
    await mount(<Knowledge />);
    expect(container!.querySelector('.selection-bar')).toBeNull();
    await click(container!.querySelector('input[aria-label="Select DR001"]')!);
    await click(container!.querySelector('input[aria-label="Select ESP001"]')!);
    const bar = container!.querySelector('.selection-bar')!;
    expect(bar.textContent).toContain('2 selected');
    expect(bar.textContent).toContain('Archive selected (2)');
    expect(bar.textContent).toContain('Select all 3 in this view');

    await click(byText('.selection-bar button', 'Archive selected'));
    expect(document.body.textContent).toContain('Archive 2 selected rule(s)?');
    expect(document.body.textContent).toContain('can be undone');
    await click(byText('.dialog-actions button', 'Archive 2'));
    expect(bulkStatus).toHaveBeenCalledWith(['DR001', 'ESP001'], 'archived', '2 selected');
  });

  it('the header box selects / clears every rule in the view', async () => {
    await mount(<Knowledge />);
    await click(container!.querySelector('input[aria-label="Select all in this view"]')!);
    expect(container!.querySelector('.selection-bar')!.textContent).toContain('3 selected');
    await click(container!.querySelector('input[aria-label="Clear all in this view"]')!);
    expect(container!.querySelector('.selection-bar')).toBeNull();
  });
});

describe('Topic codes', () => {
  it('lists codes, flags ESP as having no tile, and saves the ticked tiles', async () => {
    await mount(<TopicCodes />);
    expect(container!.textContent).toContain('3–4 numbers');
    const rows = [...container!.querySelectorAll('tbody tr')];
    const dr = rows.find((r) => r.querySelector('td strong')?.textContent === 'DR')!;
    const esp = rows.find((r) => r.querySelector('td strong')?.textContent === 'ESP')!;
    expect(esp.textContent).toContain('No tile yet');
    // Built-in links are shown ticked and locked.
    const drDeposit = [...dr.querySelectorAll('label')]
      .find((l) => l.textContent?.includes('Deposit refund or cashback'))!
      .querySelector('input')!;
    expect(drDeposit.checked).toBe(true);
    expect(drDeposit.disabled).toBe(true);

    const espPlans = [...esp.querySelectorAll('label')]
      .find((l) => l.textContent?.includes('View plans'))!
      .querySelector('input')!;
    await click(espPlans);
    await click([...esp.querySelectorAll('button')].find((b) => b.textContent === 'Save')!);
    expect(saveTopicCode).toHaveBeenCalledWith('ESP', { label: '', topics: ['plans'] });
  });
});
