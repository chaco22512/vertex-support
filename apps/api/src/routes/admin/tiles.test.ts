import { describe, expect, it } from 'vitest';
import type { LlmClient, LlmGenerateRequest } from '@vertex/ai';
import type { Role } from '@vertex/shared';
import { createApp } from '../../index';
import { FakeSupabase } from '../../testing/fakeSupabase';
import { fakeKv, fakeSendEmail, fakeSendSlack, fakeVerifyStaff, goodResponse } from '../../testing/mocks';
import type { ApiBindings } from '../../types';
import menuData from '../../../../../data/menu_categories.json';

/** ★2026-11-14 admin "Topics" — CS-managed chat tiles (menu_tiles). */

const ADMIN = 'http://localhost:5174';
const CHAT = 'http://localhost:5173';

type Raw = { id: string; icon: string; label_en: string; kb_categories?: string[]; id_prefixes?: string[]; sub_questions?: string[]; scope_of?: string; behavior?: string };

/** The bundled tiles as DB rows (what the migration seeds). */
function seedTiles(db: FakeSupabase) {
  db.tables.menu_tiles = (menuData.categories as Raw[]).map((c, i) => ({
    id: c.id,
    position: (i + 1) * 10,
    enabled: true,
    icon: c.icon,
    labels: { en: c.label_en, vi: `VI ${c.label_en}` },
    sub_questions: c.sub_questions ? { en: c.sub_questions } : {},
    id_prefixes: c.id_prefixes ?? [],
    kb_categories: c.kb_categories ?? [],
    scope_of: c.scope_of ?? null,
    behavior: c.behavior ?? '',
  }));
}

function recordingLlm(reply: (req: LlmGenerateRequest) => string = () => goodResponse()) {
  const calls: LlmGenerateRequest[] = [];
  const llm: LlmClient = {
    model: 'mock-model',
    generate: async (req) => {
      calls.push(req);
      return reply(req);
    },
  };
  return { llm, calls };
}

function setup(opts: { role?: Role; tiles?: boolean; llm?: LlmClient } = {}) {
  const db = new FakeSupabase();
  const base = { fee_amounts_jpy: [], links: [], audience: 'customer', ai_can_answer: true, status: 'active' };
  db.tables.kb_rules.push(
    { ...base, id: 'GN001', category: 'General', rule_text: 'Office hours are 10–18.' },
    { ...base, id: 'HPD003', category: 'Holiday', rule_text: 'Request before leaving Japan.' },
    { ...base, id: 'GP002', category: 'Promo', rule_text: '¥500 per SIM', status: 'pending_review' },
    { ...base, id: 'GP007', category: 'Promo', rule_text: 'internal note', audience: 'internal' },
    { ...base, id: 'XY001', category: 'New', rule_text: 'A brand-new topic answer.' },
  );
  db.tables.staff.push({ id: 'staff-1', name: 'Gerry', is_active: true });
  if (opts.tiles !== false) seedTiles(db);
  const slack = fakeSendSlack();
  const kv = fakeKv();
  const llm = opts.llm ?? recordingLlm().llm;
  const env: ApiBindings = {
    SUPABASE_URL: 'x',
    SUPABASE_ANON_KEY: 'x',
    SUPABASE_SERVICE_ROLE_KEY: 'x',
    GEMINI_API_KEY: 'x',
    SLACK_WEBHOOK_URL: 'x',
    RESEND_API_KEY: 'x',
    ADMIN_BASE_URL: ADMIN,
    CHAT_BASE_URL: CHAT,
    RATE_LIMIT: kv,
  };
  const app = createApp((e) => ({
    db: db.asClient(),
    llm,
    kv,
    adminOrigin: e.ADMIN_BASE_URL,
    chatOrigin: e.CHAT_BASE_URL ?? '',
    verifyStaff: fakeVerifyStaff(opts.role ?? 'admin'),
    sendSlack: slack,
    sendEmail: fakeSendEmail(),
    emailFrom: 'test@resend.dev',
  }));
  const headers = { Authorization: 'Bearer tok', Origin: ADMIN, 'Content-Type': 'application/json' };
  const chatHeaders = { Origin: CHAT, 'Content-Type': 'application/json' };
  const req = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers, body: body === undefined ? undefined : JSON.stringify(body) }, env);
  const chat = (method: string, path: string, body?: unknown) =>
    app.request(path, { method, headers: chatHeaders, body: body === undefined ? undefined : JSON.stringify(body) }, env);
  return { app, db, env, slack, req, chat };
}

const newTile = (o: Record<string, unknown> = {}) => ({
  labels: { en: 'Holiday plans', vi: 'Gói kỳ nghỉ' },
  icon: 'ti-plane',
  id_prefixes: ['HPD', 'GN'],
  sub_questions: { en: ['How do I apply?', ''] },
  ...o,
});

