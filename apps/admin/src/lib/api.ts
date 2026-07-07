import type {
  AiMeta,
  Channel,
  ConvStatus,
  KbChangeLog,
  KbRule,
  LanguageCode,
  Role,
  Sender,
  Staff,
} from '@vertex/shared';
import { supabase } from './supabase';

const API_BASE = import.meta.env.VITE_API_BASE_URL;

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init?.headers ?? {}),
    },
  });
  if (!res.ok) throw new ApiError(res.status, `request_failed_${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

// --- Inbox / conversations (§7.2, §7.3) ---
export interface InboxRow {
  id: string;
  status: ConvStatus;
  language: LanguageCode;
  channel: Channel;
  source_tag: string;
  topic_category: string;
  reply_due_at: string | null;
  created_at: string;
  question: string;
  answered_by: string;
}

export interface DetailMessage {
  id: number;
  conversation_id: string;
  sender: Sender;
  staff_id: string | null;
  body: string;
  ai_meta: AiMeta | null;
  created_at: string;
}

export interface ConversationDetail {
  conversation: {
    id: string;
    status: ConvStatus;
    language: LanguageCode;
    channel: Channel;
    source_tag: string;
    topic_category: string;
    contact_email: string;
    assigned_staff: string | null;
    reply_due_at: string | null;
    created_at: string;
    updated_at: string;
  };
  messages: DetailMessage[];
  draft: string;
}

export interface InboxFilters {
  q?: string;
  status?: string;
  channel?: string;
  language?: string;
  assigned?: string;
}

function qs(filters: InboxFilters): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : '';
}

export interface MeResult {
  staff: { userId: string; name: string; role: Role; isActive: boolean };
}

export const api = {
  me: () => request<MeResult>(`/api/admin/me`),
  listConversations: (f: InboxFilters = {}) =>
    request<{ conversations: InboxRow[] }>(`/api/admin/conversations${qs(f)}`),
  getConversation: (id: string) =>
    request<ConversationDetail>(`/api/admin/conversations/${id}`),
  patchConversation: (id: string, body: { status?: ConvStatus; assigned_staff?: string | null }) =>
    request<{ ok: true }>(`/api/admin/conversations/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  reply: (id: string, body: string) =>
    request<{ message: DetailMessage }>(`/api/admin/conversations/${id}/reply`, {
      method: 'POST',
      body: JSON.stringify({ body }),
    }),
  translate: (id: string, text: string) =>
    request<{ translation: string }>(`/api/admin/conversations/${id}/translate`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  aiDraft: (id: string) =>
    request<{ draft: string }>(`/api/admin/conversations/${id}/ai-draft`, { method: 'POST' }),
  saveDraft: (id: string, body: string) =>
    request<{ ok: true }>(`/api/admin/conversations/${id}/draft`, {
      method: 'PUT',
      body: JSON.stringify({ body }),
    }),

  // --- knowledge / review / history (§7.4, §7.5, §7.7) ---
  listRules: (f: { q?: string; category?: string; status?: string } = {}) =>
    request<{ rules: KbRule[] }>(`/api/admin/rules${qs(f)}`),
  createRule: (body: Partial<KbRule>) =>
    request<{ rule: KbRule }>(`/api/admin/rules`, { method: 'POST', body: JSON.stringify(body) }),
  updateRule: (id: string, body: Partial<KbRule>) =>
    request<{ rule: KbRule }>(`/api/admin/rules/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
  approveRules: (ids: string[]) =>
    request<{ approved: string[] }>(`/api/admin/rules/approve`, {
      method: 'POST',
      body: JSON.stringify({ ids }),
    }),
  splitRule: (id: string, customer_text: string, internal_text: string) =>
    request<{ customer_rule: KbRule; internal_rule: KbRule }>(`/api/admin/rules/${id}/split`, {
      method: 'POST',
      body: JSON.stringify({ customer_text, internal_text }),
    }),
  listChangelog: () => request<{ entries: KbChangeLog[] }>(`/api/admin/changelog`),

  // --- staff (§7.6) ---
  listStaff: () => request<{ staff: Staff[] }>(`/api/admin/staff`),
  createStaff: (body: {
    name: string;
    email: string;
    role?: Role;
    languages?: string[];
    channels?: Channel[];
    slack_member_id?: string;
  }) => request<{ staff: Staff }>(`/api/admin/staff`, { method: 'POST', body: JSON.stringify(body) }),
  updateStaff: (id: string, body: Partial<Staff>) =>
    request<{ staff: Staff }>(`/api/admin/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
