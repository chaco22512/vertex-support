/**
 * Live smoke test for the Gemini connection (build_spec_v1_4.md §2).
 * Runs one benign request through the real AI pipeline to confirm the API key
 * and model work and that JSON output parses.
 *
 * Usage: pnpm smoke:gemini
 *
 * SECURITY: prints only sanitized flags — never the API key, and not the answer
 * text (structured flags and lengths only).
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { config as loadEnv } from 'dotenv';
import { parseEnv } from '@vertex/shared';
import { GeminiClient, GeminiError, runAiReply, type HistoryMessage } from '@vertex/ai';

const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

async function main(): Promise<void> {
  loadEnv({ path: resolve(REPO_ROOT, '.env') });
  const env = parseEnv(process.env);

  const llm = new GeminiClient({ apiKey: env.GEMINI_API_KEY });
  console.log(`Model: ${llm.model}`);

  const history: HistoryMessage[] = [
    { sender: 'customer', body: 'How do I set up the APN on my phone?' },
  ];

  const res = await runAiReply({
    rules: [
      {
        id: 'R999',
        category: 'APN SETTINGS',
        subcategory: '',
        rule_text: 'To set the APN, open Settings > Mobile network > Access Point Names and add "vertex".',
        date_updated: null,
        fee_amounts_jpy: [],
        links: ['https://example.com/apn'],
        audience: 'customer',
        ai_can_answer: true,
        requires_fee_disclaimer: false,
        status: 'active',
        review_reason: '',
        updated_by: null,
        updated_at: '2026-01-01T00:00:00Z',
      },
    ],
    history,
    language: 'en',
    llm,
  });

  console.log('--- smoke result (sanitized) ---');
  console.log('parsed valid JSON:', !res.fellBack);
  console.log('escalate:', res.aiMeta.escalate);
  console.log('reason:', res.aiMeta.reason);
  console.log('rule_ids:', JSON.stringify(res.aiMeta.rule_ids));
  console.log('detected_language:', res.detected_language);
  console.log('answer length (chars):', res.answer.length);
  console.log(res.fellBack ? 'RESULT: FALLBACK (model returned unparseable output twice)' : 'RESULT: OK');
}

main().catch((err: unknown) => {
  if (err instanceof GeminiError) {
    console.error(`GeminiError: status ${err.status}, model ${err.model}`);
    process.exit(2);
  }
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
