import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Minimal in-memory Supabase stand-in for route/lib tests. Supports only the
 * query shapes the API uses: select/insert/update with eq/in/gt/order/limit and
 * single/maybeSingle. Not a general Supabase emulator.
 */
type Row = Record<string, unknown>;
interface Result {
  data: unknown;
  error: { message: string } | null;
}

export class FakeSupabase {
  tables: {
    conversations: Row[];
    messages: Row[];
    kb_rules: Row[];
    kb_change_log: Row[];
    staff: Row[];
    reply_drafts: Row[];
  } & Record<string, Row[]> = {
    conversations: [],
    messages: [],
    kb_rules: [],
    kb_change_log: [],
    staff: [],
    reply_drafts: [],
  };
  private seq: Record<string, number> = {};

  /** Minimal Supabase Auth admin stub for the staff-invite/delete flows (§7.6). */
  authCalls: { invite: number; generateLink: number; deleteUser: number } = {
    invite: 0,
    generateLink: 0,
    deleteUser: 0,
  };
  auth = {
    admin: {
      inviteUserByEmail: async (email: string) => {
        this.authCalls.invite += 1;
        return { data: { user: { id: `user-${email}` } }, error: null };
      },
      generateLink: async ({ email }: { email: string }) => {
        this.authCalls.generateLink += 1;
        return {
          data: { user: { id: `user-${email}` }, properties: { action_link: `https://admin.test/set-password#tok` } },
          error: null,
        };
      },
      deleteUser: async (_id: string) => {
        this.authCalls.deleteUser += 1;
        return { data: {}, error: null };
      },
    },
  };

  from(name: string): FakeQuery {
    this.tables[name] ??= [];
    return new FakeQuery(this, name);
  }

  asClient(): SupabaseClient {
    return this as unknown as SupabaseClient;
  }

  nextId(table: string): number {
    this.seq[table] = (this.seq[table] ?? 0) + 1;
    return this.seq[table];
  }

  /** Calls made through `rpc`, for assertions. */
  rpcCalls: { name: string; args: Record<string, unknown> }[] = [];

  /**
   * In-memory mirrors of the v1.8 bulk-knowledge Postgres functions
   * (supabase/migrations/20261025120014_kb_bulk_ops.sql). Same contract:
   * snapshot (keep 5), bulk status, CSV patches, restore — all logged.
   */
  async rpc(name: string, args: Record<string, unknown>): Promise<Result> {
    this.rpcCalls.push({ name, args });
    const rules = this.tables.kb_rules;
    const log = (rule_id: unknown, before: unknown, after: unknown, source: string, staff: unknown) =>
      this.tables.kb_change_log.push({
        id: this.nextId('kb_change_log'),
        rule_id,
        changed_by: staff,
        changed_at: new Date().toISOString(),
        before,
        after,
        source,
      });
    switch (name) {
      case 'kb_take_snapshot': {
        const snaps = (this.tables.kb_rule_snapshots ??= []);
        const id = crypto.randomUUID();
        snaps.push({
          id,
          kind: args.p_kind,
          created_by: args.p_staff,
          // Strictly increasing so "newest" is well defined within one test.
          created_at: new Date(Date.UTC(2026, 0, 1) + this.nextId('snapshot') * 1000).toISOString(),
          rule_count: rules.length,
          affected_ids: [...((args.p_affected as string[]) ?? [])],
          rows: JSON.parse(JSON.stringify(rules)) as Row[],
          undone: false,
          note: args.p_note ?? '',
        });
        snaps.sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
        this.tables.kb_rule_snapshots = snaps.slice(0, 5);
        return { data: id, error: null };
      }
      case 'kb_bulk_set_status': {
        const ids = new Set(args.p_ids as string[]);
        let n = 0;
        for (const r of rules) {
          if (!ids.has(r.id as string) || r.status === args.p_status) continue;
          log(r.id, { status: r.status }, { status: args.p_status }, args.p_source as string, args.p_staff);
          r.status = args.p_status;
          r.updated_by = args.p_staff;
          n += 1;
        }
        return { data: n, error: null };
      }
      case 'kb_apply_patches': {
        let n = 0;
        for (const item of args.p_patches as { id: string; patch: Row }[]) {
          const r = rules.find((x) => x.id === item.id);
          if (!r) continue;
          const before = { ...r };
          Object.assign(r, item.patch, { updated_by: args.p_staff });
          log(r.id, before, { ...r }, args.p_source as string, args.p_staff);
          n += 1;
        }
        return { data: n, error: null };
      }
      case 'kb_restore_snapshot': {
        const snap = (this.tables.kb_rule_snapshots ?? []).find((s) => s.id === args.p_snapshot);
        if (!snap) return { data: null, error: { message: 'snapshot_not_found' } };
        const only = Boolean(args.p_only_affected);
        const affected = new Set(snap.affected_ids as string[]);
        const snapRows = snap.rows as Row[];
        const inSnap = new Set(snapRows.map((r) => r.id));
        const fields = [
          'rule_text', 'fee_amounts_jpy', 'fee_is_fixed', 'links', 'audience', 'ai_can_answer',
          'status', 'review_reason', 'category', 'subcategory', 'requires_fee_disclaimer',
        ];
        let n = 0;
        for (const s of snapRows) {
          if (only && !affected.has(s.id as string)) continue;
          const r = rules.find((x) => x.id === s.id);
          if (!r) continue;
          if (fields.every((f) => JSON.stringify(r[f]) === JSON.stringify(s[f]))) continue;
          const before = { ...r };
          for (const f of fields) r[f] = s[f];
          log(r.id, before, { ...r }, 'snapshot_restore', args.p_staff);
          n += 1;
        }
        for (const r of rules) {
          if (r.status === 'archived' || inSnap.has(r.id)) continue;
          if (only && !affected.has(r.id as string)) continue;
          log(r.id, { status: r.status }, { status: 'archived' }, 'snapshot_restore', args.p_staff);
          r.status = 'archived';
          n += 1;
        }
        if (only) snap.undone = true;
        return { data: n, error: null };
      }
      default:
        return { data: null, error: { message: `fake rpc ${name} not implemented` } };
    }
  }
}

