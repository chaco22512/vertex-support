import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// Customer chat (spec §5–6). Performance budget: 150KB gzip (§5.3) — enforced in M4.
export default defineConfig({
  plugins: [preact()],
});
