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
        responseMimeType: 'application/json',
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
      // prompt / customer text) or the API key.
      throw new GeminiError(resp.status, this.model);
    }

    const data = (await resp.json()) as GeminiResponse;
    return data.candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('') ?? '';
  }
}

export class GeminiError extends Error {
  constructor(
    readonly status: number,
    readonly model: string,
  ) {
    super(`Gemini request failed (status ${status}, model ${model})`);
    this.name = 'GeminiError';
  }
}
