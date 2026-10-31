// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const archiveAll = vi.fn();
const deleteArchived = vi.fn();
vi.mock('../lib/api', () => ({
  api: {
    archiveAll: (...a: unknown[]) => archiveAll(...a),
    deleteArchived: (...a: unknown[]) => deleteArchived(...a),
  },
}));

const { ConfirmAllDialog } = await import('./BulkActions');

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount(kind: 'archive' | 'delete', onDone = vi.fn()) {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => root!.render(<ConfirmAllDialog kind={kind} count={7} onClose={() => {}} onDone={onDone} />));
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  vi.clearAllMocks();
});

async function type(value: string) {
  const input = container!.querySelector<HTMLInputElement>('#confirm-all')!;
  const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  await act(async () => {
    set.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

const action = () => [...container!.querySelectorAll('button')].at(-1)!;

describe('ConfirmAllDialog', () => {
  it('Delete stays locked until DELETE is typed, then deletes the confirmed count', async () => {
    deleteArchived.mockResolvedValue({ deleted: 7, snapshot_id: 's1' });
    const onDone = vi.fn();
    await mount('delete', onDone);
    expect(container!.textContent).toContain('permanently deletes 7 archived rule(s)');
    expect(action().disabled).toBe(true);
    await type('delete');
    expect(action().disabled).toBe(true); // exact word only
    await type('DELETE');
    expect(action().disabled).toBe(false);
    await act(async () => action().click());
    expect(deleteArchived).toHaveBeenCalledWith(7);
    expect(onDone).toHaveBeenCalledWith({ count: 7, snapshot_id: 's1' });
  });

  it('Archive all needs ARCHIVE and warns the bot will hand everything to staff', async () => {
    archiveAll.mockResolvedValue({ archived: 7, snapshot_id: 's2' });
    await mount('archive');
    expect(container!.textContent).toContain('passes every question to staff');
    await type('ARCHIVE');
    await act(async () => action().click());
    expect(archiveAll).toHaveBeenCalledWith(7);
    expect(deleteArchived).not.toHaveBeenCalled();
  });
});
