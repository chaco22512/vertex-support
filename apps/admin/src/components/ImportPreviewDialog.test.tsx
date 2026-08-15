// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const importPreview = vi.fn();
const importApply = vi.fn();
vi.mock('../lib/api', () => ({ api: { importPreview: () => importPreview(), importApply: () => importApply() } }));

const { ImportPreviewDialog } = await import('./ImportPreviewDialog');

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(onApplied = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <ImportPreviewDialog csv="Rule ID\nR1" fileName="k.csv" onClose={() => {}} onApplied={onApplied} />,
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
});
