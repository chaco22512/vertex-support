import type { LanguageCode } from '@vertex/shared';

/**
 * Canned escalation message used when the model output cannot be parsed and the
 * pipeline falls back to escalation (§4.2). One per supported UI language; the
 * customer's conversation language selects the string, defaulting to English.
 */
export const FALLBACK_ESCALATION_MESSAGE: Record<LanguageCode, string> = {
  en: 'Thank you. Our support staff will reply to you within 24 hours.',
  id: 'Terima kasih. Staf dukungan kami akan membalas Anda dalam waktu 24 jam.',
  tl: 'Salamat. Sasagutin kayo ng aming staff sa loob ng 24 oras.',
  ne: 'धन्यवाद। हाम्रो सहयोग टोलीले तपाईंलाई २४ घण्टाभित्र जवाफ दिनेछ।',
  vi: 'Cảm ơn bạn. Nhân viên hỗ trợ của chúng tôi sẽ trả lời bạn trong vòng 24 giờ.',
};

export function fallbackEscalationMessage(language: string): string {
  return FALLBACK_ESCALATION_MESSAGE[language as LanguageCode] ?? FALLBACK_ESCALATION_MESSAGE.en;
}

/**
 * ★2026-11-07: shown when the AI itself could not answer (usage limit, timeout,
 * model error). Natural wording — the customer is never told about the AI or
 * its limits; the conversation is escalated to staff as usual.
 */
export const BUSY_ESCALATION_MESSAGE: Record<LanguageCode, string> = {
  en: "We're receiving a lot of questions right now, so a member of our support team will help you directly. We'll reply within 24 hours.",
  id: 'Saat ini kami sedang menerima banyak pertanyaan, jadi staf dukungan kami akan membantu Anda secara langsung. Kami akan membalas dalam 24 jam.',
  tl: 'Marami kaming natatanggap na tanong ngayon, kaya isang staff namin ang direktang tutulong sa inyo. Sasagutin namin kayo sa loob ng 24 oras.',
  ne: 'अहिले धेरै प्रश्नहरू आइरहेका छन्, त्यसैले हाम्रो सहयोग टोलीको सदस्यले तपाईंलाई सिधै सहयोग गर्नेछ। हामी २४ घण्टाभित्र जवाफ दिनेछौं।',
  vi: 'Hiện tại chúng tôi đang nhận được rất nhiều câu hỏi, vì vậy nhân viên hỗ trợ sẽ trực tiếp giúp bạn. Chúng tôi sẽ trả lời trong vòng 24 giờ.',
};

export function busyEscalationMessage(language: string): string {
  return BUSY_ESCALATION_MESSAGE[language as LanguageCode] ?? BUSY_ESCALATION_MESSAGE.en;
}
