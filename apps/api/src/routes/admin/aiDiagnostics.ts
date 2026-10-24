import type { Context } from 'hono';
import type { AiMeta } from '@vertex/shared';
import type { AppEnv } from '../../types';

/** Most recent diagnosed AI turns returned per request (newest first). */
const MAX_ROWS = 500;
const IN_CHUNK = 100;

interface AiMessageRow {
  id: number;
  conversation_id: string;
  body: string;
  created_at: string;
  ai_meta: AiMeta | null;
}

export interface DiagnosticRow {
  message_id: number;
  conversation_id: string;
  created_at: string;
  /** The customer message the AI was answering (staff-visible, as stored). */
  question: string;
  answer: string;
  action: AiMeta['action'];
  reason: AiMeta['reason'];
  diag: NonNullable<AiMeta['diag']>;
}

/**
 * GET /api/admin/ai-diagnostics — AI turns that escalated or ran the retrieval
 * fallback (spec v1.8 §7.9), newest first, with the customer question each one
 * answered. `result` filters by diag.fallback_result ('error' rows also match
 * on diag.error). The summary counts the whole returned window by outcome so
 * admins can judge the top-K threshold on real traffic.
 */
export async function listAiDiagnostics(c: Context<AppEnv>): Promise<Response> {
  const { db } = c.get('deps');
  const result = c.req.query('result') || null;

  const { data, error } = await db
    .from('messages')
    .select('id,conversation_id,body,created_at,ai_meta')
    .eq('sender', 'ai')
    .not('ai_meta->diag', 'is', null)
    .order('id', { ascending: false })
    .limit(MAX_ROWS);
  if (error) return c.json({ error: 'server_error' }, 500);
  const rows = ((data ?? []) as AiMessageRow[]).filter((r) => r.ai_meta?.diag);

  // The customer message each AI reply answered = latest customer message
  // with a smaller id in the same conversation.
  const convIds = [...new Set(rows.map((r) => r.conversation_id))];
  const customer = new Map<string, { id: number; body: string }[]>();
  for (let i = 0; i < convIds.length; i += IN_CHUNK) {
    const { data: msgs } = await db
      .from('messages')
      .select('id,conversation_id,body')
      .eq('sender', 'customer')
      .in('conversation_id', convIds.slice(i, i + IN_CHUNK));
    for (const m of (msgs ?? []) as { id: number; conversation_id: string; body: string }[]) {
      const list = customer.get(m.conversation_id) ?? [];
      list.push({ id: m.id, body: m.body });
      customer.set(m.conversation_id, list);
    }
  }
  const questionFor = (r: AiMessageRow) =>
    (customer.get(r.conversation_id) ?? [])
      .filter((m) => m.id < r.id)
      .reduce<{ id: number; body: string } | null>((best, m) => (!best || m.id > best.id ? m : best), null)
      ?.body ?? '';

  const all: DiagnosticRow[] = rows.map((r) => ({
    message_id: r.id,
    conversation_id: r.conversation_id,
    created_at: r.created_at,
    question: questionFor(r),
    answer: r.body,
    action: r.ai_meta!.action,
    reason: r.ai_meta!.reason,
    diag: r.ai_meta!.diag!,
  }));

  const summary: Record<string, number> = {};
  for (const r of all) {
    const key = r.diag.fallback_result ?? (r.diag.error ? `error:${r.diag.error}` : 'no_fallback');
    summary[key] = (summary[key] ?? 0) + 1;
  }

  const filtered = result
    ? all.filter((r) => r.diag.fallback_result === result || (result === 'error' && r.diag.error !== null))
    : all;
  return c.json({ rows: filtered, summary, window: all.length });
}
