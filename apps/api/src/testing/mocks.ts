import type { LlmClient, LlmGenerateRequest } from '@vertex/ai';
import type { Role } from '@vertex/shared';
import type { StaffAuth } from '../types';
import type { EmailMessage } from '../lib/email';

/** Recording Slack sender for tests: assert on `.calls`. */
export function fakeSendSlack(): ((text: string) => Promise<void>) & { calls: string[] } {
  const calls: string[] = [];
  const send = async (text: string): Promise<void> => {
    calls.push(text);
  };
  return Object.assign(send, { calls });
}

/** Recording email sender for tests: assert on `.calls`. */
export function fakeSendEmail(): ((msg: EmailMessage) => Promise<void>) & { calls: EmailMessage[] } {
  const calls: EmailMessage[] = [];
  const send = async (msg: EmailMessage): Promise<void> => {
    calls.push(msg);
  };
  return Object.assign(send, { calls });
}

/** verifyStaff stub: any non-empty token resolves to a staff/admin, empty → null. */
export function fakeVerifyStaff(role: Role = 'admin') {
  return async (token: string): Promise<StaffAuth | null> =>
    token ? { userId: 'staff-1', role, isActive: true, name: 'Test Staff' } : null;
}

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
