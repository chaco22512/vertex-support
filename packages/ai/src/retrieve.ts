import type { KbRule } from '@vertex/shared';

/**
 * Keyword retrieval for the pre-escalation fallback (spec v1.8 §4.1.1).
 *
 * When the scoped prompt reports not_in_manual, the API re-asks the model with
 * the top-K rules from the WHOLE manual instead of all ~2,400 rules (≈107K
 * tokens, which exhausts the Gemini free-tier TPM after ~2 calls/min). Ranking
 * is plain BM25 over rule_text + category, so it is deterministic, cheap
 * (<10ms for the full manual) and unit-testable — no embeddings, no extra LLM call.
 */

/** Rules handed to the fallback attempt (user-approved threshold, v1.8). */
export const FALLBACK_TOP_K = 150;

const K1 = 1.2;
const B = 0.75;
/** Score multiplier for rules in the categories of the model's topic guess. */
const TOPIC_BOOST = 1.3;

// Function words that would match nearly every rule and drown the signal.
const STOPWORDS = new Set(
  (
    'the and for are but not you your yours with this that these those have has had was were ' +
    'will would can could should shall may might must from into onto about what which who whom ' +
    'when where why how all any each some such our ours out off over under then than too very ' +
    'just also only own same other its it\'s his her hers him she they them their there here ' +
    'been being does did doing done get got please thank thanks hello want need know like ' +
    'customer customers rule rules sim'
  ).split(' '),
);

/** Lower-case word tokens (any script), stopwords dropped, plural 's' folded. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  for (const raw of text.toLowerCase().normalize('NFKC').split(/[^\p{L}\p{N}]+/u)) {
    if (!raw) continue;
    const hasDigit = /\p{N}/u.test(raw);
    if (raw.length < (hasDigit ? 2 : 3) || STOPWORDS.has(raw)) continue;
    out.push(raw.length > 3 && raw.endsWith('s') && !raw.endsWith('ss') ? raw.slice(0, -1) : raw);
  }
  return out;
}

/** Unique query terms from the customer's message plus the model's English keywords. */
export function buildRetrievalQuery(message: string, keywords: string[]): string[] {
  return [...new Set([...tokenize(message), ...keywords.flatMap(tokenize)])];
}

export interface RankedRule {
  rule: KbRule;
  score: number;
}

/**
 * Rank `rules` against `query` terms (BM25) and return the top `topK` with a
 * positive score, best first (ties broken by id for stable output). Rules in
 * `boostCategories` / `boostIdPrefixes` (the guessed topic's scope) get a
 * mild multiplier.
 */
export function rankRules(
  rules: KbRule[],
  query: string[],
  opts: { topK?: number; boostCategories?: string[] | null; boostIdPrefixes?: string[] } = {},
): RankedRule[] {
  const topK = opts.topK ?? FALLBACK_TOP_K;
  if (query.length === 0 || rules.length === 0) return [];
  const terms = new Set(query);
  const boost = new Set(opts.boostCategories ?? []);
  const boostPrefixes = opts.boostIdPrefixes ?? [];

  const docs = rules.map((rule) => {
    const tokens = tokenize(`${rule.category} ${rule.subcategory ?? ''} ${rule.rule_text}`);
    const tf = new Map<string, number>();
    for (const t of tokens) if (terms.has(t)) tf.set(t, (tf.get(t) ?? 0) + 1);
    return { rule, len: tokens.length, tf };
  });

  const n = docs.length;
  const avgLen = docs.reduce((s, d) => s + d.len, 0) / n || 1;
  const df = new Map<string, number>();
  for (const d of docs) for (const t of d.tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const idf = (t: string) => {
    const f = df.get(t) ?? 0;
    return Math.log(1 + (n - f + 0.5) / (f + 0.5));
  };

  const ranked: RankedRule[] = [];
  for (const d of docs) {
    let score = 0;
    for (const [t, f] of d.tf) {
      score += (idf(t) * f * (K1 + 1)) / (f + K1 * (1 - B + (B * d.len) / avgLen));
    }
    if (score <= 0) continue;
    if (boost.has(d.rule.category) || boostPrefixes.some((p) => d.rule.id.startsWith(p))) score *= TOPIC_BOOST;
    ranked.push({ rule: d.rule, score: Math.round(score * 1000) / 1000 });
  }
  ranked.sort((a, b) => b.score - a.score || a.rule.id.localeCompare(b.rule.id));
  return ranked.slice(0, topK);
}
