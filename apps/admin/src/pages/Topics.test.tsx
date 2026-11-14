// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { ToastProvider } from '../components/Toast';

/** ★2026-11-14 admin "Topics" — CS-managed chat tiles. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tile = (id: string, en: string, o: Record<string, unknown> = {}) => ({
  id,
  position: 10,
  enabled: true,
  icon: 'ti-wifi',
  labels: { en },
  sub_questions: { en: ['Q1'] },
  id_prefixes: ['GN'],
  kb_categories: [],
  scope_of: null,
  behavior: '',
  no_knowledge: false,
  instructions: '',
  instructions_published: '',
  other_unpublished_changes: false,
  ...o,
});
const state = () => ({
  tiles: [
    tile('internet', 'Set up APN', { id_prefixes: ['IN', 'GN'] }),
    tile('holiday', 'Holiday plans', { id_prefixes: ['HPD', 'GN'], instructions: 'Draft text' }),
    tile('others', 'Something else', { behavior: 'free_text', id_prefixes: ['*'] }),
  ],
  codes: [
    { code: 'GN', label: 'General', rule_count: 4 },
    { code: 'GP', label: 'Gifts', rule_count: 0 },
    { code: 'HPD', label: 'Holiday', rule_count: 8 },
    { code: 'IN', label: 'Internet', rule_count: 19 },
  ],
  latest_version: { id: 9, state: 'draft' },
  instructions_limits: { topicTarget: 5000, max: 12000 },
});
const createTile = vi.fn(async (body: { labels: { en: string } }) => ({
  tile: tile('promos', body.labels.en),
  no_knowledge: true,
}));
const updateTile = vi.fn(async (id: string) => ({ tile: tile(id, 'x'), no_knowledge: false }));
const saveTileInstructions = vi.fn(async () => ({ version_id: 10 }));
const reorderTiles = vi.fn(async (ids: string[]) => ({ order: ids }));
const publishAiBehaviour = vi.fn(async () => ({
  published: false,
  version_id: 9,
  report: {
    passed: false,
    ran_at: '',
    checks: [{ id: 'discount', label: 'No discount amount', pass: false, detail: 'Failed: yen amount.' }],
  },
}));
vi.mock('../lib/api', () => ({
  ApiError: class extends Error {},
  api: {
    tiles: async () => state(),
    createTile: (b: { labels: { en: string } }) => createTile(b),
    updateTile: (id: string) => updateTile(id),
    saveTileInstructions: () => saveTileInstructions(),
    reorderTiles: (ids: string[]) => reorderTiles(ids),
    publishAiBehaviour: () => publishAiBehaviour(),
    translateTile: async () => ({ labels: { vi: 'Khuyến mãi' }, sub_questions: {} }),
  },
}));

const { Topics } = await import('./Topics');

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
const type = async (el: Element, value: string) =>
  act(async () => {
    const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  document.body.innerHTML = '';
  vi.clearAllMocks();
});

describe('Topics page', () => {
  it('lists tiles with "Something else" locked last and moves a tile', async () => {
    await mount(<Topics />);
    const rows = [...container!.querySelectorAll('tbody tr')];
    expect(rows.map((r) => r.querySelector('strong')?.textContent)).toEqual(['Set up APN', 'Holiday plans', 'Something else']);
    expect(rows[2]!.textContent).toContain('Last');
    expect(rows[2]!.textContent).toContain('All knowledge');
    await click(container!.querySelector('button[aria-label="Move Holiday plans up"]')!);
    expect(reorderTiles).toHaveBeenCalledWith(['holiday', 'internet']);
  });

  it('shows unpublished Topic instructions and the failed safety check after Publish', async () => {
    await mount(<Topics />);
    expect(container!.textContent).toContain('Topic instructions not live yet');
    expect(container!.textContent).toContain('Holiday plans');
    await click(byText('button', 'Publish'));
    expect(publishAiBehaviour).toHaveBeenCalled();
    expect(container!.textContent).toContain('Not published — the safety check failed');
    expect(container!.textContent).toContain('Failed: yen amount.');
  });

  it('adding a topic with knowledge that has no usable rule asks first, then saves tile + instructions draft', async () => {
    await mount(<Topics />);
    await click(byText('button', 'Add topic'));
    const dialog = document.querySelector('.dialog')!;
    await type(dialog.querySelector('input[placeholder="e.g. Holiday plans"]')!, 'Promos');
    const gp = [...dialog.querySelectorAll('label')].find((l) => l.textContent?.includes('GP'))!;
    await click(gp.querySelector('input')!);
    expect(dialog.textContent).toContain('Customers who tap this topic will all be handed to staff');
    await type(dialog.querySelector('textarea[placeholder^="e.g. First ask"]')!, 'Never state amounts.');
    await click(byText('.dialog button', 'Add topic'));
    expect(createTile).not.toHaveBeenCalled();
    expect(dialog.textContent).toContain('Save anyway?');
    await click(byText('.dialog button', 'Save anyway'));
    expect(createTile).toHaveBeenCalledWith(
      expect.objectContaining({ labels: { en: 'Promos' }, id_prefixes: ['GN', 'GP'], enabled: true }),
    );
    expect(saveTileInstructions).toHaveBeenCalled();
  });

  it('"Something else" cannot be hidden and keeps all knowledge', async () => {
    await mount(<Topics />);
    const rows = [...container!.querySelectorAll('tbody tr')];
    await click(rows[2]!.querySelector('button')!);
    const dialog = document.querySelector('.dialog')!;
    expect(dialog.textContent).toContain('always uses all knowledge');
    const show = [...dialog.querySelectorAll('label')].find((l) => l.textContent?.includes('Show in the chat'))!;
    expect((show.querySelector('input') as HTMLInputElement).disabled).toBe(true);
  });
});
