import type { LanguageCode } from '@vertex/shared';

/** Customer email sent on staff reply (§8): 5 languages, plain wording (§5.5). */
export interface StaffReplyEmail {
  subject: string;
  html: string;
}

interface Copy {
  subject: string;
  greeting: string;
  body: string;
  cta: string;
}

// Kept short and plain per §5.5 (verb-first, middle-school English level for en).
const COPY: Record<LanguageCode, Copy> = {
  en: {
    subject: 'Vertex Support — our team replied',
    greeting: 'Hello,',
    body: 'Our support team has replied to your question.',
    cta: 'Open your chat',
  },
  id: {
    subject: 'Vertex Support — tim kami telah membalas',
    greeting: 'Halo,',
    body: 'Tim dukungan kami telah membalas pertanyaan Anda.',
    cta: 'Buka obrolan Anda',
  },
  tl: {
    subject: 'Vertex Support — sumagot na ang aming team',
    greeting: 'Kumusta,',
    body: 'Sumagot na ang aming support team sa iyong tanong.',
    cta: 'Buksan ang iyong chat',
  },
  ne: {
    subject: 'Vertex Support — हाम्रो टोलीले जवाफ दियो',
    greeting: 'नमस्ते,',
    body: 'हाम्रो सहयोग टोलीले तपाईंको प्रश्नको जवाफ दिएको छ।',
    cta: 'आफ्नो च्याट खोल्नुहोस्',
  },
  vi: {
    subject: 'Vertex Support — nhóm của chúng tôi đã trả lời',
    greeting: 'Xin chào,',
    body: 'Nhóm hỗ trợ của chúng tôi đã trả lời câu hỏi của bạn.',
    cta: 'Mở cuộc trò chuyện',
  },
};

/** Build the localized staff-reply email. `chatUrl` carries the session_token. */
export function buildStaffReplyEmail(
  language: string,
  opts: { chatUrl: string; logoUrl: string },
): StaffReplyEmail {
  const c = COPY[language as LanguageCode] ?? COPY.en;
  const html = [
    `<div style="font-family:'Noto Sans',system-ui,sans-serif;color:#1e262c;max-width:520px;margin:0 auto">`,
    `<img src="${opts.logoUrl}" alt="Vertex Digital Marketing" width="200" style="max-width:100%;margin-bottom:24px" />`,
    `<p lang="${language}">${c.greeting}</p>`,
    `<p lang="${language}">${c.body}</p>`,
    `<p><a href="${opts.chatUrl}" style="display:inline-block;background:#c81010;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px" lang="${language}">${c.cta}</a></p>`,
    `<p style="color:#6b7680;font-size:13px">Vertex Support</p>`,
    `</div>`,
  ].join('');
  return { subject: c.subject, html };
}
