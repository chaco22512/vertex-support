// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/preact';
import { en } from './i18n/en';
import { id } from './i18n/id';
import { ne } from './i18n/ne';
import { tl } from './i18n/tl';
import { vi as viLang } from './i18n/vi';

/** 2026-11-07 CS feedback ②: "New chat" in the header; finished chats are not reopened. */

const getMessages = vi.fn();
vi.mock('./api/client', () => ({
  createConversation: vi.fn().mockResolvedValue({
    token: 'tok',
    id: 'c1',
    language: 'en',
    status: 'ai_handling',
    topic_category: 'lost',
  }),
  postMessage: vi.fn().mockResolvedValue({
    customer_message: { id: 1, sender: 'customer', body: 'x', ai_meta: null, created_at: '' },
    reply: {
      id: 2,
      sender: 'ai',
      body: 'Here is the lost-SIM procedure.',
      ai_meta: null,
      created_at: '',
    },
    escalated: false,
    status: 'ai_handling',
  }),
  getMessages: (...args: unknown[]) => getMessages(...args),
  postContact: vi.fn(),
  postFeedback: vi.fn(),
  changeTopic: vi.fn(),
}));

const { App } = await import('./app');
const STORAGE_KEY = 'vertex_chat_session';
const oldChat = {
  messages: [
    { id: 7, sender: 'ai', body: 'An old answer about payment.', ai_meta: null, created_at: '' },
  ],
  reply_due_at: null,
};

afterEach(() => {
  cleanup();
  localStorage.clear();
  getMessages.mockReset();
  vi.restoreAllMocks();
});

describe('New chat', () => {
  it('is in the header once a chat is open; after confirming, the screen and saved session are cleared', async () => {
    getMessages.mockResolvedValue({ messages: [], status: 'ai_handling', reply_due_at: null });
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    expect(screen.queryByRole('button', { name: en.ui.newChat })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: en.categories.lost }));
    fireEvent.click(await screen.findByRole('button', { name: en.subQuestions.lost![0]! }));
    expect(await screen.findByText('Here is the lost-SIM procedure.')).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toContain('tok');

    // Cancel keeps everything.
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false);
    fireEvent.click(screen.getByRole('button', { name: en.ui.newChat }));
    expect(confirm).toHaveBeenCalledWith(en.ui.newChatConfirm);
    expect(screen.getByText('Here is the lost-SIM procedure.')).toBeTruthy();

    confirm.mockReturnValueOnce(true);
    fireEvent.click(screen.getByRole('button', { name: en.ui.newChat }));
    expect(screen.queryByText('Here is the lost-SIM procedure.')).toBeNull();
    expect(screen.getByText(en.ui.categoryPrompt)).toBeTruthy();
    expect(localStorage.getItem(STORAGE_KEY)).toBeNull();
  });

  it('has the new strings in all 5 languages', () => {
    for (const m of [en, id, tl, ne, viLang]) {
      expect(m.ui.newChat).toBeTruthy();
      expect(m.ui.newChatConfirm).toBeTruthy();
    }
  });
});

describe('Coming back to a saved chat', () => {
  it('a resolved chat is not reopened: fresh start, saved session cleared', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: 'old', language: 'en' }));
    getMessages.mockResolvedValue({ ...oldChat, status: 'resolved' });
    render(<App />);
    await waitFor(() => expect(localStorage.getItem(STORAGE_KEY)).toBeNull());
    fireEvent.click(screen.getByRole('button', { name: en.categories.payment }));
    expect(screen.queryByText('An old answer about payment.')).toBeNull();
  });

  it('an open chat is still restored', async () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ token: 'old', language: 'en' }));
    getMessages.mockResolvedValue({ ...oldChat, status: 'escalated' });
    render(<App />);
    await waitFor(() => expect(getMessages).toHaveBeenCalled());
    expect(localStorage.getItem(STORAGE_KEY)).toContain('old');
  });
});
