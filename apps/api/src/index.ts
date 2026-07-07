import { Hono } from 'hono';
import type { ApiBindings, AppEnv, Deps } from './types';
import { corsMiddleware } from './middleware/cors';
import { rateLimitMiddleware } from './middleware/rateLimit';
import { sessionMiddleware } from './middleware/session';
import { defaultDeps } from './lib/deps';
import { createConversation } from './routes/conversations';
import { getMessages, postMessage } from './routes/messages';
import { postContact } from './routes/contact';
import { postFeedback } from './routes/feedback';

/**
 * Build the chat API (§9). `makeDeps` is injectable so tests can supply mock
 * db / llm / kv without touching the network.
 */
export function createApp(makeDeps: (env: ApiBindings) => Deps = defaultDeps) {
  const app = new Hono<AppEnv>();

  app.use('*', corsMiddleware());
  app.use('*', async (c, next) => {
    c.set('deps', makeDeps(c.env));
    await next();
  });

  app.get('/health', (c) => c.json({ status: 'ok', service: 'vertex-support-api' }));
  app.post('/api/conversations', createConversation);

  // Session-scoped routes: rate limit first (cheap abuse rejection), then resolve
  // the conversation from the token.
  const session = new Hono<AppEnv>();
  session.use('*', rateLimitMiddleware);
  session.use('*', sessionMiddleware);
  session.get('/messages', getMessages);
  session.post('/messages', postMessage);
  session.post('/contact', postContact);
  session.post('/feedback', postFeedback);
  app.route('/api/conversations/:token', session);

  return app;
}

const app = createApp();
export default app;
