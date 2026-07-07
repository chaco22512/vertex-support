import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';

// Admin console (spec §7). Internal use — standard React, relaxed perf budget (§5.3).
// Config values come from the monorepo-root .env (no VITE_ prefix): the Supabase
// URL + anon key are publishable and safe to embed in this client bundle, so we
// inject them via `define` instead of asking the operator to duplicate them.
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, repoRoot, '');
  const apiBase = env.ADMIN_API_BASE_URL ?? 'http://127.0.0.1:8787';
  return {
    // Listen on all interfaces so both http://localhost:5174 and
    // http://127.0.0.1:5174 work (Windows resolves localhost to IPv6 ::1). The
    // admin API's CORS allows both loopback forms of the dev origin.
    // strictPort: fail loudly if 5174 is taken rather than drifting to 5175,
    // which would break CORS (the API only allows the :5174 dev origin).
    server: { host: true, port: 5174, strictPort: true },
    plugins: [react()],
    define: {
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(env.SUPABASE_URL ?? ''),
      'import.meta.env.VITE_SUPABASE_ANON_KEY': JSON.stringify(env.SUPABASE_ANON_KEY ?? ''),
      'import.meta.env.VITE_API_BASE_URL': JSON.stringify(apiBase),
    },
  };
});
