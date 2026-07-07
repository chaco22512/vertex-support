import type { Context } from 'hono';
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  draftStaffReply,
  fetchScopedRules,
  resolveKbCategories,
  translateToEnglish,
  type HistoryMessage,
} from '@vertex/ai';
import type { AppEnv } from '../../types';
import { menu } from '../../lib/menu';
import { notifyStaffReply } from '../../lib/notify';
import { draftBodySchema, patchConversationSchema, replySchema, translateSchema } from '../../dto';

interface ConversationRow {
  id: string;
  status: string;
  language: string;
  channel: string;
  source_tag: string;
  topic_category: string;
  contact_email: string;
  assigned_staff: string | null;
  reply_due_at: string | null;
  created_at: string;
}

async function history(db: SupabaseClient, conversationId: string): Promise<HistoryMessage[]> {
  const { data } = await db
    .from('messages')
    .select('sender,body')
    .eq('conversation_id', conversationId)
    .order('id', { ascending: true })
    .limit(20);
  return ((data ?? []) as { sender: HistoryMessage['sender']; body: string }[]).map((m) => ({
    sender: m.sender,
    body: m.body,
  }));
}

/** GET /api/admin/conversations — Inbox list with filters/search (§7.2). */
export async function listConversations(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const q = c.req.query('q')?.trim();
  const status = c.req.query('status');
  const channel = c.req.query('channel');
  const language = c.req.query('language');
  const assigned = c.req.query('assigned');

  let matchIds: string[] | null = null;
  if (q) {
    const { data } = await db
      .from('messages')
      .select('conversation_id')
      .eq('sender', 'customer')
      .ilike('body', `%${q}%`);
    matchIds = [...new Set(((data ?? []) as { conversation_id: string }[]).map((m) => m.conversation_id))];
    if (matchIds.length === 0) return c.json({ conversations: [] });
  }

  let query = db.from('conversations').select('*').order('reply_due_at', { ascending: true });
  if (status) query = query.eq('status', status);
  if (channel) query = query.eq('channel', channel);
  if (language) query = query.eq('language', language);
  if (assigned === 'me') query = query.eq('assigned_staff', c.get('staff').userId);
  if (matchIds) query = query.in('id', matchIds);

  const { data, error } = await query;
  if (error) return c.json({ error: 'server_error' }, 500);
  const rows = (data ?? []) as ConversationRow[];

  // Enrich with first customer question + who answered (staff name / AI).
  const ids = rows.map((r) => r.id);
  const questions = new Map<string, string>();
  if (ids.length > 0) {
    const { data: msgs } = await db
      .from('messages')
      .select('conversation_id,sender,body,id')
      .in('conversation_id', ids)
      .eq('sender', 'customer')
      .order('id', { ascending: true });
    for (const m of (msgs ?? []) as { conversation_id: string; body: string }[]) {
      if (!questions.has(m.conversation_id)) questions.set(m.conversation_id, m.body);
    }
  }
  const { data: staffRows } = await db.from('staff').select('id,name');
  const staffNames = new Map(
    ((staffRows ?? []) as { id: string; name: string }[]).map((s) => [s.id, s.name]),
  );

  const conversations = rows.map((r) => ({
    id: r.id,
    status: r.status,
    language: r.language,
    channel: r.channel,
    source_tag: r.source_tag,
    topic_category: r.topic_category,
    reply_due_at: r.reply_due_at,
    created_at: r.created_at,
    question: (questions.get(r.id) ?? '').slice(0, 40),
    answered_by:
      r.status === 'staff_replied' && r.assigned_staff
        ? (staffNames.get(r.assigned_staff) ?? 'Staff')
        : 'AI',
  }));
  return c.json({ conversations });
}

