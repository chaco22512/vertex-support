// @vitest-environment happy-dom
import { describe, expect, it, vi } from 'vitest';
import { renderToString } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';

// Mock the Supabase client so no real credentials/network are needed at import.
vi.mock('./lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      onAuthStateChange: vi.fn().mockReturnValue({ data: { subscription: { unsubscribe: vi.fn() } } }),
      signInWithPassword: vi.fn(),
      signOut: vi.fn(),
    },
    from: vi.fn(),
  },
}));

// Imported after the mock so every page module (incl. lib/categories, which
// crashed the bundle with "categories.map is not a function") loads here.
const { App } = await import('./App');
const { AuthProvider } = await import('./lib/auth');
const { ToastProvider } = await import('./components/Toast');

describe('admin App', () => {
  it('renders the login screen without crashing on module load', () => {
    const html = renderToString(
      <MemoryRouter initialEntries={['/login']}>
        <AuthProvider>
          <ToastProvider>
            <App />
          </ToastProvider>
        </AuthProvider>
      </MemoryRouter>,
    );
    expect(html).toContain('Sign in');
    expect(html).toContain('Email');
    // The Vertex Digital Marketing wordmark logo is present on login (§7).
    expect(html).toContain('logo-horizontal.webp');
  });
});
