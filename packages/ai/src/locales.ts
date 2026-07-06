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
  return (
    FALLBACK_ESCALATION_MESSAGE[language as LanguageCode] ?? FALLBACK_ESCALATION_MESSAGE.en
  );
}
