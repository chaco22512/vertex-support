import { describe, expect, it } from 'vitest';
import { parseAiResponse } from './parse';

const valid = {
  answer: 'Here is how.',
  escalate: false,
  reason: 'none',
  rule_ids: ['R045'],
  detected_language: 'en',
};

describe('parseAiResponse', () => {
  it('parses a clean JSON object', () => {
    expect(parseAiResponse(JSON.stringify(valid))).toEqual(valid);
  });

  it('parses JSON wrapped in a code fence', () => {
    expect(parseAiResponse('```json\n' + JSON.stringify(valid) + '\n```')).toEqual(valid);
  });

  it('parses JSON with surrounding prose', () => {
    expect(parseAiResponse('Sure:\n' + JSON.stringify(valid) + '\nThanks')).toEqual(valid);
  });

  it('returns null for non-JSON', () => {
    expect(parseAiResponse('I cannot help with that.')).toBeNull();
  });

  it('returns null when required fields are missing', () => {
    expect(parseAiResponse('{"answer":"hi"}')).toBeNull();
  });

  it('returns null for an invalid reason enum value', () => {
    expect(parseAiResponse(JSON.stringify({ ...valid, reason: 'made_up' }))).toBeNull();
  });
});