type ListBody = {
  tiles: { id: string; enabled: boolean; no_knowledge: boolean; instructions: string; other_unpublished_changes: boolean }[];
  codes: { code: string; rule_count: number }[];
};

describe('GET /api/menu (customer chat)', () => {
  it('returns the enabled tiles in order with "Something else" last', async () => {
    const s = setup();
    s.db.tables.menu_tiles!.find((t) => t.id === 'plans')!.enabled = false;
    s.db.tables.menu_tiles!.find((t) => t.id === 'others')!.position = 1;
    const res = await s.chat('GET', '/api/menu');
    expect(res.status).toBe(200);
    expect(res.headers.get('Cache-Control')).toContain('max-age=30');
    const { tiles } = (await res.json()) as { tiles: { id: string; labels: Record<string, string> }[] };
    const ids = tiles.map((t) => t.id);
    expect(ids).not.toContain('plans');
    expect(ids.at(-1)).toBe('others');
    expect(tiles[0]!.labels).toMatchObject({ en: 'Set up APN or mobile internet' });
    // Only customer-facing fields.
    expect(Object.keys(tiles[0]!).sort()).toEqual(['behavior', 'icon', 'id', 'labels', 'sub_questions']);
  });

  it('returns tiles=null before the table is seeded (chat uses its built-in menu)', async () => {
    const s = setup({ tiles: false });
    expect(await (await s.chat('GET', '/api/menu')).json()).toEqual({ tiles: null });
  });
});

describe('admin tiles — create / edit / order / hide', () => {
  it('creates a tile before "Something else"; it reaches the chat menu at once; logged + Slack', async () => {
    const s = setup();
    const res = await s.req('POST', '/api/admin/tiles', newTile({ labels: { en: 'Holiday trips' } }));
    expect(res.status).toBe(201);
    const body = (await res.json()) as { tile: { id: string }; no_knowledge: boolean };
    expect(body.tile.id).toBe('holiday_trips');
    expect(body.no_knowledge).toBe(false);
    const menu = (await (await s.chat('GET', '/api/menu')).json()) as { tiles: { id: string; sub_questions: Record<string, string[]> }[] };
    expect(menu.tiles.map((t) => t.id).slice(-2)).toEqual(['holiday_trips', 'others']);
    expect(menu.tiles.find((t) => t.id === 'holiday_trips')!.sub_questions).toEqual({ en: ['How do I apply?'] });
    expect(s.db.tables.menu_tile_change_log).toEqual([
      expect.objectContaining({ tile_id: 'holiday_trips', action: 'create', changed_by: 'staff-1' }),
    ]);
    expect(s.slack.calls.at(-1)).toContain('New chat topic "Holiday trips"');
  });

  it('gives a unique id when the label repeats and requires an English label / known icon', async () => {
    const s = setup();
    expect(((await (await s.req('POST', '/api/admin/tiles', newTile({ labels: { en: 'Plans' } }))).json()) as { tile: { id: string } }).tile.id).toBe('plans_2');
    expect((await s.req('POST', '/api/admin/tiles', newTile({ labels: { en: ' ', vi: 'x' } }))).status).toBe(400);
    expect((await s.req('POST', '/api/admin/tiles', newTile({ icon: 'ti-nope' }))).status).toBe(400);
    expect((await s.req('POST', '/api/admin/tiles', newTile({ id_prefixes: ['hp1'] }))).status).toBe(400);
  });

  it('warns when the connected knowledge has no rule the AI can use (GN, pending and internal do not count)', async () => {
    const s = setup();
    const res = await s.req('POST', '/api/admin/tiles', newTile({ labels: { en: 'Promos' }, id_prefixes: ['GP', 'GN'] }));
    expect(((await res.json()) as { no_knowledge: boolean }).no_knowledge).toBe(true);
    expect(s.slack.calls.at(-1)).toContain('No knowledge yet');
    const list = (await (await s.req('GET', '/api/admin/tiles')).json()) as ListBody;
    expect(list.tiles.find((t) => t.id === 'promos')!.no_knowledge).toBe(true);
    expect(list.tiles.find((t) => t.id === 'holiday')!.no_knowledge).toBe(false);
    expect(list.codes.find((c) => c.code === 'GP')!.rule_count).toBe(0);
    expect(list.codes.find((c) => c.code === 'XY')!.rule_count).toBe(1);
  });

  it('edits and hides a tile (hidden tiles leave the chat menu); "Something else" cannot be hidden', async () => {
    const s = setup();
    const res = await s.req('PUT', '/api/admin/tiles/holiday', newTile({ enabled: false }));
    expect(res.status).toBe(200);
    const menu = (await (await s.chat('GET', '/api/menu')).json()) as { tiles: { id: string }[] };
    expect(menu.tiles.map((t) => t.id)).not.toContain('holiday');
    expect(s.db.tables.menu_tile_change_log!.at(-1)).toMatchObject({ tile_id: 'holiday', action: 'disable' });
    expect(s.slack.calls.at(-1)).toContain('hidden');
    const others = await s.req('PUT', '/api/admin/tiles/others', newTile({ labels: { en: 'Other' }, enabled: false }));
    expect(others.status).toBe(400);
    expect((await s.req('PUT', '/api/admin/tiles/nope', newTile())).status).toBe(404);
  });

  it('keeps the codes of "Something else" (*) and of a tile sharing another range', async () => {
    const s = setup();
    await s.req('PUT', '/api/admin/tiles/others', newTile({ labels: { en: 'Other' }, id_prefixes: ['XY'] }));
    await s.req('PUT', '/api/admin/tiles/connection', newTile({ labels: { en: 'Signal' }, id_prefixes: ['XY'] }));
    const byId = (id: string) => s.db.tables.menu_tiles!.find((t) => t.id === id)!;
    expect(byId('others').id_prefixes).toEqual(['*']);
    expect(byId('connection').id_prefixes).toEqual([]);
    expect(byId('others').labels).toEqual({ en: 'Other' });
  });

  it('reorders tiles with "Something else" forced last; rejects a stale list', async () => {
    const s = setup();
    const ids = s.db.tables.menu_tiles!.map((t) => t.id as string).filter((i) => i !== 'others');
    const wanted = ['holiday', ...ids.filter((i) => i !== 'holiday'), 'others'];
    const res = await s.req('POST', '/api/admin/tiles/order', { ids: ['others', ...wanted] });
    expect(res.status).toBe(200);
    const menu = (await (await s.chat('GET', '/api/menu')).json()) as { tiles: { id: string }[] };
    expect(menu.tiles[0]!.id).toBe('holiday');
    expect(menu.tiles.at(-1)!.id).toBe('others');
    expect(s.db.tables.menu_tile_change_log!.at(-1)).toMatchObject({ action: 'reorder' });
    expect((await s.req('POST', '/api/admin/tiles/order', { ids: ['holiday'] })).status).toBe(409);
  });

  it('is admin-only and says when the tiles are not in the database yet', async () => {
    expect((await setup({ role: 'staff' }).req('GET', '/api/admin/tiles')).status).toBe(403);
    expect((await setup({ tiles: false }).req('GET', '/api/admin/tiles')).status).toBe(503);
    expect((await setup({ tiles: false }).req('POST', '/api/admin/tiles', newTile())).status).toBe(503);
  });
});