/** GET /api/admin/conversations/:id — full thread + draft (§7.3). */
export async function getConversation(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const id = c.req.param('id') ?? '';
  const { data: conversation, error } = await db
    .from('conversations')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  if (error) return c.json({ error: 'server_error' }, 500);
  if (!conversation) return c.json({ error: 'not_found' }, 404);

  const { data: messages } = await db
    .from('messages')
    .select('*')
    .eq('conversation_id', id)
    .order('id', { ascending: true });
  const { data: draft } = await db
    .from('reply_drafts')
    .select('body')
    .eq('conversation_id', id)
    .maybeSingle();

  return c.json({
    conversation,
    messages: messages ?? [],
    draft: (draft as { body: string } | null)?.body ?? '',
  });
}

/** PATCH /api/admin/conversations/:id — status / assignment (Resolve/Reopen/Reassign, §7.3). */
export async function patchConversation(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const id = c.req.param('id') ?? '';
  const parsed = patchConversationSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (parsed.data.status !== undefined) patch.status = parsed.data.status;
  if (parsed.data.assigned_staff !== undefined) patch.assigned_staff = parsed.data.assigned_staff;

  const { error } = await db.from('conversations').update(patch).eq('id', id);
  if (error) return c.json({ error: 'server_error' }, 500);
  return c.json({ ok: true });
}

/** POST /api/admin/conversations/:id/reply — staff reply (§7.3). */
export async function replyConversation(c: Context<AppEnv>): Promise<Response> {
  const deps = c.get('deps');
  const { db } = deps;
  const staff = c.get('staff');
  const id = c.req.param('id') ?? '';
  const parsed = replySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);

  const { data: msg, error } = await db
    .from('messages')
    .insert({ conversation_id: id, sender: 'staff', staff_id: staff.userId, body: parsed.data.body })
    .select()
    .single();
  if (error || !msg) return c.json({ error: 'server_error' }, 500);

  const now = new Date().toISOString();
  await db.from('conversations').update({ status: 'staff_replied', updated_at: now }).eq('id', id);

  const { data: conv } = await db
    .from('conversations')
    .select('contact_email,language,session_token')
    .eq('id', id)
    .maybeSingle();
  const c2 = conv as { contact_email: string; language: string; session_token: string } | null;
  if (c2?.contact_email) {
    await notifyStaffReply(deps, {
      conversationId: id,
      contactEmail: c2.contact_email,
      language: c2.language,
      sessionToken: c2.session_token,
    });
  }
  return c.json({ message: msg });
}

/** POST /api/admin/conversations/:id/translate — customer text → English (§7.3). */
export async function translate(c: Context<AppEnv>): Promise<Response> {
  const { llm } = c.get('deps');
  const parsed = translateSchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
  const translation = await translateToEnglish(llm, parsed.data.text);
  return c.json({ translation });
}

/**
 * POST /api/admin/conversations/:id/ai-draft — generate a reply draft (§7.3).
 * Returns text for the reply box only; it is never auto-sent (Hard rule 4).
 */
export async function aiDraft(c: Context<AppEnv>): Promise<Response> {
  const { db, llm } = c.get('deps');
  const id = c.req.param('id') ?? '';
  const { data: conv } = await db
    .from('conversations')
    .select('language,topic_category')
    .eq('id', id)
    .maybeSingle();
  if (!conv) return c.json({ error: 'not_found' }, 404);
  const conversation = conv as { language: string; topic_category: string };

  const categories = resolveKbCategories(conversation.topic_category, menu);
  const rules = await fetchScopedRules(db, categories);
  const draft = await draftStaffReply(llm, {
    rules,
    history: await history(db, id),
    language: conversation.language,
  });
  return c.json({ draft });
}

/** GET/PUT /api/admin/conversations/:id/draft — autosave (§7.3, 3s). */
export async function putDraft(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const staff = c.get('staff');
  const id = c.req.param('id') ?? '';
  const parsed = draftBodySchema.safeParse(await c.req.json().catch(() => null));
  if (!parsed.success) return c.json({ error: 'invalid_body' }, 400);
  const { error } = await db.from('reply_drafts').upsert({
    conversation_id: id,
    staff_id: staff.userId,
    body: parsed.data.body,
    updated_at: new Date().toISOString(),
  });
  if (error) return c.json({ error: 'server_error' }, 500);
  return c.json({ ok: true });
}
