import { describe, expect, it } from 'vitest';
import { buildStaffReplyEmail } from './emailTemplates';

const opts = {
  chatUrl: 'http://localhost:5173/?t=sess-token-123',
  logoUrl: 'http://localhost:5174/logo-horizontal.webp',
};

describe('buildStaffReplyEmail (§8)', () => {
  it('localizes subject + body and embeds the chat URL with session token', () => {
    const en = buildStaffReplyEmail('en', opts);
    expect(en.subject).toBe('Vertex Support — our team replied');
    expect(en.html).toContain('Open your chat');
    expect(en.html).toContain('http://localhost:5173/?t=sess-token-123');
    expect(en.html).toContain('http://localhost:5174/logo-horizontal.webp');
    expect(en.html).toContain('Vertex Support');
  });

  it('renders each supported language with a lang attribute', () => {
    const vi = buildStaffReplyEmail('vi', opts);
    expect(vi.subject).toContain('nhóm của chúng tôi');
    expect(vi.html).toContain('lang="vi"');

    const ne = buildStaffReplyEmail('ne', opts);
    expect(ne.html).toContain('lang="ne"');
    expect(ne.subject).toContain('टोली');
  });

  it('falls back to English for an unknown language', () => {
    expect(buildStaffReplyEmail('xx', opts).subject).toBe('Vertex Support — our team replied');
  });
});
