import { Hono } from 'hono';
import type { Env } from '@vertex/shared';

/**
 * Cloudflare Workers entry point (Hono). Route modules are added in M3
 * (spec §9). For now this exposes only a health check so the skeleton
 * builds and deploys.
 */
const app = new Hono<{ Bindings: Env }>();

app.get('/health', (c) => c.json({ status: 'ok', service: 'vertex-support-api' }));

export default app;
