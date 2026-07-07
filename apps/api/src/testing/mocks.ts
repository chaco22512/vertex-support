import type { LlmClient, LlmGenerateRequest } from '@vertex/ai';

/** In-memory KV implementing the subset of KVNamespace the API uses. */
export function fakeKv(): KVNamespace {
  const store = new Map<string, string>();
  return {
    async get(key: string) {
      return store.get(key) ?? null;
    },
    async put(key: string, value: string) {
      store.set(key, value);
    },
    async delete(key: string) {
      store.delete(key);
    },
  } as unknown as KVNamespace;
}

/** LLM that returns canned responses in order (last one repeats). */
export function mockLlm(responses: string[], model = 'mock-model'): LlmClient {
  let i = 0;
  return {
    model,
    generate: async () => {
      const r = responses[Math.min(i, responses.length - 1)] ?? '';
      i++;
      return r;
    },
  };
}

/** LLM that never resolves until its abort signal fires (to test the 15s timeout). */
export function hangingLlm(model = 'mock-model'): LlmClient {
  return {
    model,
    generate: (req: LlmGenerateRequest) =>
      new Promise<string>((_resolve, reject) => {
        req.signal?.addEventListener('abort', () => reject(new Error('aborted')));
      }),
  };
}

export function goodResponse(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    answer: 'Here is how to do it.',
    escalate: false,
    reason: 'none',
    rule_ids: ['R010'],
    detected_language: 'en',
    ...overrides,
  });
}
