import type { KbRule } from '@vertex/shared';
import type { LlmMessage } from './llm';
import { maskPii } from './pii';

/** A conversation message as seen by the pipeline (subset of the messages row). */
export interface HistoryMessage {
  sender: 'customer' | 'ai' | 'staff' | 'system';
  body: string;
}

/** Deterministic ¥ formatting with thousands separators (no locale dependence). */
function formatYen(n: number): string {
  return '¥' + n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
}

/** `[R123] rule_text (fees: ¥4,000) (link: URL)` (§4.1). */
export function formatRule(rule: KbRule): string {
  const parts = [`[${rule.id}] ${rule.rule_text}`];
  if (rule.fee_amounts_jpy.length > 0) {
    parts.push(`(fees: ${rule.fee_amounts_jpy.map(formatYen).join(', ')})`);
  }
  if (rule.links.length > 0) {
    parts.push(`(link: ${rule.links.join(' ')})`);
  }
  return parts.join(' ');
}

const INSTRUCTIONS = `You are a customer support agent for a SIM card company serving foreign residents in Japan.

- Answer ONLY based on the rules provided below. Never invent rules, fees, or procedures.
- Reply in the customer's language (the language of their latest message).
- NEVER state monthly plan prices, COD prices, or discount amounts. If asked about any of these, do not answer: set "escalate" to true and "reason" to "price_question".
- Fixed fees listed in the rules MAY be quoted, but whenever you mention any fee you MUST also add, in the customer's language, a sentence meaning exactly: "Final amount will be confirmed by our staff."
- NEVER mention internal systems, staff names, Slack, Kintone, AR, or internal links.
- When a rule has a tutorial link, include the link in your answer.
- Keep answers short: 2-4 sentences per point, plain words, no jargon. Break steps into a numbered list. Do not use exclamation marks or emoji.
- If the question is about billing disputes, refunds in progress, account-specific status, complaints, cancellation execution, or anything not covered by the rules, do not guess: set "escalate" to true with the appropriate reason ("not_in_manual", "account_specific", "complaint", or "other").
- When "escalate" is true, still write in "answer" a short message, in the customer's language, telling the customer that our staff will reply within 24 hours.

Your output MUST be a single JSON object and nothing else, in exactly this shape:
{"answer":"<reply in the customer's language>","escalate":false,"reason":"none","rule_ids":["R045"],"detected_language":"en"}
- "reason" must be one of: none, price_question, not_in_manual, account_specific, complaint, other.
- "rule_ids" lists the ids of the rules you used (may be empty).
- "detected_language" is the ISO code of the customer's language (e.g. en, id, tl, ne, vi).`;

/** Build the English system prompt with rules grouped by category (§4.1/§4.2). */
export function buildSystemPrompt(rules: KbRule[]): string {
  const byCategory = new Map<string, KbRule[]>();
  for (const rule of rules) {
    const list = byCategory.get(rule.category) ?? [];
    list.push(rule);
    byCategory.set(rule.category, list);
  }

  const blocks: string[] = [];
  for (const [category, list] of byCategory) {
    blocks.push(`## ${category}\n${list.map(formatRule).join('\n')}`);
  }

  const rulesText = blocks.length > 0 ? blocks.join('\n\n') : '(no rules available)';
  return `${INSTRUCTIONS}\n\nRules:\n${rulesText}`;
}

/**
 * Map conversation history to LLM messages. Customer text is PII-masked before
 * it leaves for the model (§2). 'system' UI markers are dropped. Staff and AI
 * replies are the assistant ('model') side.
 */
export function buildLlmMessages(history: HistoryMessage[]): LlmMessage[] {
  const messages: LlmMessage[] = [];
  for (const msg of history) {
    if (msg.sender === 'system') continue;
    if (msg.sender === 'customer') {
      messages.push({ role: 'user', text: maskPii(msg.body).masked });
    } else {
      messages.push({ role: 'model', text: msg.body });
    }
  }
  return messages;
}
