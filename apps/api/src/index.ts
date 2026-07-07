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
import { adminOnly, authMiddleware } from './middleware/auth';
import {
  aiDraft,
  getConversation,
  listConversations,
  patchConversation,
  putDraft,
  replyConversation,
  translate,
} from './routes/admin/conversations';
import {
  approveRules,
  createRule,
  listRules,
  splitRule,
  updateRule,
} from './routes/admin/rules';
import { createStaff, listStaff, updateStaff } from './routes/admin/staff';
import { listChangelog } from './routes/admin/changelog';

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

  // Admin API (§7/§9): JWT-authenticated. Knowledge & staff are admin-only.
  const admin = new Hono<AppEnv>();
  admin.use('*', authMiddleware);
  admin.get('/conversations', listConversations);
  admin.get('/conversations/:id', getConversation);
  admin.patch('/conversations/:id', patchConversation);
  admin.post('/conversations/:id/reply', replyConversation);
  admin.post('/conversations/:id/translate', translate);
  admin.post('/conversations/:id/ai-draft', aiDraft);
  admin.put('/conversations/:id/draft', putDraft);
  admin.get('/rules', adminOnly, listRules);
  admin.post('/rules', adminOnly, createRule);
  admin.post('/rules/approve', adminOnly, approveRules);
  admin.post('/rules/:id/split', adminOnly, splitRule);
  admin.patch('/rules/:id', adminOnly, updateRule);
  admin.get('/staff', adminOnly, listStaff);
  admin.post('/staff', adminOnly, createStaff);
  admin.patch('/staff/:id', adminOnly, updateStaff);
  admin.get('/changelog', adminOnly, listChangelog);
  app.route('/api/admin', admin);

  return app;
}

const app = createApp();
export default app;
