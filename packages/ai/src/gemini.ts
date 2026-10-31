import type { LlmClient, LlmGenerateRequest } from './llm';

/** Default free-tier model (build_spec_v1_4.md §2 — confirm availability at deploy). */
export const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';

const API_BASE = 'https://generativelanguage.googleapis.com/v1beta';

export interface GeminiConfig {
  apiKey: string;
  model?: string;
}

interface GeminiResponse {
  candidates?: { content?: { parts?: { text?: string }[] } }[];
}

/**
 * Gemini implementation of LlmClient. Uses fetch (Workers-compatible) and JSON
 * response mode so the model returns the §4.2 JSON object directly.
 *
 * SECURITY: the API key is sent in the x-goog-api-key header (never in the URL,
 * which can be logged) and is never included in thrown error messages. Callers
 * must not log request/response bodies (they may contain customer text).
 */
export class GeminiClient implements LlmClient {
  readonly model: string;
  readonly #apiKey: string;

  constructor(config: GeminiConfig) {
    this.#apiKey = config.apiKey;
    this.model = config.model ?? DEFAULT_GEMINI_MODEL;
  }

  async generate(req: LlmGenerateRequest): Promise<string> {
    const body = {
      systemInstruction: { parts: [{ text: req.system }] },
      contents: req.messages.map((m) => ({ role: m.role, parts: [{ text: m.text }] })),
      generationConfig: {
        temperature: req.temperature ?? 0.2,
        ...(req.json === false ? {} : { responseMimeType: 'application/json' }),
      },
    };

    const resp = await fetch(`${API_BASE}/models/${this.model}:generateContent`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-goog-api-key': this.#apiKey,
      },
      body: JSON.stringify(body),
      signal: req.signal,
    });

    if (!resp.ok) {
      // Include status only. Do not echo the response body (may contain the
      // prompt / customer text) or the API key. ★v1.8: for a 429, keep just
      // the quota id (e.g. "…PerDay…") so usage tracking can tell a daily cap
      // from a per-minute one.
      throw new GeminiError(resp.status, this.model, resp.status === 429 ? await quotaIdOf(resp) : null);
    }

    const data = (await resp.json()) as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  }
}

export class GeminiError extends Error {
  constructor(
    readonly status: number,
    readonly model: string,
    /** 429 only: which quota was hit (Google's quotaId), else null. */
    readonly quotaId: string | null = null,
  ) {
    super(`Gemini request failed (status ${status}, model ${model})`);
    this.name = 'GeminiError';
  }

  /** True when Google rejected the call because the per-day cap is used up. */
  get isDailyLimit(): boolean {
    return this.status === 429 && /PerDay/i.test(this.quotaId ?? '');
  }
}

/** The first quotaId in a 429 error body — nothing else from the body is kept. */
async function quotaIdOf(resp: Response): Promise<string | null> {
  try {
    const body = (await resp.json()) as {
      error?: { details?: { violations?: { quotaId?: unknown }[] }[] };
    };
    for (const d of body.error?.details ?? []) {
      for (const v of d.violations ?? []) {
        if (typeof v.quotaId === 'string' && /^[\w-]{1,120}$/.test(v.quotaId)) return v.quotaId;
      }
    }
  } catch {
    /* not JSON */
  }
  return null;
}
