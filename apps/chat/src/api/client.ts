import type { EscalationReason } from '@vertex/shared';

// Default to the IPv4 loopback: `wrangler dev` binds 127.0.0.1 only, while
// browsers resolve "localhost" to IPv6 (::1) first and would fail to connect.
const API_BASE =
  (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? 'http://127.0.0.1:8787';

export interface ApiMessage {
  id: number;
  sender: 'customer' | 'ai' | 'staff' | 'system';
  body: string;
  ai_meta: { escalate: boolean; reason: string; rule_ids: string[]; model: string } | null;
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
  status: string;
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

export function getMessages(token: string, since?: number): Promise<MessagesResult> {
  const q = since ? `?since=${since}` : '';
  return request(`/api/conversations/${token}/messages${q}`, { method: 'GET' });
}

export function postContact(
  token: string,
  input: { name?: string; email?: string; whatsapp?: string; reason?: EscalationReason },
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
