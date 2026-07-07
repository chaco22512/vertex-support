// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const useAuth = vi.fn();
vi.mock('../lib/auth', () => ({ useAuth: () => useAuth() }));

const { Login } = await import('./Login');

let root: Root | null = null;
let container: HTMLDivElement | null = null;

async function mount() {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root!.render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<div>DASHBOARD_MARKER</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  return container.textContent ?? '';
}

afterEach(() => {
  act(() => root?.unmount());
  container?.remove();
  root = null;
  container = null;
});

describe('Login', () => {
  it('shows the sign-in form when there is no session', async () => {
    useAuth.mockReturnValue({ session: null, signIn: vi.fn() });
    const text = await mount();
    expect(text).toContain('Sign in');
    expect(text).not.toContain('DASHBOARD_MARKER');
  });

  it('redirects away from /login once a session exists (fixes stuck-on-login)', async () => {
    useAuth.mockReturnValue({ session: { user: { id: 'u1' } }, signIn: vi.fn() });
    const text = await mount();
    expect(text).toContain('DASHBOARD_MARKER');
    expect(text).not.toContain('Sign in');
  });
});
