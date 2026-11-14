import type { EscalationReason, IntakeInfo } from '@vertex/shared';
import type { PublicTile } from '@vertex/shared/tiles';

// Default to the IPv4 loopback: `wrangler dev` binds 127.0.0.1 only, while
// browsers resolve "localhost" to IPv6 (::1) first and would fail to connect.
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:8787';

export interface ApiMessage {
  id: number;
  sender: 'customer' | 'ai' | 'staff' | 'system';
  body: string;
  ai_meta: {
    action?: 'answer' | 'ask' | 'escalate';
    escalate: boolean;
    reason: string;
    rule_ids: string[];
    follow_up?: { question: string; options: string[] } | null;
    model: string;
  } | null;
  created_at: string;
}

export interface CreateResult {
  token: string;
  id: string;
  language: string;
  status: string;
  topic_category: string;
}

export interface PostMessageResult {
  customer_message: ApiMessage;
  reply: ApiMessage;
  escalated: boolean;
  /** ★v1.8: staff were already notified (contact on file) — show no cards. */
  followup_escalated?: boolean;
  status: string;
  /** ★v1.8: the conversation's topic after this turn (may have switched). */
  topic_category?: string;
}

export interface MessagesResult {
  messages: ApiMessage[];
  status: string;
  reply_due_at: string | null;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  return (await res.json()) as T;
}

/**
 * ★2026-11-14 the menu tiles CS manages in the admin ("Topics"). null = use the
 * built-in menu (not set up yet, offline, slow or failed — never blocks the chat).
 * A plain GET (no JSON header) so the browser needs no CORS preflight.
 */
export async function fetchMenu(timeoutMs = 4000): Promise<PublicTile[] | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${API_BASE}/api/menu`, { signal: controller.signal });
    if (!res.ok) return null;
    const body = (await res.json()) as { tiles?: PublicTile[] | null };
    return Array.isArray(body.tiles) && body.tiles.length > 0 ? body.tiles : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export function createConversation(input: {
  language: string;
  source_tag?: string;
  topic_category?: string;
}): Promise<CreateResult> {
  return request('/api/conversations', { method: 'POST', body: JSON.stringify(input) });
}

export function postMessage(token: string, body: string, signal?: AbortSignal): Promise<PostMessageResult> {
  return request(`/api/conversations/${token}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body }),
    signal,
  });
}

/** ★v1.8 "Ask another question": switch the same conversation's topic. */
export function changeTopic(
  token: string,
  topicCategory: string,
): Promise<{ topic_category: string; status: string; followup_escalated: boolean }> {
  return request(`/api/conversations/${token}/topic`, {
    method: 'POST',
    body: JSON.stringify({ topic_category: topicCategory }),
  });
}

export function getMessages(token: string, since?: number): Promise<MessagesResult> {
  const q = since ? `?since=${since}` : '';
  return request(`/api/conversations/${token}/messages${q}`, { method: 'GET' });
}

export function postContact(
  token: string,
  input: { name?: string; email?: string; whatsapp?: string; reason?: EscalationReason; intake?: IntakeInfo },
): Promise<{ status: string; reply_due_at: string | null }> {
  return request(`/api/conversations/${token}/contact`, {
    method: 'POST',
    body: JSON.stringify(input),
  });
}

export function postFeedback(
  token: string,
  type: 'solved' | 'still_need_help',
  reason?: EscalationReason,
): Promise<{ status: string }> {
  return request(`/api/conversations/${token}/feedback`, {
    method: 'POST',
    body: JSON.stringify({ type, reason }),
  });
}
