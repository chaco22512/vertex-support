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
  tables: { conversations: Row[]; messages: Row[]; kb_rules: Row[] } & Record<string, Row[]> = {
    conversations: [],
    messages: [],
    kb_rules: [],
  };
  private seq: Record<string, number> = {};

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
}

class FakeQuery implements PromiseLike<Result> {
  private op: 'select' | 'insert' | 'update' = 'select';
  private payload: Row[] = [];
  private eqs: [string, unknown][] = [];
  private ins: [string, unknown[]][] = [];
  private gts: [string, number][] = [];
  private orderCol: string | null = null;
  private orderAsc = true;
  private limitN: number | null = null;
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
  order(col: string, opts?: { ascending?: boolean }): this {
    this.orderCol = col;
    this.orderAsc = opts?.ascending !== false;
    return this;
  }
  limit(n: number): this {
    this.limitN = n;
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
    return { ...row };
  }

  private async run(): Promise<Result> {
    if (this.op === 'insert') {
      const inserted = this.payload.map((r) => this.applyInsertDefaults(r));
      this.table().push(...inserted);
      return { data: this.singleMode !== 'none' ? (inserted[0] ?? null) : inserted, error: null };
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
      return { data: updated, error: null };
    }
    let rows = this.table().filter((r) => this.matches(r));
    if (this.orderCol) {
      const col = this.orderCol;
      rows = [...rows].sort((a, b) =>
        this.orderAsc ? Number(a[col]) - Number(b[col]) : Number(b[col]) - Number(a[col]),
      );
    }
    if (this.limitN !== null) rows = rows.slice(0, this.limitN);
    if (this.singleMode !== 'none') return { data: rows[0] ?? null, error: null };
    return { data: rows, error: null };
  }
}