describe('admin tiles — topic instructions are a draft until Publish', () => {
  it('saves only this topic into a new draft that copies the latest version', async () => {
    const s = setup();
    await s.db.asClient().from('ai_prompt_versions').insert({ state: 'published', common_behaviour: 'C', topic_instructions: { cancel: 'X' } });
    await s.db.asClient().from('ai_prompt_versions').insert({ state: 'draft', common_behaviour: 'C2', topic_instructions: { cancel: 'X2' } });
    const res = await s.req('POST', '/api/admin/tiles/holiday/instructions', { text: 'Ask whether they are still in Japan.' });
    expect(res.status).toBe(201);
    const v = s.db.tables.ai_prompt_versions!.at(-1)!;
    expect(v).toMatchObject({
      state: 'draft',
      common_behaviour: 'C2',
      based_on: 2,
      topic_instructions: { cancel: 'X2', holiday: 'Ask whether they are still in Japan.' },
    });
    // Published version untouched — nothing live changes before Publish.
    expect(s.db.tables.ai_prompt_versions![0]).toMatchObject({ state: 'published', topic_instructions: { cancel: 'X' } });
    expect(s.db.tables.ai_prompt_change_log!.at(-1)).toMatchObject({ action: 'save_draft' });
    const list = (await (await s.req('GET', '/api/admin/tiles')).json()) as ListBody;
    const holiday = list.tiles.find((t) => t.id === 'holiday')!;
    expect(holiday.instructions).toBe('Ask whether they are still in Japan.');
    expect(holiday.other_unpublished_changes).toBe(true); // C2 / cancel X2 are unpublished too
  });

  it('a new tile gets its own tab in AI behaviour', async () => {
    const s = setup();
    await s.req('POST', '/api/admin/tiles', newTile({ labels: { en: 'Holiday trips' } }));
    const body = (await (await s.req('GET', '/api/admin/ai-behaviour')).json()) as { topics: { id: string }[] };
    expect(body.topics.map((t) => t.id)).toContain('holiday_trips');
    const save = await s.req('POST', '/api/admin/ai-behaviour/versions', {
      common_behaviour: '',
      topic_instructions: { holiday_trips: 'Be brief.' },
      note: '',
    });
    expect(save.status).toBe(201);
  });
});

