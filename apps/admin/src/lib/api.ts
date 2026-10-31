import type {
  AiMeta,
  Channel,
  ConvStatus,
  IntakeInfo,
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
    public code = '',
    /** Parsed JSON error body, when the server sent one. */
    public body: unknown = null,
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
  if (!res.ok) {
    // Surface the server's error code (e.g. 'last_active_admin') when present.
    let code = '';
    let body: unknown = null;
    try {
      body = await res.clone().json();
      code = (body as { error?: string }).error ?? '';
    } catch {
      /* non-JSON error body */
    }
    throw new ApiError(res.status, `request_failed_${res.status}`, code, body);
  }
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
  customer_name: string;
  contact_email: string;
  contact_whatsapp: string;
  short_id: string;
  reply_due_at: string | null;
  created_at: string;
  question: string;
  answered_by: string;
}

/** A diagnosed AI turn (★v1.8 §7.9). */
export interface DiagnosticRow {
  message_id: number;
  conversation_id: string;
  created_at: string;
  question: string;
  answer: string;
  action: AiMeta['action'];
  reason: AiMeta['reason'];
  diag: NonNullable<AiMeta['diag']>;
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
    customer_name: string;
    contact_email: string;
    contact_whatsapp: string;
    intake_info: IntakeInfo;
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

// --- CSV import (§7.4 v1.7) ---
export interface ImportChange {
  id: string;
  category: string;
  decision: string;
  changes: { field: string; from: string; to: string }[];
}
export interface ImportError {
  line: number;
  id: string;
  reason: string;
}
export type ImportMode = 'update' | 'replace';

export interface ImportPreview {
  summary: {
    changed: number;
    unchanged: number;
    ignored: number;
    errors: number;
    /** ★v1.8 Replace all only. */
    added?: number;
    archived?: number;
  };
  changes: ImportChange[];
  errors: ImportError[];
  /** ★v1.8 Replace all only. */
  mode?: ImportMode;
  new_rules?: { line: number; id: string; category: string; text: string }[];
  to_archive?: { count: number; sample: { id: string; category: string; status: string }[] };
  active_before?: number;
  active_after?: number;
}
export interface ImportApplyResult {
  applied: number;
  skipped: number;
  snapshot_id: string | null;
  errors: ImportError[];
  /** ★v1.8 Replace all only. */
  added?: number;
  archived?: number;
  active_after?: number;
}

// --- AI behaviour (★v1.8 Phase 2, §7.8) ---
export interface AiSafetyCheck {
  id: string;
  label: string;
  pass: boolean;
  detail: string;
  excerpt?: string;
}
export interface AiSafetyReport {
  passed: boolean;
  checks: AiSafetyCheck[];
  ran_at: string;
}
export interface AiBehaviourVersion {
  id: number;
  state: 'draft' | 'published' | 'superseded';
  common_behaviour: string;
  topic_instructions: Record<string, string>;
  created_at: string;
  published_at: string | null;
  safety_report: AiSafetyReport | null;
  note: string;
  based_on: number | null;
}
export interface AiBehaviourVersionSummary {
  id: number;
  state: AiBehaviourVersion['state'];
  created_at: string;
  created_by_name: string;
  published_at: string | null;
  published_by_name: string;
  note: string;
  based_on: number | null;
  safety_passed: boolean | null;
}
export interface AiBehaviourState {
  fixed: { system: string; safety_rules: string };
  default_common_behaviour: string;
  topics: { id: string; label: string }[];
  limits: { commonTarget: number; topicTarget: number; max: number };
  latest: AiBehaviourVersion | null;
  published: AiBehaviourVersion | null;
  versions: AiBehaviourVersionSummary[];
}
export interface AiPublishResult {
  published: boolean;
  version_id: number;
  report: AiSafetyReport;
}
export interface AiTryResult {
  answer: string;
  action: string;
  reason: string;
  follow_up: { question: string; options: string[] } | null;
  rule_ids: string[];
  detected_language: string;
  format_ok: boolean;
}

/** A kept knowledge backup (★v1.8 §7.4.2). */
export interface KbSnapshot {
  id: string;
  kind: 'replace_all' | 'disable_view' | 'restore' | string;
  created_at: string;
  created_by_name: string;
  rule_count: number;
  affected_count: number;
  undone: boolean;
  note: string;
}

export type ExportFilters = { q?: string; category?: string; status?: string };

/** Download the knowledge CSV. Uses blob() (not text()) to preserve the UTF-8 BOM. */
async function downloadRulesCsv(scope: 'all' | 'filtered', filters: ExportFilters = {}): Promise<void> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  const p = new URLSearchParams({ scope });
  if (scope === 'filtered') for (const [k, v] of Object.entries(filters)) if (v) p.set(k, v);
  const res = await fetch(`${API_BASE}/api/admin/rules/export?${p.toString()}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new ApiError(res.status, `export_failed_${res.status}`);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `knowledge-${scope}-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/**
 * Publish / restore (★v1.8 §7.8): a 422 is not an error for the caller — it
 * carries the safety report saying why the version was NOT published.
 */
async function publishLike(path: string): Promise<AiPublishResult> {
  try {
    return await request<AiPublishResult>(path, { method: 'POST', body: '{}' });
  } catch (e) {
    if (e instanceof ApiError && e.status === 422 && e.body) return e.body as AiPublishResult;
    throw e;
  }
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
  downloadRulesCsv,
  importPreview: (csv: string, mode: ImportMode = 'update') =>
    request<ImportPreview>(`/api/admin/rules/import/preview`, {
      method: 'POST',
      body: JSON.stringify({ csv, mode }),
    }),
  importApply: (csv: string, mode: ImportMode = 'update', confirm?: string) =>
    request<ImportApplyResult>(`/api/admin/rules/import/apply`, {
      method: 'POST',
      body: JSON.stringify({ csv, mode, confirm }),
    }),
  // --- AI behaviour (★v1.8 Phase 2, §7.8) ---
  getAiBehaviour: () => request<AiBehaviourState>(`/api/admin/ai-behaviour`),
  getAiBehaviourVersion: (id: number) =>
    request<{ version: AiBehaviourVersion }>(`/api/admin/ai-behaviour/versions/${id}`),
  saveAiBehaviour: (body: {
    common_behaviour: string;
    topic_instructions: Record<string, string>;
    note: string;
    based_on?: number;
  }) =>
    request<{ version: AiBehaviourVersion }>(`/api/admin/ai-behaviour/versions`, {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  publishAiBehaviour: (id: number) => publishLike(`/api/admin/ai-behaviour/versions/${id}/publish`),
  restoreAiBehaviour: (id: number) => publishLike(`/api/admin/ai-behaviour/versions/${id}/restore`),
  tryAiBehaviour: (body: { question: string; topic: string; common_behaviour: string; topic_text: string }) =>
    request<AiTryResult>(`/api/admin/ai-behaviour/try`, { method: 'POST', body: JSON.stringify(body) }),
  // --- bulk operations + backups (★v1.8 §7.4.2) ---
  disableView: (ids: string[], description: string) =>
    request<{ disabled: number; snapshot_id: string | null; active_after?: number }>(`/api/admin/rules/disable-view`, {
      method: 'POST',
      body: JSON.stringify({ ids, description }),
    }),
  archiveAll: (confirmCount: number) =>
    request<{ archived: number; snapshot_id: string | null }>(`/api/admin/rules/archive-all`, {
      method: 'POST',
      body: JSON.stringify({ confirm: 'ARCHIVE', confirm_count: confirmCount }),
    }),
  deleteArchived: (confirmCount: number) =>
    request<{ deleted: number; snapshot_id: string | null }>(`/api/admin/rules/delete-archived`, {
      method: 'POST',
      body: JSON.stringify({ confirm: 'DELETE', confirm_count: confirmCount }),
    }),
  listSnapshots: () => request<{ snapshots: KbSnapshot[] }>(`/api/admin/rules/snapshots`),
  undoSnapshot: (id: string) =>
    request<{ restored: number }>(`/api/admin/rules/snapshots/${id}/undo`, { method: 'POST', body: '{}' }),
  restoreSnapshot: (id: string) =>
    request<{ restored: number }>(`/api/admin/rules/snapshots/${id}/restore`, { method: 'POST', body: '{}' }),
  /** ★v1.8: rules the bot can use right now (Dashboard warning when 0). */
  kbHealth: () => request<{ active_rules: number }>(`/api/admin/kb-health`),
  listChangelog: () => request<{ entries: KbChangeLog[] }>(`/api/admin/changelog`),
  // --- AI diagnostics (★v1.8 §7.9) ---
  listAiDiagnostics: (result?: string) =>
    request<{ rows: DiagnosticRow[]; summary: Record<string, number>; window: number }>(
      `/api/admin/ai-diagnostics${result ? `?result=${encodeURIComponent(result)}` : ''}`,
    ),

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
  deleteStaff: (id: string) =>
    request<{ deleted: boolean; auth_user_removed: boolean }>(`/api/admin/staff/${id}`, { method: 'DELETE' }),
  updateStaff: (id: string, body: Partial<Staff>) =>
    request<{ staff: Staff }>(`/api/admin/staff/${id}`, {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),
};
