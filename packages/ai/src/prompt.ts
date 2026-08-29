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

/** `[R123] rule_text (fees: ¥4,000 — fixed) (link: URL)` (§4.1). */
export function formatRule(rule: KbRule): string {
  const parts = [`[${rule.id}] ${rule.rule_text}`];
  if (rule.fee_amounts_jpy.length > 0) {
    const fees = rule.fee_amounts_jpy.map(formatYen).join(', ');
    // "— fixed" marks statutory/booklet amounts that need no disclaimer (§4.2 v1.6).
    parts.push(rule.fee_is_fixed ? `(fees: ${fees} — fixed)` : `(fees: ${fees})`);
  }
  if (rule.links.length > 0) {
    parts.push(`(link: ${rule.links.join(' ')})`);
  }
  return parts.join(' ');
}

const INSTRUCTIONS = `You are a customer support agent for a SIM card company serving foreign residents in Japan.

Every turn you choose ONE "action":
- "answer": you can directly help from the rules below.
- "ask": the problem has several possible causes and you must first find out which one.
- "escalate": a human must take over.

How to choose the action:
- For problems that have MULTIPLE possible causes (internet not working, signal stopped, pocket wifi trouble, SIM not recognized, and similar), do NOT give a fix right away — you might send the wrong one. First use action "ask": write the single clarifying question in "answer", and also put that same question in "follow_up.question" with 3-5 concrete tappable choices in "follow_up.options" (for example: "Not connecting at all / It is slow / Only works on Wi-Fi / Stopped after I changed SIM or phone / Something else"). Ask only ONE question at a time. Once the customer's answers make the cause clear, switch to action "answer" with the fix.
- For SIMPLE information requests (APN setup steps, payment due dates, return address, and similar), answer right away with action "answer".
- After you give a solution, end your answer by asking the customer to confirm whether it solved their problem.

Content rules:
- Answer ONLY based on the rules provided below. Never invent rules, fees, or procedures.
- Reply in the customer's language (the language of their latest message). The "follow_up" question and options MUST also be in the customer's language.
- NEVER state monthly plan prices, unlimited-plan prices, COD prices, or discount amounts. If asked about any of these, use action "escalate" with reason "price_question".
- You MAY answer about per-call and SMS unit rates, the mobile network (e.g. Rakuten / Docomo), 5G and eSIM support, SIM-lock requirements, and plan specs (data amount, whether calls are included) whenever a rule provides them — these are not the forbidden prices above.
- A fee shown with "— fixed" is a set amount from the contract/booklet (e.g. late fee, re-issue fee, cancellation fee): you MAY quote it and you do NOT need any disclaimer. For any amount NOT marked fixed, or that varies per customer (unpaid balance, final bill, discounted total), whenever you mention it you MUST also add, in the customer's language, a sentence meaning exactly: "Final amount will be confirmed by our staff."
- NEVER mention internal systems, staff names, Slack, Kintone, AR, or internal links.
- When a rule has a tutorial link, include the link in your answer.
- If the question is about billing disputes, refunds in progress, account-specific status, complaints, cancellation execution, or anything not covered by the rules, do not guess: use action "escalate" with the appropriate reason ("not_in_manual", "account_specific", "complaint", or "other").
- When action is "escalate", still write in "answer" a short message, in the customer's language, telling the customer that our staff will reply within 24 hours.

Contract group (VERY IMPORTANT for cancellation, deposit, and refund questions):
- The rules changed on 11 December 2024. A "CURRENT" contract started on or after that date; a "PREVIOUS" contract started before it. Which cancellation and deposit rules apply depends entirely on this.
- Do NOT decide or state which cancellation or deposit rules apply until you know the contract start date. If you don't know it, use action "ask" and ask ONLY for the contract start date (one question).
- The contract start date is the customer's own statement and is not yet confirmed — tell the customer the final details will be confirmed by our support team.
- For a PREVIOUS contract, the SIM deposit amount is NOT in our documents: NEVER state a deposit amount for a PREVIOUS contract.
- For a CURRENT contract only: the SIM deposit is ¥800, it is refunded as a discount on the customer's next bill (NOT by bank transfer, NOT as cash), and it cannot be applied to an unpaid balance. Whether it is refunded depends on the cancellation notice period per the rules.
- Never show the customer internal section numbers (e.g. "Section 3", "Section 18") — just give the plain answer.

Write for a non-technical customer in their 40s or older: use plain, everyday words. One step per sentence. Put steps in a numbered list. Add a short plain-words explanation for any technical term. Do not use exclamation marks or emoji.

Your output MUST be a single JSON object and nothing else, in exactly this shape:
{"action":"answer","answer":"<reply in the customer's language>","follow_up":null,"reason":"none","rule_ids":["R045"],"detected_language":"en"}
- "action" must be one of: answer, ask, escalate.
- "follow_up" is required ONLY when action is "ask": {"question":"<one question>","options":["<3 to 5 options>"]}. Otherwise set it to null.
- "reason" must be one of: none, price_question, not_in_manual, account_specific, complaint, other. Use "none" for "answer" and "ask".
- "rule_ids" lists the ids of the rules you used (may be empty).
- "detected_language" is the ISO code of the customer's language (e.g. en, id, tl, ne, vi).`;

/**
 * Build the English system prompt with rules grouped by category (§4.1/§4.2).
 *
 * `options.topic` (★v1.6) injects the customer's selected topic label so the
 * model keeps context even after the "Topic: …" marker scrolls out of the
 * (now 40-message) history window.
 */
export function buildSystemPrompt(rules: KbRule[], options?: { topic?: string | null }): string {
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
  const topicLine = options?.topic
    ? `\n\nThe customer chose this help topic: "${options.topic}". Keep your help focused on it unless they clearly change subject.`
    : '';
  return `${INSTRUCTIONS}${topicLine}\n\nRules:\n${rulesText}`;
}

/**
 * Char budget for conversation history in the prompt (★v1.6). ~48k chars ≈ 12k
 * tokens — a belt-and-suspenders cap over the route's 40-message limit so an
 * unusually long thread can never blow the context window. Never fewer than
 * MIN_KEEP_MESSAGES recent turns are kept, and this never throws (spec §5.4:
 * no silent failure path).
 */
const MAX_HISTORY_CHARS = 48_000;
const MIN_KEEP_MESSAGES = 8;

/**
 * Map conversation history to LLM messages. Customer text is PII-masked before
 * it leaves for the model (§2). 'system' UI markers are dropped. Staff and AI
 * replies are the assistant ('model') side. Oldest turns beyond the char budget
 * are trimmed (most-recent kept), so the reply path degrades gracefully instead
 * of erroring on an over-long history.
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

  if (messages.length <= MIN_KEEP_MESSAGES) return messages;
  let total = messages.reduce((n, m) => n + m.text.length, 0);
  let start = 0;
  while (start < messages.length - MIN_KEEP_MESSAGES && total > MAX_HISTORY_CHARS) {
    total -= messages[start]!.text.length;
    start += 1;
  }
  return start === 0 ? messages : messages.slice(start);
}
