import type { KbRule } from '@vertex/shared';
import type { LlmClient } from './llm';
import { buildSystemPrompt, type HistoryMessage } from './prompt';
import { maskPii } from './pii';

/**
 * Machine-translate a customer message to English for staff (§7.3 Translate).
 * Plain-text output. PII is masked before the text leaves for the model (§2).
 */
export async function translateToEnglish(llm: LlmClient, text: string): Promise<string> {
  const system =
    'Translate the user message into natural English. Output ONLY the translation — no quotes, no notes, no preamble.';
  const out = await llm.generate({
    system,
    messages: [{ role: 'user', text: maskPii(text).masked }],
    json: false,
    temperature: 0,
    purpose: 'translate',
  });
  return out.trim();
}

/**
 * ★2026-11-07: translate several customer messages in ONE model call (the
 * admin "Translate" switch used to make one call per message — 6 messages hit
 * the 5-per-minute cap at once). Returns the translations in input order;
 * throws when the model does not return one string per message.
 */
export async function translateManyToEnglish(llm: LlmClient, texts: string[]): Promise<string[]> {
  if (texts.length === 0) return [];
  if (texts.length === 1) return [await translateToEnglish(llm, texts[0]!)];
  const system =
    'You receive a JSON array of customer messages. Translate each one into natural English. ' +
    'Output ONLY a JSON array of strings: the same number of items, in the same order. ' +
    'If an item is already English, return it unchanged.';
  const out = await llm.generate({
    system,
    messages: [{ role: 'user', text: JSON.stringify(texts.map((t) => maskPii(t).masked)) }],
    json: true,
    temperature: 0,
    purpose: 'translate',
  });
  const parsed: unknown = JSON.parse(out.trim());
  if (
    !Array.isArray(parsed) ||
    parsed.length !== texts.length ||
    !parsed.every((x) => typeof x === 'string')
  ) {
    throw new Error('translation count mismatch');
  }
  return (parsed as string[]).map((x) => x.trim());
}

/**
 * Draft a reply for a staff member to review and edit (§7.3 AI draft).
 * IMPORTANT: this only produces text for insertion into the reply box; sending
 * always requires the staff member's explicit action (Hard rule 4). Written in
 * the customer's language, grounded in the provided rules.
 */
export async function draftStaffReply(
  llm: LlmClient,
  input: { rules: KbRule[]; history: HistoryMessage[]; language: string },
): Promise<string> {
  const rulesBlock = buildSystemPrompt(input.rules);
  const system =
    `You are drafting a reply that a human support agent will review and edit before sending. ` +
    `Write in the customer's language (code: ${input.language}). Base your reply ONLY on the rules below; ` +
    `never invent fees or procedures. If a fee is mentioned, add that the final amount will be confirmed by staff. ` +
    `Do not mention internal systems. Output only the reply text.\n\n` +
    rulesBlock;
  const messages = input.history
    .filter((m) => m.sender !== 'system')
    .map((m) => ({
      role: (m.sender === 'customer' ? 'user' : 'model') as 'user' | 'model',
      text: m.sender === 'customer' ? maskPii(m.body).masked : m.body,
    }));
  const out = await llm.generate({
    system,
    messages,
    json: false,
    temperature: 0.3,
    purpose: 'draft',
  });
  return out.trim();
}
