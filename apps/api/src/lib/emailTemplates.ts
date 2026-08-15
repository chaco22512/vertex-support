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
    subject: 'SIM Point Support — our team replied',
    greeting: 'Hello,',
    body: 'Our support team has replied to your question.',
    cta: 'Open your chat',
  },
  id: {
    subject: 'SIM Point Support — tim kami telah membalas',
    greeting: 'Halo,',
    body: 'Tim dukungan kami telah membalas pertanyaan Anda.',
    cta: 'Buka obrolan Anda',
  },
  tl: {
    subject: 'SIM Point Support — sumagot na ang aming team',
    greeting: 'Kumusta,',
    body: 'Sumagot na ang aming support team sa iyong tanong.',
    cta: 'Buksan ang iyong chat',
  },
  ne: {
    subject: 'SIM Point Support — हाम्रो टोलीले जवाफ दियो',
    greeting: 'नमस्ते,',
    body: 'हाम्रो सहयोग टोलीले तपाईंको प्रश्नको जवाफ दिएको छ।',
    cta: 'आफ्नो च्याट खोल्नुहोस्',
  },
  vi: {
    subject: 'SIM Point Support — nhóm của chúng tôi đã trả lời',
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
    `<img src="${opts.logoUrl}" alt="SIM Point" width="200" style="max-width:100%;margin-bottom:24px" />`,
    `<p lang="${language}">${c.greeting}</p>`,
    `<p lang="${language}">${c.body}</p>`,
    `<p><a href="${opts.chatUrl}" style="display:inline-block;background:#c2410c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px" lang="${language}">${c.cta}</a></p>`,
    `<p style="color:#6b7680;font-size:13px">SIM Point Support</p>`,
    `</div>`,
  ].join('');
  return { subject: c.subject, html };
}

/**
 * Branded staff-invite email (§7.6, ★v1.7). Sent via Resend when a verified
 * sender is configured, so the invite reads as SIM Point (not Supabase) and
 * includes how-to steps. `actionLink` is the Supabase invite/set-password link.
 */
export function buildStaffInviteEmail(actionLink: string, name: string): { subject: string; html: string } {
  const subject = 'SIM Point chatbot support — set up your admin account';
  const html = [
    `<div style="font-family:'Noto Sans',system-ui,sans-serif;color:#1e262c;max-width:520px;margin:0 auto">`,
    `<h2 style="color:#c2410c">Welcome to SIM Point chatbot support${name ? `, ${name}` : ''}</h2>`,
    `<p>You've been invited to the admin console — the tool our team uses to answer customer questions and manage the chatbot's knowledge.</p>`,
    `<p><a href="${actionLink}" style="display:inline-block;background:#c2410c;color:#fff;text-decoration:none;padding:12px 20px;border-radius:10px">Set your password</a></p>`,
    `<h3 style="margin-bottom:6px">How to use it</h3>`,
    `<ol style="padding-left:18px;line-height:1.6">`,
    `<li>Click the button above and choose a password.</li>`,
    `<li>Sign in at the admin site with your email and that password.</li>`,
    `<li><b>Inbox</b> = customer questions waiting for a reply. <b>Knowledge</b> = the rules the bot answers from.</li>`,
    `<li>When a Slack notification links you here, you can reply within a few clicks.</li>`,
    `</ol>`,
    `<p style="color:#6b7680;font-size:13px">If you didn't expect this invitation, you can ignore this email.<br/>SIM Point chatbot support</p>`,
    `</div>`,
  ].join('');
  return { subject, html };
}