describe('admin tiles — translate draft', () => {
  it('drafts the 4 other languages in one AI call', async () => {
    const { llm, calls } = recordingLlm(() =>
      JSON.stringify({
        id: { label: 'Paket liburan', questions: ['Bagaimana cara mendaftar?'] },
        tl: { label: 'Mga holiday plan', questions: ['Paano mag-apply?'] },
        ne: { label: 'होलिडे योजना', questions: ['कसरी आवेदन दिने?'] },
        vi: { label: 'Gói kỳ nghỉ', questions: ['wrong', 'count'] },
      }),
    );
    const s = setup({ llm });
    const res = await s.req('POST', '/api/admin/tiles/translate', { label: 'Holiday plans', sub_questions: ['How do I apply?'] });
    const body = (await res.json()) as { labels: Record<string, string>; sub_questions: Record<string, string[]> };
    expect(calls).toHaveLength(1);
    expect(calls[0]!.purpose).toBe('translate');
    expect(body.labels).toEqual({ id: 'Paket liburan', tl: 'Mga holiday plan', ne: 'होलिडे योजना', vi: 'Gói kỳ nghỉ' });
    expect(body.sub_questions.vi).toBeUndefined(); // wrong count → left for CS
    expect(body.sub_questions.id).toEqual(['Bagaimana cara mendaftar?']);
  });

  it('explains plainly when the AI cannot translate', async () => {
    const s = setup({ llm: recordingLlm(() => 'not json').llm });
    const res = await s.req('POST', '/api/admin/tiles/translate', { label: 'X', sub_questions: [] });
    expect(res.status).toBe(502);
    expect(((await res.json()) as { message: string }).message).toContain('leave them empty');
  });
});

describe('DB tiles drive the AI and Topic codes', () => {
  async function start(s: ReturnType<typeof setup>, topic: string): Promise<string> {
    const res = await s.chat('POST', '/api/conversations', { topic_category: topic });
    return ((await res.json()) as { token: string }).token;
  }

  it('a CS-created tile scopes the AI to its codes and shows its label as the topic', async () => {
    const rec = recordingLlm();
    const s = setup({ llm: rec.llm });
    await s.req('POST', '/api/admin/tiles', newTile({ labels: { en: 'Brand new' }, id_prefixes: ['XY'] }));
    const token = await start(s, 'brand_new');
    expect(s.db.tables.messages.some((m) => m.body === 'Topic: Brand new')).toBe(true);
    await s.chat('POST', `/api/conversations/${token}/messages`, { body: 'Tell me about it' });
    const system = rec.calls[0]!.system;
    expect(system).toContain('[XY001]');
    expect(system).not.toContain('[HPD003]');
    expect(system).toContain('brand_new');
  });

  it('a hidden tile is not offered to the model and cannot be chosen again', async () => {
    const rec = recordingLlm();
    const s = setup({ llm: rec.llm });
    await s.req('PUT', '/api/admin/tiles/holiday', newTile({ enabled: false }));
    const token = await start(s, 'cancel');
    await s.chat('POST', `/api/conversations/${token}/messages`, { body: 'hi' });
    expect(rec.calls[0]!.system).not.toMatch(/\bholiday\b.*Holiday plans/);
    expect((await s.chat('POST', `/api/conversations/${token}/topic`, { topic_category: 'holiday' })).status).toBe(400);
  });

  it('Topic codes edits the tiles\' codes directly', async () => {
    const s = setup();
    const res = await s.req('PUT', '/api/admin/topic-codes/XY', { label: 'New', topics: ['holiday', 'lost'] });
    expect(res.status).toBe(200);
    const byId = (id: string) => s.db.tables.menu_tiles!.find((t) => t.id === id)!;
    expect(byId('holiday').id_prefixes).toContain('XY');
    expect(byId('lost').id_prefixes).toContain('XY');
    const list = (await (await s.req('GET', '/api/admin/topic-codes')).json()) as {
      codes: { code: string; extra_topics: string[]; unlinked: boolean }[];
    };
    expect(list.codes.find((c) => c.code === 'XY')).toMatchObject({ extra_topics: ['lost', 'holiday'], unlinked: false });
    await s.req('PUT', '/api/admin/topic-codes/XY', { label: 'New', topics: [] });
    expect(byId('holiday').id_prefixes).not.toContain('XY');
    expect(s.db.tables.menu_tile_change_log!.filter((e) => e.action === 'link_codes')).toHaveLength(4);
  });
});