/** Mirrors the Supabase project's PostgREST max-rows setting. */
export const MAX_ROWS = 1000;

class FakeQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' | 'delete' = 'select';
  private payload: Row[] = [];
  private eqs: [string, unknown][] = [];
  private ins: [string, unknown[]][] = [];
  private gts: [string, number][] = [];
  private ilikes: [string, string][] = [];
  /** `.not(col, 'is', null)` — col may be a JSON path like `ai_meta->diag`. */
  private notNulls: string[] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
  private rangeFrom: number | null = null;
  private rangeTo: number | null = null;
  private singleMode: 'none' | 'single' | 'maybe' = 'none';

  constructor(
    private readonly db: FakeSupabase,
    private readonly name: string,
  ) {}

  select(): this {
    return this;
  }
  insert(payload: Row | Row[]): this {
    this.op = 'insert';
    this.payload = Array.isArray(payload) ? payload : [payload];
    return this;
  }
  update(payload: Row): this {
    this.op = 'update';
    this.payload = [payload];
    return this;
  }
  delete(): this {
    this.op = 'delete';
    return this;
  }
  eq(col: string, val: unknown): this {
    this.eqs.push([col, val]);
    return this;
  }
  in(col: string, vals: unknown[]): this {
    this.ins.push([col, vals]);
    return this;
  }
  gt(col: string, val: number): this {
    this.gts.push([col, val]);
    return this;
  }
  not(col: string, op: string, val: unknown): this {
    if (op !== 'is' || val !== null) throw new Error(`fake .not(${op}) unsupported`);
    this.notNulls.push(col);
    return this;
  }
  ilike(col: string, pattern: string): this {
    this.ilikes.push([col, pattern]);
    return this;
  }
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
    return this;
  }
  range(from: number, to: number): this {
    this.rangeFrom = from;
    this.rangeTo = to;
    return this;
  }
  single(): Promise<Result> {
    this.singleMode = 'single';
    return this.run();
  }
  maybeSingle(): Promise<Result> {
    this.singleMode = 'maybe';
    return this.run();
  }

  then<T1 = Result, T2 = never>(
    onfulfilled?: ((value: Result) => T1 | PromiseLike<T1>) | null,
    onrejected?: ((reason: unknown) => T2 | PromiseLike<T2>) | null,
  ): Promise<T1 | T2> {
    return this.run().then(onfulfilled, onrejected);
  }

  private table(): Row[] {
    return this.db.tables[this.name] as Row[];
  }

  private matches(row: Row): boolean {
    for (const [c, v] of this.eqs) if (row[c] !== v) return false;
    for (const [c, vals] of this.ins) if (!vals.includes(row[c])) return false;
    for (const [c, v] of this.gts) if (!(Number(row[c]) > v)) return false;
    for (const path of this.notNulls) {
      let v: unknown = row;
      for (const key of path.split(/->>?/)) v = v && typeof v === 'object' ? (v as Row)[key] : undefined;
      if (v === null || v === undefined) return false;
    }
    for (const [c, pattern] of this.ilikes) {
      const re = new RegExp('^' + pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*') + '$', 'i');
      if (!re.test(String(row[c] ?? ''))) return false;
    }
    return true;
  }

  private applyInsertDefaults(row: Row): Row {
    const now = new Date().toISOString();
    if (this.name === 'messages') {
      return { id: this.db.nextId('messages'), staff_id: null, ai_meta: null, created_at: now, ...row };
    }
    if (this.name === 'conversations') {
      return {
        id: crypto.randomUUID(),
        channel: 'webchat',
        language: 'en',
        status: 'ai_handling',
        source_tag: '',
        topic_category: '',
        contact_email: '',
        contact_whatsapp: '',
        assigned_staff: null,
        escalated_at: null,
        reply_due_at: null,
        created_at: now,
        updated_at: now,
        ...row,
      };
    }
    if (this.name === 'kb_import_snapshots') {
      return { id: crypto.randomUUID(), created_at: now, undone: false, applied_count: 0, ...row };
    }
    if (this.name === 'kb_change_log') {
      return { id: this.db.nextId('kb_change_log'), changed_at: now, source: 'admin_edit', ...row };
    }
    return { ...row };
  }

  // Return shallow copies so callers cannot mutate stored rows (real Supabase
  // returns fresh objects; without this a fetched row aliases the stored one).
  private out(rows: Row[]): Row[] {
    return rows.map((r) => ({ ...r }));
  }

  private async run(): Promise<Result> {
    if (this.op === 'insert') {
      const inserted = this.payload.map((r) => this.applyInsertDefaults(r));
      this.table().push(...inserted);
      const copies = this.out(inserted);
      return { data: this.singleMode !== 'none' ? (copies[0] ?? null) : copies, error: null };
    }
    if (this.op === 'delete') {
      const removed = this.table().filter((r) => this.matches(r));
      this.db.tables[this.name] = this.table().filter((r) => !this.matches(r));
      const copies = this.out(removed);
      return { data: this.singleMode !== 'none' ? (copies[0] ?? null) : copies, error: null };
    }
    if (this.op === 'update') {
      const patch = this.payload[0] ?? {};
      const updated: Row[] = [];
      for (const row of this.table()) {
        if (this.matches(row)) {
          Object.assign(row, patch);
          updated.push(row);
        }
      }
      const copies = this.out(updated);
      return { data: this.singleMode !== 'none' ? (copies[0] ?? null) : copies, error: null };
    }
    let rows = this.table().filter((r) => this.matches(r));
    if (this.orderCol) {
      const col = this.orderCol;
      // Numbers compare numerically; anything else (ids, ISO timestamps) as strings.
      const cmp = (x: unknown, y: unknown): number =>
        typeof x === 'number' && typeof y === 'number' ? x - y : String(x ?? '').localeCompare(String(y ?? ''));
      rows = [...rows].sort((a, b) => (this.orderAsc ? cmp(a[col], b[col]) : cmp(b[col], a[col])));
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    // .range(from, to) is inclusive on both ends (PostgREST semantics).
    if (this.rangeFrom !== null) rows = rows.slice(this.rangeFrom, (this.rangeTo ?? rows.length) + 1);
    // PostgREST server max-rows: a single request never returns more than this,
    // so unpaged selects truncate exactly like production (v1.8 Phase 0).
    rows = rows.slice(0, MAX_ROWS);
    const copies = this.out(rows);
    if (this.singleMode !== 'none') return { data: copies[0] ?? null, error: null };
    return { data: copies, error: null };
  }
}
