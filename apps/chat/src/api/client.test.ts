import { afterEach, describe, expect, it, vi } from 'vitest';
import { createConversation, postFeedback, postMessage } from './client';

function mockFetch(body: unknown) {
  const fn = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => body,
  } as Response);
  vi.stubGlobal('fetch', fn);
  return fn;
}

afterEach(() => vi.unstubAllGlobals());

describe('api client', () => {
  it('creates a conversation with a JSON POST', async () => {
    const fetchMock = mockFetch({ token: 't', id: 'c', language: 'en', status: 'ai_handling', topic_category: '' });
    await createConversation({ language: 'vi', topic_category: 'lost' });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toContain('/api/conversations');
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject({ language: 'vi', topic_category: 'lost' });
  });

  it('posts a message to the token path', async () => {
    const fetchMock = mockFetch({ reply: { id: 1, body: 'a' }, escalated: false, status: 'ai_handling', customer_message: {} });
    await postMessage('tok', 'hello');
    expect(String(fetchMock.mock.calls[0]![0])).toContain('/api/conversations/tok/messages');
  });

  it('throws on non-ok responses', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 429 } as Response));
    await expect(postFeedback('tok', 'solved')).rejects.toThrow(/429/);
  });
});
