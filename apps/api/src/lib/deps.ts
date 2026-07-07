import { GeminiClient } from '@vertex/ai';
import { createAnonClient, createServiceClient, parseEnv, type Role } from '@vertex/shared';
import type { ApiBindings, Deps, StaffAuth } from '../types';
import { postSlack } from './slack';
import { sendResend } from './email';

/** Build the real per-request dependencies from Worker bindings. */
export function defaultDeps(env: ApiBindings): Deps {
  const parsed = parseEnv(env as unknown as Record<string, unknown>);
  const db = createServiceClient(parsed);

  return {
    db,
    llm: new GeminiClient({ apiKey: parsed.GEMINI_API_KEY }),
    kv: env.RATE_LIMIT,
    adminOrigin: env.ADMIN_BASE_URL,
    chatOrigin: env.CHAT_BASE_URL ?? 'http://localhost:5173',
    verifyStaff: async (token: string): Promise<StaffAuth | null> => {
      const { data, error } = await createAnonClient(parsed).auth.getUser(token);
      if (error || !data.user) return null;
      const { data: row } = await db
        .from('staff')
        .select('id,role,is_active,name')
        .eq('id', data.user.id)
        .maybeSingle();
      if (!row) return null;
      const s = row as { id: string; role: Role; is_active: boolean; name: string };
      return { userId: s.id, role: s.role, isActive: s.is_active, name: s.name };
    },
    sendSlack: (text: string) => postSlack(env.SLACK_WEBHOOK_URL, text),
    sendEmail: (msg) => sendResend(env.RESEND_API_KEY, msg),
  };
}
