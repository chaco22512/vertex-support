// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const getAiBehaviour = vi.fn();
const saveAiBehaviour = vi.fn();
const publishAiBehaviour = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    getAiBehaviour: () => getAiBehaviour(),
    saveAiBehaviour: (...a: unknown[]) => saveAiBehaviour(...a),
    publishAiBehaviour: (...a: unknown[]) => publishAiBehaviour(...a),
  },
}));
vi.mock('../components/Toast', () => ({ useToast: () => ({ show: vi.fn() }) }));

const { AiBehaviour } = await import('./AiBehaviour');

let root: Root | null = null;
let container: HTMLDivElement | null = null;

const draftVersion = {
  id: 1,
  state: 'draft',
  common_behaviour: 'CS core prompt text',
  topic_instructions: { cancel: 'Cancellation order of questions' },
  created_at: '2026-10-25T00:00:00Z',
  published_at: null,
  safety_report: null,
  note: '',
  based_on: null,
};

function stateWith(latest: unknown = draftVersion) {
  return {
    fixed: { system: 'SYSTEM', safety_rules: 'SAFETY RULES — NEVER state monthly plan prices' },
    default_common_behaviour: 'DEFAULT',
    topics: [
      { id: 'internet', label: 'Internet' },
      { id: 'cancel', label: 'Cancellation' },
    ],
    limits: { commonTarget: 6000, topicTarget: 5000, max: 12000 },
    latest,
    published: null,
    versions: [],
  };
}

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<AiBehaviour />));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

const button = (re: RegExp) => [...container!.querySelectorAll('button')].find((b) => re.test(b.textContent ?? ''))!;

describe('AiBehaviour page', () => {
  it('shows the safety rules read-only and loads the latest draft into the editors', async () => {
    getAiBehaviour.mockResolvedValue(stateWith());
    await mount();
    expect(container!.textContent).toContain('NEVER state monthly plan prices');
    // The safety rules are text, never an editable box.
    const boxes = [...container!.querySelectorAll('textarea')];
    expect(boxes.some((t) => t.value.includes('NEVER state monthly plan prices'))).toBe(false);
    expect(boxes[0]!.value).toBe('CS core prompt text');
    expect(container!.textContent).toContain('Nothing published yet');
    // Nothing edited → Save is off; the unpublished draft can be published.
    expect(button(/Save draft/).disabled).toBe(true);
    expect(button(/^Publish$/).disabled).toBe(false);
  });

  it('shows which safety checks failed when publishing is blocked', async () => {
    getAiBehaviour.mockResolvedValue(stateWith());
    publishAiBehaviour.mockResolvedValue({
      published: false,
      version_id: 1,
      report: {
        passed: false,
        ran_at: '2026-10-25T00:00:00Z',
        checks: [
          { id: 'price', label: 'Monthly price is not given', pass: false, detail: 'Failed: the reply contains a money amount.', excerpt: '月額3,980円' },
          { id: 'json_format', label: 'Required format', pass: true, detail: 'Passed.' },
        ],
      },
    });
    await mount();
    await act(async () => button(/^Publish$/).click());
    expect(publishAiBehaviour).toHaveBeenCalledWith(1);
    expect(container!.textContent).toContain('Not published');
    expect(container!.textContent).toContain('the reply contains a money amount');
    expect(container!.textContent).toContain('月額3,980円');
  });
});
