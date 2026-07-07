import type { Context } from 'hono';
import type { HistoryMessage } from '@vertex/ai';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { AppEnv } from '../types';
import { postMessageSchema } from '../dto';
import { generateAiReply } from '../lib/aiTurn';
import { escalateConversation } from '../lib/escalation';

const HISTORY_LIMIT = 20; // §4.1

async function fetchHistory(db: SupabaseClient, conversationId: string): Promise<HistoryMessage[]> {
  const { data } = await db
    .from('messages')
    .select('sender,body')
    .eq('conversation_id', conversationId)
    .order('id', { ascending: false })
    .limit(HISTORY_LIMIT);
  const rows = (data ?? []) as { sender: HistoryMessage['sender']; body: string }[];
  return rows.reverse().map((r) => ({ sender: r.sender, body: r.body }));
}

/** POST /api/conversations/:token/messages — customer message → AI reply (§9, §4). */
export async function postMessage(c: Context<AppEnv>): Promise<Response> {
  const conversation = c.get('conversation');
  const deps = c.get('deps');
  const { db } = deps;

  const raw = await c.req.json().catch(() => null);
  const parsed = postMessageSchema.safeParse(raw);
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  // Store the ORIGINAL (pre-mask) customer text; PII masking happens only on the
  // way to the LLM (§2).
  const { data: customerMsg, error: e1 } = await db
    .from('messages')
    .insert({ conversation_id: conversation.id, sender: 'customer', body: parsed.data.body })
    .select()
    .single();
  if (e1 || !customerMsg) return c.json({ error: 'server_error' }, 500);

  const history = await fetchHistory(db, conversation.id);
  const ai = await generateAiReply(deps, conversation, history);

  if (ai.aiMeta.escalate) {
    const reason = ai.aiMeta.reason === 'none' ? 'other' : ai.aiMeta.reason;
    await escalateConversation(db, conversation, reason);
  }

  const { data: aiMsg, error: e2 } = await db
    .from('messages')
    .insert({
      conversation_id: conversation.id,
      sender: 'ai',
      body: ai.answer,
      ai_meta: ai.aiMeta,
    })
    .select()
    .single();
  if (e2 || !aiMsg) return c.json({ error: 'server_error' }, 500);

  await db
    .from('conversations')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', conversation.id);

  return c.json({
    customer_message: customerMsg,
    reply: aiMsg,
    escalated: ai.aiMeta.escalate,
    status: ai.aiMeta.escalate ? 'escalated' : conversation.status,
  });
}

/** GET /api/conversations/:token/messages — history / polling (§6.3). */
export async function getMessages(c: Context<AppEnv>): Promise<Response> {
  const conversation = c.get('conversation');
  const { db } = c.get('deps');

  const since = c.req.query('since');
  let query = db
    .from('messages')
    .select('*')
    .eq('conversation_id', conversation.id)
    .order('id', { ascending: true });
  if (since && /^\d+$/.test(since)) query = query.gt('id', Number(since));

  const { data, error } = await query;
  if (error) return c.json({ error: 'server_error' }, 500);
  return c.json({
    messages: data ?? [],
    status: conversation.status,
    reply_due_at: conversation.reply_due_at,
  });
}
