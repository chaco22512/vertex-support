// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/preact';
import { en } from './i18n/en';

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
    reply: { id: 2, sender: 'ai', body: 'Here is the lost-SIM procedure.', ai_meta: null, created_at: '' },
    escalated: false,
    status: 'ai_handling',
  }),
  getMessages: vi.fn().mockResolvedValue({ messages: [], status: 'ai_handling', reply_due_at: null }),
  postContact: vi.fn().mockResolvedValue({ status: 'escalated', reply_due_at: null }),
  postFeedback: vi.fn().mockResolvedValue({ status: 'resolved' }),
}));

// Import after mock is registered.
const { App } = await import('./app');

afterEach(() => {
  cleanup();
  localStorage.clear();
});

describe('App guided flow', () => {
  it('starts on language selection with no input field (criterion 19)', () => {
    render(<App />);
    expect(screen.getByText(en.ui.languagePrompt)).toBeTruthy();
    expect(screen.queryByRole('textbox')).toBeNull();
  });

  it('goes language → category → sub-question → AI reply (criteria 19/20)', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));

    expect(screen.getByText(en.ui.categoryPrompt)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: en.categories.lost }));

    // Preset question chips appear (input still not forced open).
    const chip = await screen.findByRole('button', { name: en.subQuestions.lost![0]! });
    fireEvent.click(chip);

    // AI reply is rendered.
    expect(await screen.findByText('Here is the lost-SIM procedure.')).toBeTruthy();
  });

  it('Plans & prices goes straight to the escalation card without AI', async () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'English' }));
    fireEvent.click(screen.getByRole('button', { name: en.categories.plans }));
    expect(await screen.findByText(en.ui.escalationTitle)).toBeTruthy();
  });
});
