// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const importPreview = vi.fn();
const importApply = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    importPreview: (...a: unknown[]) => importPreview(...a),
    importApply: (...a: unknown[]) => importApply(...a),
  },
}));

const { ImportPreviewDialog } = await import('./ImportPreviewDialog');

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(onApplied = vi.fn(), mode: 'update' | 'replace' = 'update') {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ImportPreviewDialog csv="Rule ID\nR1" fileName="k.csv" mode={mode} onClose={() => {}} onApplied={onApplied} />,
    );
  });
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

const preview = {
  summary: { changed: 1, unchanged: 0, ignored: 0, errors: 0 },
  changes: [{ id: 'R1', category: 'X', decision: '', changes: [{ field: 'Answer text', from: 'a', to: 'b' }] }],
  errors: [],
};

describe('ImportPreviewDialog', () => {
  it('previews on mount but does NOT apply until the button is clicked (criterion 41)', async () => {
    importPreview.mockResolvedValue(preview);
    importApply.mockResolvedValue({ applied: 1, skipped: 0, snapshot_id: 's1', errors: [] });
    const onApplied = vi.fn();
    await mount(onApplied);

    expect(importPreview).toHaveBeenCalledTimes(1);
    expect(importApply).not.toHaveBeenCalled(); // nothing applied on load
    expect(container!.textContent).toContain('1 to change');

    const applyBtn = [...container!.querySelectorAll('button')].find((b) => /Apply changes/.test(b.textContent ?? ''));
    expect(applyBtn).toBeTruthy();
    await act(async () => applyBtn!.click());
    expect(importApply).toHaveBeenCalledTimes(1);
    expect(onApplied).toHaveBeenCalledWith({ applied: 1, skipped: 0, snapshot_id: 's1', errors: [] });
  });

  it('Replace all: shows archive count + empty-bot warning and stays disabled until REPLACE is typed (v1.8)', async () => {
    importPreview.mockResolvedValue({
      ...preview,
      mode: 'replace',
      summary: { changed: 1, unchanged: 0, ignored: 0, errors: 0, added: 0, archived: 5 },
      new_rules: [],
      to_archive: { count: 5, sample: [{ id: 'R9', category: 'X', status: 'active' }] },
      active_before: 6,
      active_after: 0,
    });
    importApply.mockResolvedValue({ applied: 1, archived: 5, skipped: 0, snapshot_id: 's1', errors: [] });
    await mount(vi.fn(), 'replace');

    expect(container!.textContent).toContain('5 to archive');
    expect(container!.textContent).toContain('not deleted');
    expect(container!.textContent).toContain('no rules to use');
    const btn = () => [...container!.querySelectorAll('button')].find((b) => /Replace all/.test(b.textContent ?? ''))!;
    expect(btn().disabled).toBe(true);

    const input = container!.querySelector<HTMLInputElement>('#replace-confirm')!;
    const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
    await act(async () => {
      setValue.call(input, 'REPLACE');
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    expect(btn().disabled).toBe(false);
    await act(async () => btn().click());
    expect(importApply).toHaveBeenCalledWith('Rule ID\\nR1', 'replace', 'REPLACE');
  });
});
