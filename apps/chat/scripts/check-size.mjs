// Enforce the customer-chat performance budget (build_spec_v1_4.md §5.3,
// acceptance criterion 9): initial load <= 150KB gzip. Run after `vite build`.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const DIST = fileURLToPath(new URL('../dist', import.meta.url));
const BUDGET = 150 * 1024;
const EXTS = ['.js', '.css', '.html', '.woff2'];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else out.push(p);
  }
  return out;
}

let total = 0;
for (const file of walk(DIST)) {
  if (!EXTS.some((e) => file.endsWith(e))) continue;
  const gz = gzipSync(readFileSync(file)).length;
  total += gz;
  console.log(`${(gz / 1024).toFixed(1).padStart(7)} KB  ${file.slice(DIST.length + 1)}`);
}

const kb = (total / 1024).toFixed(1);
console.log(`TOTAL gzip: ${kb} KB (budget 150 KB)`);
if (total > BUDGET) {
  console.error(`BUNDLE OVER BUDGET by ${((total - BUDGET) / 1024).toFixed(1)} KB`);
  process.exit(1);
}
console.log('within budget ✓');
