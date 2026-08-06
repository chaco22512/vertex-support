import { describe, expect, it } from 'vitest';
import { parseAiResponse } from './parse';

const answer = {
  action: 'answer',
  answer: 'Here is how.',
  follow_up: null,
  reason: 'none',
  rule_ids: ['R045'],
  detected_language: 'en',
};

describe('parseAiResponse', () => {
  it('parses a clean answer object', () => {
    expect(parseAiResponse(JSON.stringify(answer))).toEqual(answer);
  });

  it('parses JSON wrapped in a code fence', () => {
    expect(parseAiResponse('```json\n' + JSON.stringify(answer) + '\n```')).toEqual(answer);
  });

  it('parses JSON with surrounding prose', () => {
    expect(parseAiResponse('Sure:\n' + JSON.stringify(answer) + '\nThanks')).toEqual(answer);
  });

  it('returns null for non-JSON', () => {
    expect(parseAiResponse('I cannot help with that.')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parseAiResponse('{"answer":"hi"}')).toBeNull();
  });

  it('returns null for an invalid reason enum value', () => {
    expect(parseAiResponse(JSON.stringify({ ...answer, reason: 'made_up' }))).toBeNull();
  });

  it('keeps an "ask" with a valid follow_up (2-5 options)', () => {
    const ask = {
      action: 'ask',
      answer: 'Which best describes it?',
      follow_up: { question: 'Which best describes it?', options: ['Not connecting', 'Slow', 'Wi-Fi only'] },
      reason: 'none',
      rule_ids: [],
      detected_language: 'en',
    };
    const parsed = parseAiResponse(JSON.stringify(ask));
    expect(parsed?.action).toBe('ask');
    expect(parsed?.follow_up?.options).toHaveLength(3);
  });

  it('downgrades an "ask" without a usable follow_up to "answer"', () => {
    const parsed = parseAiResponse(
      JSON.stringify({ ...answer, action: 'ask', follow_up: { question: 'q', options: ['only one'] } }),
    );
    expect(parsed?.action).toBe('answer');
    expect(parsed?.follow_up).toBeNull();
  });

  it('caps follow_up options at 5', () => {
    const parsed = parseAiResponse(
      JSON.stringify({
        ...answer,
        action: 'ask',
        follow_up: { question: 'q', options: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] },
      }),
    );
    expect(parsed?.follow_up?.options).toHaveLength(5);
  });

  it('derives action from a legacy escalate=true (no action field)', () => {
    const parsed = parseAiResponse(
      JSON.stringify({ answer: 'Staff will reply.', escalate: true, reason: 'price_question', rule_ids: [], detected_language: 'en' }),
    );
    expect(parsed?.action).toBe('escalate');
  });

  it('derives action=answer from a legacy escalate=false', () => {
    const parsed = parseAiResponse(
      JSON.stringify({ answer: 'ok', escalate: false, reason: 'none', rule_ids: [], detected_language: 'en' }),
    );
    expect(parsed?.action).toBe('answer');
  });
});
