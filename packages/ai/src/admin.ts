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
  });
  return out.trim();
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
  const out = await llm.generate({ system, messages, json: false, temperature: 0.3 });
  return out.trim();
}
