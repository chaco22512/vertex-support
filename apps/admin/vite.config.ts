import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Admin console (spec §7). Internal use — standard React, relaxed perf budget (§5.3).
export default defineConfig({
  server: { port: 5174 },
  plugins: [react()],
});
